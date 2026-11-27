"""Ubuntu adapter. No shell evaluation, remote SSH, pruning or in-place restore."""
from __future__ import annotations
import collections
import contextlib
import datetime
import hashlib
import json
import os
import pathlib
import re
import shutil
import socket
import stat
import subprocess
import time
import urllib.request
import urllib.parse
import uuid
from core import OperatorError, revision

Path = pathlib.Path
TABLE = re.compile(r"[a-z_][a-z0-9_]{0,62}")
APPEND_TABLES = {"schema_migrations", "migration_checksum", "content_version", "card_identity", "card_revision", "edition"}


def maintenance_storage(items):
    for item in items:
        if not isinstance(item, str) or not item.startswith("/app/.local:"):
            continue
        options = item.split(":", 1)[1].split(",")
        values = dict(option.split("=", 1) for option in options if "=" in option)
        return all(flag in options for flag in ("rw", "nosuid", "nodev")) and "ro" not in options and values.get("size", "").lower() in ("128m", "134217728") and values.get("mode") in ("0700", "700") and values.get("uid") == "1000" and values.get("gid") == "1000"
    return False


def sha(file):
    digest = hashlib.sha256()
    with open(file, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def write_json(file, value):
    file = Path(file)
    temporary = file.with_name(file.name + ".partial-" + uuid.uuid4().hex)
    with open(temporary, "x", encoding="utf-8") as stream:
        os.chmod(temporary, 0o600)
        json.dump(value, stream, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, file)


def read_env(file):
    """Literal, single-line dotenv values; never evaluate shell substitutions."""
    result = {}
    for line in Path(file).read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        match = re.fullmatch(r"([A-Z][A-Z0-9_]*)\s*=\s*(.*)", line)
        if not match or match[1] in result:
            raise OperatorError("A private environment file has unsupported syntax or duplicate keys; values were not printed.")
        key, value = match.groups()
        if value.startswith('"'):
            try:
                value = json.loads(value)
            except ValueError as error:
                raise OperatorError("Use a complete quoted literal for " + key) from error
        elif value.startswith("'"):
            if not value.endswith("'"):
                raise OperatorError("Unclosed private environment literal for " + key)
            value = value[1:-1]
        else:
            value = re.split(r"\s+#", value, maxsplit=1)[0].strip()
        if not isinstance(value, str) or "\n" in value or "\r" in value:
            raise OperatorError("Unsupported multiline environment value for " + key)
        result[key] = value
    return result


class Runner:
    def __init__(self, logfile):
        self.logfile = Path(logfile)

    def __call__(self, args, *, env=None, cwd=None, output=True, timeout=300):
        clean = {key: value for key, value in os.environ.items() if not key.startswith(("PG", "KINDRED_", "COMPOSE_", "DOCKER_"))}
        clean.update(env or {})
        with open(self.logfile, "a", encoding="utf-8") as log:
            log.write(json.dumps({"program": Path(str(args[0])).name, "startedAt": datetime.datetime.now(datetime.timezone.utc).isoformat()}) + "\n")
            try:
                result = subprocess.run([str(arg) for arg in args], cwd=cwd, env=clean, stdin=subprocess.DEVNULL, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout, check=False)
            except (OSError, subprocess.TimeoutExpired) as error:
                raise OperatorError("A required command could not finish; inspect the private operator log.") from error
            if output:
                log.write(result.stdout[-4_000_000:])
            log.write(result.stderr[-4_000_000:])
            log.write("\nexit=" + str(result.returncode) + "\n")
            if result.returncode:
                raise OperatorError(Path(str(args[0])).name + " failed. Inspect the private log; no automatic database rollback was attempted.")
            return result.stdout.strip()


class Postgres:
    def __init__(self, runner, binary, connection):
        self.run, self.binary, self.connection = runner, Path(binary), dict(connection)

    def copy(self, database):
        connection = {**self.connection, "PGDATABASE": database}
        return Postgres(self.run, self.binary, connection)

    def command(self, program, args):
        extension = ".exe" if os.name == "nt" else ""
        env = {key: self.connection[key] for key in ("PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD")}
        env.update(PGCONNECT_TIMEOUT="5", PGAPPNAME="kindred-operator", PGTZ="UTC", PGDATESTYLE="ISO,YMD")
        return self.run([self.binary / (program + extension), *args], env=env, output=False, timeout=1800)

    def sql(self, query):
        return self.command("psql", ["--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1", "--command", query])

    def rows(self, query):
        return json.loads(self.sql("SELECT coalesce(json_agg(row_to_json(q)), '[]'::json) FROM (" + query + ") q"))

    def identity(self):
        return self.rows("SELECT current_database() AS database,current_user AS username,inet_server_port() AS port,(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser,current_setting('server_version_num')::integer AS version")[0]

    def state(self):
        return {"identity": self.identity(), "migrations": self.rows("SELECT name,sha256 FROM kd.migration_checksum ORDER BY name"), "content": self.rows("SELECT v.id,v.digest,v.engine_version FROM kd.content_selection s JOIN kd.content_version v ON v.id=s.version_id")}

    def snapshot(self, specifications=None):
        tables = specifications if specifications is not None else [{"name": row["table_name"]} for row in self.rows("SELECT table_name FROM information_schema.tables WHERE table_schema='kd' AND table_type='BASE TABLE' ORDER BY table_name")]
        result = []
        for table in tables:
            name = table["name"]
            if not TABLE.fullmatch(name):
                raise OperatorError("Unexpected database table identifier.")
            columns = table.get("columns") or [row["column_name"] for row in self.rows("SELECT column_name FROM information_schema.columns WHERE table_schema='kd' AND table_name='" + name + "' ORDER BY ordinal_position")]
            if not columns or any(not TABLE.fullmatch(column) for column in columns):
                raise OperatorError("Unexpected database column identifier.")
            projection = ",".join('"' + column + '"::text AS "' + column + '"' for column in columns)
            hashes = self.sql('SELECT encode(sha256(convert_to(row_to_json(q)::text,\'UTF8\')),\'hex\') AS row_hash FROM (SELECT ' + projection + ' FROM kd."' + name + '") q ORDER BY row_hash').splitlines()
            result.append({"name": name, "columns": columns, "rows": hashes, "count": len(hashes), "sha256": hashlib.sha256("\n".join(hashes).encode()).hexdigest()})
        return result

    def compare(self, expected, *, after_publication=False):
        actual = {table["name"]: table for table in self.snapshot(expected)}
        for table in expected:
            name = table["name"]
            if after_publication and name == "content_selection":
                continue  # Explicit reviewed publication selects the proposed pack.
            before, after = collections.Counter(table["rows"]), collections.Counter(actual[name]["rows"])
            allowed_append = after_publication and name in APPEND_TABLES
            if (before - after) or (not allowed_append and before != after):
                raise OperatorError("Existing data preservation failed for " + name + "; no old database was restored over newer data.")
        return True


class Host:
    def __init__(self, configuration):
        self.config = json.loads(Path(configuration).read_text(encoding="utf-8"))
        c = self.config
        fixed = {"hostname": "homeserver", "lanAddress": "10.0.0.242", "base": "/srv/kindred-dominion", "repository": "/srv/kindred-dominion/source/repository", "privateDirectory": "/etc/kindred-dominion/test", "backupDirectory": "/srv/kindred-dominion/backups", "database": "kindred_dominion_test", "migrationRole": "kindred_test_migrator", "runtimeRole": "kindred_test_runtime", "network": "kindred-dominion-net", "subnet": "172.23.0.0/24", "bridge": "br-kindred", "frontendPort": 18083, "postgresBin": "/usr/lib/postgresql/18/bin"}
        if any(c.get(key) != value for key, value in fixed.items()):
            raise OperatorError("Operator configuration does not match the reviewed homeserver TEST target.")
        if os.name != "posix" or os.geteuid() != 0:
            raise OperatorError("Run the installed operator command with sudo on the reviewed Ubuntu host. No server connection was attempted.")
        if socket.gethostname().split(".")[0] != c["hostname"]:
            raise OperatorError("Hostname mismatch. No deployment operation was attempted.")
        release = dict(line.split("=", 1) for line in Path("/etc/os-release").read_text().splitlines() if "=" in line)
        if release.get("ID", "").strip('"') != "ubuntu" or release.get("VERSION_ID", "").strip('"') != "24.04":
            raise OperatorError("Ubuntu 24.04 is the reviewed operating system.")
        self.base = self.checked(c["base"])
        self.repo = self.checked(c["repository"])
        self.private = self.checked(c["privateDirectory"])
        self.backups = self.checked(c["backupDirectory"])
        self.releases, self.state_dir = self.base / "releases", self.base / "state"
        for directory in (self.releases, self.state_dir, self.state_dir / "logs", self.state_dir / "deployments"):
            directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            self.checked(str(directory))
            self.secure(directory)
        self.secure(self.private)
        self.secure(self.backups)
        self.secure(Path(configuration))
        if not re.fullmatch(r"[a-z][a-z0-9-]{0,99}", c.get("publishedContent", "")):
            raise OperatorError("Invalid reviewed content identifier.")
        self.run = Runner(self.state_dir / "logs" / (self.identifier() + ".log"))
        self.run.logfile.touch(mode=0o600, exist_ok=False)
        self.active_journal = None
        self.private_hashes = {}
        self.resume_context = None

    @staticmethod
    def checked(value):
        path = Path(value)
        if path.resolve() != path:
            raise OperatorError("Deployment paths must be canonical absolute directories, without symlink redirection.")
        return path

    @staticmethod
    def secure(path):
        info = path.stat()
        if info.st_uid != 0 or stat.S_IMODE(info.st_mode) & 0o077:
            raise OperatorError("Private operator storage must be root-owned and mode 0700/0600: " + str(path))

    @staticmethod
    def identifier():
        return datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ-") + uuid.uuid4().hex[:12]

    @contextlib.contextmanager
    def lock(self):
        import fcntl
        file = self.state_dir / "operator.lock"
        with open(file, "a+b") as stream:
            os.chmod(file, 0o600)
            try:
                fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as error:
                raise OperatorError("Another Kindred operator command holds the exclusive update lock.") from error
            try:
                yield
            finally:
                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)

    def git(self, args, directory=None):
        directory = directory or self.repo
        return self.run(["git", "-c", "safe.directory=" + str(directory), "-C", directory, *args], output=False)

    def private_files(self):
        return [self.private / "backend.env", self.private / "migrations.env", self.private / "compose.network.yaml", self.repo / "kindred-dominion/.env"]

    def preflight(self):
        addresses = json.loads(self.run(["ip", "-j", "address", "show"], output=False))
        if not any(address.get("local") == self.config["lanAddress"] for item in addresses for address in item.get("addr_info", [])):
            raise OperatorError("Expected LAN address is not assigned to this host.")
        if os.environ.get("DOCKER_HOST") or os.environ.get("DOCKER_CONTEXT"):
            raise OperatorError("Unset Docker host/context overrides; this operator only controls the local daemon.")
        context = json.loads(self.run(["docker", "context", "inspect"], output=False))[0]
        if context["Endpoints"]["docker"]["Host"] != "unix:///var/run/docker.sock":
            raise OperatorError("Docker context is not the reviewed local daemon.")
        network = json.loads(self.run(["docker", "network", "inspect", self.config["network"]], output=False))[0]
        if self.config["subnet"] not in [entry.get("Subnet") for entry in network["IPAM"]["Config"]] or network.get("Options", {}).get("com.docker.network.bridge.name") != self.config["bridge"]:
            raise OperatorError("The existing external Docker network does not match the reviewed subnet/bridge.")
        remote = self.git(["remote", "get-url", "origin"]).lower()
        if remote not in ("https://github.com/revty79/kindereddominion.git", "git@github.com:revty79/kindereddominion.git"):
            raise OperatorError("Unexpected repository origin.")
        if self.git(["status", "--porcelain", "--untracked-files=no"]):
            raise OperatorError("Tracked source is dirty. Preserve/review it; the updater never resets, stashes or cleans it.")
        for file in self.private_files():
            self.checked(str(file)); self.secure(file)
        self.backend_env, self.migration_env = read_env(self.private / "backend.env"), read_env(self.private / "migrations.env")
        for env, role in ((self.backend_env, self.config["runtimeRole"]), (self.migration_env, self.config["migrationRole"])):
            expected = {"APP_ENV": "test", "PGDATABASE": self.config["database"], "PGUSER": role, "PGPORT": "5432", "COOKIE_SECURE": "true", "FRONTEND_ORIGIN": self.config["approvedOrigin"]}
            if any(env.get(key) != value for key, value in expected.items()) or env.get("PGHOST") not in ("host.docker.internal", "172.23.0.1") or env.get("REGISTRATION_MODE") not in ("invite", "closed") or env.get("LOCAL_TEST_ACQUISITION", "false") != "false":
                raise OperatorError("Private environment does not match the reviewed TEST target, HTTPS origin or hosted security settings.")
            if not env.get("PGPASSWORD") or len(env.get("SESSION_SECRET", "")) < 43:
                raise OperatorError("Private database/session configuration is incomplete; credentials were not printed.")
        origin = urllib.parse.urlsplit(self.config["approvedOrigin"])
        if origin.scheme != "https" or not origin.hostname or origin.username or origin.password or origin.path or origin.query or origin.fragment:
            raise OperatorError("External readiness requires the approved HTTPS origin.")
        self.pg = Postgres(self.run, self.config["postgresBin"], {**self.migration_env, "PGHOST": "127.0.0.1"})
        identity = self.pg.identity()
        if identity["database"] != self.config["database"] or identity["username"] != self.config["migrationRole"] or identity["port"] != 5432 or identity["superuser"] or identity["version"] // 10000 != 18:
            raise OperatorError("Native PostgreSQL identity/privilege preflight failed.")
        guard = self.pg.rows("SELECT environment,disposable FROM kd.environment_guard WHERE singleton")[0]
        if guard != {"environment": "test", "disposable": False}:
            raise OperatorError("Database environment guard is not the expected hosted TEST guard.")
        roles = self.pg.rows("SELECT rolname,rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname IN ('kindred_test_runtime','kindred_test_migrator')")
        if len(roles) != 2 or any(row["rolsuper"] or row["rolcreatedb"] or row["rolcreaterole"] for row in roles):
            raise OperatorError("Runtime/migrator must be dedicated nonsuperuser roles without role/database creation.")
        if self.pg.sql("SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()") != self.config["migrationRole"] or self.pg.sql("SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='kd'") != self.config["migrationRole"]:
            raise OperatorError("The reviewed migration role must own the TEST database/schema before automatic grants can be applied.")
        size = int(self.pg.sql("SELECT pg_database_size(current_database())"))
        minimum = max(4 * 1024 ** 3, int(self.config.get("minimumFreeBytes", 0))) + 4 * size
        docker_root = self.run(["docker", "info", "--format", "{{.DockerRootDir}}"], output=False)
        for directory in (self.base, self.backups, Path(docker_root)):
            if shutil.disk_usage(directory).free < minimum:
                raise OperatorError("Insufficient free storage for images, source bundle, dump and isolated restore: " + str(directory))
        self.private_hashes = {str(file): sha(file) for file in self.private_files()}

    def recheck_private_configuration(self):
        if any(sha(file) != value for file, value in self.private_hashes.items()):
            raise OperatorError("Private configuration changed during the operation; no live migration may proceed.")
        current = self.pg.identity()
        if current["database"] != self.config["database"] or current["username"] != self.config["migrationRole"] or current["superuser"]:
            raise OperatorError("Database target changed before migration.")

    def composition(self, release, *, images=True):
        env = {"KINDRED_REVISION": release["revision"], "KINDRED_PORT": str(self.config["frontendPort"]), "KINDRED_BIND": "127.0.0.1", "KINDRED_BACKEND_ENV_FILE": str(self.private / "backend.env"), "KINDRED_MIGRATION_ENV_FILE": str(self.private / "migrations.env"), "KINDRED_CONTENT_ID": self.config["publishedContent"]}
        args = ["docker", "compose", "--project-name", "kindred-dominion", "--env-file", self.repo / "kindred-dominion/.env", "-f", Path(release["applicationDir"]) / "compose.yaml", "-f", self.private / "compose.network.yaml"]
        if images and release.get("images"):
            file = self.state_dir / ("images-" + release["revision"] + ".json")
            write_json(file, {"services": {name: {"image": image} for name, image in release["images"].items() if image}})
            args += ["-f", file]
        return args, env

    def compose(self, release, args, *, images=True, output=True):
        command, env = self.composition(release, images=images)
        return self.run([*command, *args], env=env, cwd=release["applicationDir"], output=output, timeout=1800)

    def current(self):
        file = self.state_dir / "current.json"
        if file.exists():
            result = json.loads(file.read_text())
            revision(result["revision"])
            observed = {}
            for service in ("game", "backend"):
                cid = self.compose(result, ["ps", "--all", "--quiet", service], output=False)
                if not cid or "\n" in cid:
                    raise OperatorError("Recorded application containers are missing; inspect the private state before proceeding.")
                image = self.run(["docker", "inspect", "--format", "{{.Image}}", cid], output=False)
                allowed = {result["images"][service]}
                if self.resume_context:
                    allowed.add(self.resume_context.get("candidate", {}).get("images", {}).get(service))
                if image not in allowed:
                    raise OperatorError("Actual application images differ from the private deployment receipt.")
                observed[service] = image
            result["observedImages"] = observed
            return result
        env = read_env(self.repo / "kindred-dominion/.env")
        result = {"revision": revision(env.get("KINDRED_REVISION", "")), "applicationDir": str(self.repo / "kindred-dominion"), "images": {}}
        for service in ("game", "backend"):
            cid = self.compose(result, ["ps", "--all", "--quiet", service], images=False, output=False)
            if not cid or "\n" in cid:
                raise OperatorError("Cannot identify exactly one existing Kindred " + service + " container.")
            labels = json.loads(self.run(["docker", "inspect", "--format", "{{json .Config.Labels}}", cid], output=False))
            if labels.get("com.docker.compose.project") != "kindred-dominion" or labels.get("com.docker.compose.service") != service:
                raise OperatorError("Existing application container labels do not match the Kindred project.")
            image = self.run(["docker", "inspect", "--format", "{{.Image}}", cid], output=False)
            if self.image_revision(image) != result["revision"]:
                raise OperatorError("Existing image revision does not match the recorded deployment.")
            result["images"][service] = image
        result["database"] = self.database_state()
        # The working repository may already have fetched/checked out newer
        # code. Preserve a clean checkout of the actual running image revision.
        result["applicationDir"] = self.source(result["revision"])["applicationDir"]
        result["deploymentId"] = self.identifier()
        write_json(file, result)
        write_json(self.state_dir / "deployments" / (result["deploymentId"] + ".release.json"), result)
        return result

    def image_revision(self, image):
        labels = json.loads(self.run(["docker", "image", "inspect", "--format", "{{json .Config.Labels}}", image], output=False))
        return labels.get("org.opencontainers.image.revision")

    def source(self, requested):
        self.git(["fetch", "--no-tags", "origin", "main"])
        self.git(["cat-file", "-e", requested + "^{commit}"])
        self.git(["merge-base", "--is-ancestor", requested, "origin/main"])
        root = self.releases / requested
        if not root.exists():
            self.git(["worktree", "add", "--detach", root, requested])
        if self.git(["rev-parse", "HEAD"], root) != requested or self.git(["status", "--porcelain", "--untracked-files=no"], root):
            raise OperatorError("Proposed release checkout is dirty or has the wrong revision; nothing was cleaned.")
        if Path(self.git(["rev-parse", "--show-toplevel"], root)).resolve() != root:
            raise OperatorError("Proposed release path escaped its isolated checkout.")
        app = root / "kindred-dominion"
        tracked = set(self.git(["ls-files", "-z"], app).split("\0"))
        registry = json.loads((app / "public/assets/manifest.json").read_text())
        for asset in registry["assets"]:
            for relative, digest in (("public/" + asset["path"], asset["sha256"]), (asset["source"]["path"], asset["source"]["sha256"])):
                file = (app / relative).resolve()
                if not file.is_relative_to(app) or relative not in tracked or sha(file) != digest:
                    raise OperatorError("Official source/runtime artwork is untracked, missing or corrupt.")
        return {"revision": requested, "applicationDir": str(app), "images": {}}

    def check_forward(self, old, candidate):
        self.git(["merge-base", "--is-ancestor", old["revision"], candidate["revision"]])

    def build(self, candidate):
        config = json.loads(self.compose(candidate, ["--profile", "maintenance", "config", "--format", "json"], images=False, output=False))
        if set(config["services"]) != {"game", "backend", "maintenance"}:
            raise OperatorError("Unexpected Compose services; only the three reviewed Kindred services may be operated.")
        for name, service in config["services"].items():
            if not service.get("read_only") or "ALL" not in service.get("cap_drop", []) or "no-new-privileges:true" not in service.get("security_opt", []):
                raise OperatorError("Compose container security settings were weakened.")
            if service.get("privileged") or service.get("cap_add") or service.get("devices") or service.get("volumes") or service.get("network_mode") or service.get("pid") or service.get("container_name"):
                raise OperatorError("Unexpected container privileges, host namespace, bind mounts or fixed container names.")
            if set(service.get("security_opt", [])) != {"no-new-privileges:true"}:
                raise OperatorError("Unexpected container security overrides.")
            if name != "game" and service.get("ports"):
                raise OperatorError("Private backend/maintenance ports must not be published.")
        ports = config["services"]["game"].get("ports", [])
        if len(ports) != 1 or ports[0].get("host_ip") != "127.0.0.1" or str(ports[0].get("published")) != "18083" or ports[0].get("target") != 8080:
            raise OperatorError("Frontend must retain its reviewed loopback bind and port.")
        network = config["networks"]["default"]
        if not network.get("external") or network.get("name") != self.config["network"]:
            raise OperatorError("The existing external network override must be preserved.")
        tmpfs = config["services"]["maintenance"].get("tmpfs", [])
        if not maintenance_storage(tmpfs):
            raise OperatorError("Preserve the reviewed private /app/.local maintenance tmpfs in compose.network.yaml.")
        repositories = {"game": "kindred-dominion", "backend": "kindred-dominion-backend", "maintenance": "kindred-dominion-maintenance"}
        existing = self.run(["docker", "image", "ls", "--format", "{{.Repository}}:{{.Tag}}"], output=False).splitlines()
        for service, repository in repositories.items():
            tag = repository + ":" + candidate["revision"]
            if tag not in existing:
                self.compose(candidate, ["--profile", "maintenance", "build", service], images=False)
            if self.image_revision(tag) != candidate["revision"]:
                raise OperatorError("Immutable image tag has mismatched provenance; it was not overwritten.")
            user = self.run(["docker", "image", "inspect", "--format", "{{.Config.User}}", tag], output=False)
            if user != ("101:101" if service == "game" else "1000:1000"):
                raise OperatorError("Replacement images must retain their nonroot users.")
            candidate["images"][service] = self.run(["docker", "image", "inspect", "--format", "{{.Id}}", tag], output=False)
        # No database credentials or networking are supplied to source/unit validation.
        self.run(["docker", "run", "--rm", "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", "--tmpfs", "/tmp:rw,nosuid,nodev,size=256m,mode=1777", "--tmpfs", "/app/.local:rw,nosuid,nodev,size=128m,mode=0700,uid=1000,gid=1000", "--tmpfs", "/app/node_modules/.vite:rw,nosuid,nodev,size=128m,mode=0700,uid=1000,gid=1000", "--entrypoint", "node", candidate["images"]["maintenance"], "node_modules/vitest/vitest.mjs", "run", "--maxWorkers=1", "--no-file-parallelism"], timeout=1800)
        self.run(["docker", "run", "--rm", "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", "--entrypoint", "node", candidate["images"]["backend"], "-e", "const fs=require('fs'),crypto=require('crypto');const m=JSON.parse(fs.readFileSync('/app/dist-control/control-manifest.json'));if(m.format!=='kindred-protected-control'||m.revision!==process.argv[1])process.exit(1);for(const f of m.files){const b=fs.readFileSync('/app/dist-control/'+f.path);if(crypto.createHash('sha256').update(b).digest('hex')!==f.sha256)process.exit(1);}", candidate["revision"]])
        candidate["validatedBeforeDowntime"] = True
        root = Path(candidate["applicationDir"]).parent
        if self.git(["rev-parse", "HEAD"], root) != candidate["revision"] or self.git(["status", "--porcelain", "--untracked-files=no"], root):
            raise OperatorError("Proposed tracked source changed during the build. Working services were not stopped.")

    def database_state(self):
        return self.pg.state()

    def no_other_writers(self):
        for _ in range(30):
            rows = self.pg.rows("SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend'")
            if not rows:
                return
            time.sleep(0.2)
        raise OperatorError("Other clients remain connected to TEST. Stop/review those writers explicitly; no sessions were terminated automatically.")

    def stop(self, release):
        self.compose(release, ["stop", "game", "backend"])

    def start(self, release):
        self.recheck_private_configuration()
        revision(release["revision"])
        directory = self.checked(release["applicationDir"])
        if directory != self.repo / "kindred-dominion" and directory != self.releases / release["revision"] / "kindred-dominion":
            raise OperatorError("Release application path does not match its recorded immutable revision.")
        if self.git(["rev-parse", "HEAD"], directory) != release["revision"] or self.git(["status", "--porcelain", "--untracked-files=no"], directory):
            raise OperatorError("Release checkout is missing, dirty or changed. No images were started.")
        for name in ("game", "backend"):
            if not re.fullmatch(r"sha256:[a-f0-9]{64}", release["images"].get(name, "")) or self.image_revision(release["images"][name]) != release["revision"]:
                raise OperatorError("Pinned release image is missing or has incorrect provenance.")
        self.compose(release, ["up", "--detach", "--no-build", "--wait", "--wait-timeout", str(self.config.get("healthTimeoutSeconds", 180)), "game", "backend"])

    def backup(self, old, recovery_source):
        directory = self.backups / self.identifier()
        directory.mkdir(mode=0o700)
        snapshot = self.pg.snapshot()
        write_json(directory / "database.snapshot.json", snapshot)
        self.pg.command("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--file", directory / "database.dump"])
        os.chmod(directory / "database.dump", 0o600)
        self.pg.command("pg_restore", ["--list", directory / "database.dump"])
        self.git(["bundle", "create", directory / "source.bundle", "--all"])
        os.chmod(directory / "source.bundle", 0o600)
        self.git(["bundle", "verify", directory / "source.bundle"])
        receipt = {"directory": str(directory), "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "target": self.pg.identity(), "source": recovery_source, "previousApplication": old, "database": self.database_state(), "assetManifestSha256": sha(Path(recovery_source["applicationDir"]) / "public/assets/manifest.json"), "dumpSha256": sha(directory / "database.dump"), "snapshotSha256": sha(directory / "database.snapshot.json"), "bundleSha256": sha(directory / "source.bundle"), "privateConfigurationFingerprints": self.private_hashes, "archiveListVerified": True, "sourceBundleVerified": True}
        write_json(directory / "receipt.json", receipt)
        return receipt

    def restore(self, backup, prefix="kd_rehearsal_"):
        directory = Path(backup["directory"]).resolve()
        if not directory.is_relative_to(self.backups) or directory == self.backups:
            raise OperatorError("Recovery input must be a specific private backup directory.")
        if backup["target"]["database"] != self.config["database"] or backup["target"]["username"] != self.config["migrationRole"] or backup["target"]["port"] != 5432 or backup["target"]["superuser"]:
            raise OperatorError("Backup receipt belongs to another database target or role.")
        for file, key in (("database.dump", "dumpSha256"), ("database.snapshot.json", "snapshotSha256"), ("source.bundle", "bundleSha256")):
            if sha(directory / file) != backup[key]:
                raise OperatorError("Backup integrity verification failed for " + file)
        name = prefix + uuid.uuid4().hex[:20]
        if prefix not in ("kd_rehearsal_", "kd_recovery_") or not TABLE.fullmatch(name) or name == self.config["database"]:
            raise OperatorError("Unsafe isolated database name.")
        # Local peer-authenticated DBA creates ONLY this new random database.
        self.run(["runuser", "-u", "postgres", "--", Path(self.config["postgresBin"]) / "createdb", "--host=/var/run/postgresql", "--owner=" + self.config["migrationRole"], "--template=template0", name], output=False)
        restored = self.pg.copy(name)
        restored.command("pg_restore", ["--exit-on-error", "--no-owner", "--no-privileges", "--dbname", name, directory / "database.dump"])
        snapshot = json.loads((directory / "database.snapshot.json").read_text())
        restored.compare(snapshot)
        write_json(directory / (name + ".restore.json"), {"database": name, "originalDatabaseUntouched": True, "allRowsAndOriginalColumnsIdentical": True, "sourceDatabase": backup["target"]["database"]})
        return restored, snapshot

    def maintenance(self, release, args, database=None):
        command, env = self.composition(release)
        extra = ["--env", "PGDATABASE=" + database] if database else []
        self.run([*command, "--profile", "maintenance", "run", "--rm", "--no-deps", "--label", "kindred.operator.run=" + (self.active_journal or "manual"), *extra, "maintenance", *args, "--allow-environment=test"], env=env, cwd=release["applicationDir"], timeout=1800)

    def rehearse(self, backup, candidate, *, migrate):
        restored, snapshot = self.restore(backup)
        name = restored.connection["PGDATABASE"]
        if migrate:
            self.maintenance(candidate, ["migrate"], name)
            self.maintenance(candidate, ["seed", "--source-archive"], name)
            self.maintenance(candidate, ["seed", "--source-archive", "--activate", "--file=src/content/published/" + self.config["publishedContent"] + ".json"], name)
            self.grants(restored)
            restored.compare(snapshot, after_publication=True)
            self.maintenance(candidate, ["status"], name)
        result = {"database": name, "restoreVerified": True, "migrationsRehearsed": migrate, "sourceDatabaseUntouched": True, "result": restored.state()}
        write_json(Path(backup["directory"]) / (name + ".rehearsal.json"), result)
        return result

    def migrate(self, candidate):
        self.recheck_private_configuration()
        self.no_other_writers()
        self.maintenance(candidate, ["migrate"])

    def publish(self, candidate):
        self.maintenance(candidate, ["seed", "--source-archive"])
        content = self.config["publishedContent"]
        if not re.fullmatch(r"[a-z][a-z0-9-]{0,99}", content):
            raise OperatorError("Invalid reviewed content identifier.")
        self.maintenance(candidate, ["seed", "--source-archive", "--activate", "--file=src/content/published/" + content + ".json"])

    def grants(self, database=None):
        pg = database or self.pg
        name = pg.connection["PGDATABASE"]
        if name != self.config["database"] and not re.fullmatch(r"kd_(rehearsal|recovery)_[a-f0-9]{20}", name):
            raise OperatorError("Runtime grants target is outside TEST or this operation's isolated copy.")
        pg.sql('GRANT CONNECT ON DATABASE "' + name + '" TO kindred_test_runtime; GRANT USAGE ON SCHEMA kd TO kindred_test_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA kd TO kindred_test_runtime; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA kd TO kindred_test_runtime; ALTER DEFAULT PRIVILEGES FOR ROLE kindred_test_migrator IN SCHEMA kd GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO kindred_test_runtime; ALTER DEFAULT PRIVILEGES FOR ROLE kindred_test_migrator IN SCHEMA kd GRANT USAGE,SELECT ON SEQUENCES TO kindred_test_runtime;')
        invalid = pg.rows("SELECT tablename FROM pg_tables WHERE schemaname='kd' AND NOT (has_table_privilege('kindred_test_runtime','kd.'||quote_ident(tablename),'SELECT') AND has_table_privilege('kindred_test_runtime','kd.'||quote_ident(tablename),'INSERT') AND has_table_privilege('kindred_test_runtime','kd.'||quote_ident(tablename),'UPDATE') AND has_table_privilege('kindred_test_runtime','kd.'||quote_ident(tablename),'DELETE'))")
        if invalid or pg.sql("SELECT has_schema_privilege('kindred_test_runtime','kd','CREATE') OR pg_has_role('kindred_test_runtime','kindred_test_migrator','MEMBER')") != "f":
            raise OperatorError("Runtime privilege verification failed; no runtime owner/DDL membership is permitted.")

    def verify_preservation(self, backup):
        self.pg.compare(json.loads((Path(backup["directory"]) / "database.snapshot.json").read_text()), after_publication=True)
        selected = self.pg.state()["content"]
        if len(selected) != 1 or selected[0]["id"] != self.config["publishedContent"]:
            raise OperatorError("Reviewed published content was not selected.")

    def verify_healthy(self, release):
        for service in ("game", "backend"):
            cid = self.compose(release, ["ps", "--quiet", service], output=False)
            health = self.run(["docker", "inspect", "--format", "{{.State.Health.Status}}", cid], output=False)
            image = self.run(["docker", "inspect", "--format", "{{.Image}}", cid], output=False)
            if health != "healthy" or image != release["images"][service]:
                raise OperatorError("Application container health/image verification failed.")
        for origin in ("http://127.0.0.1:18083", self.config["approvedOrigin"]):
            try:
                with urllib.request.urlopen(origin + "/readyz", timeout=15) as response:
                    if json.load(response).get("status") != "ready":
                        raise ValueError()
            except Exception as error:
                raise OperatorError("Readiness failed for the expected local/HTTPS endpoint. The tunnel was not restarted.") from error
        # New releases expose a non-secret immutable source marker. Bootstrap
        # V1.4 can be resumed without inventing a marker it never shipped.
        if release.get("validatedBeforeDowntime"):
            for origin in ("http://127.0.0.1:18083", self.config["approvedOrigin"]):
                try:
                    with urllib.request.urlopen(origin + "/.well-known/kindred-release.json", timeout=15) as response:
                        if json.load(response).get("revision") != release["revision"]:
                            raise ValueError()
                except Exception as error:
                    raise OperatorError("The ready endpoint does not serve the requested source revision.") from error

    def safe_to_resume(self, old):
        try:
            self.recheck_private_configuration()
            state = self.database_state()
            return state["migrations"] == old["database"]["migrations"] and state["content"] == old["database"]["content"]
        except BaseException:
            return False

    def journal(self, operation, requested, previous):
        identifier = self.identifier()
        self.active_journal = identifier
        result = {"id": identifier, "operation": operation, "requestedRevision": requested, "previous": previous, "databaseMayHaveChanged": False, "log": str(self.run.logfile)}
        if self.resume_context:
            result["databaseMayHaveChanged"] = True
            result["resumedFrom"] = self.resume_context.get("id")
            result["candidate"] = self.resume_context.get("candidate", {})
        self.phase(result, "preflight-complete")
        return result

    def phase(self, journal, phase):
        journal["phase"] = phase
        journal["updatedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        write_json(self.state_dir / "deployments" / (journal["id"] + ".json"), journal)
        write_json(self.state_dir / "latest.json", journal)
        print("Kindred: " + phase, flush=True)

    def require_recoverable(self, requested, resume):
        file = self.state_dir / "latest.json"
        if not file.exists():
            return
        last = json.loads(file.read_text())
        unresolved = last.get("databaseMayHaveChanged") and last.get("phase") != "completed"
        if unresolved and (not resume or requested != last["requestedRevision"]):
            raise OperatorError("An unresolved post-migration failure exists. Inspect kindred-status and explicitly resume the same reviewed revision, or prepare separate-database recovery.")
        if unresolved:
            self.resume_context = last
        elif (self.state_dir / "current.json").exists():
            expected = json.loads((self.state_dir / "current.json").read_text())["database"]
            actual = self.database_state()
            if actual["migrations"] != expected["migrations"] or actual["content"] != expected["content"]:
                raise OperatorError("Database schema/content differs from the recorded deployment. Inspect and reconcile through trusted recovery first.")

    def complete(self, release, journal):
        release["deploymentId"] = journal["id"]
        release["privateConfigurationFingerprints"] = self.private_hashes
        write_json(self.state_dir / "current.json", release)
        write_json(self.state_dir / "deployments" / (journal["id"] + ".release.json"), release)

    def rollback(self, identifier):
        if not re.fullmatch(r"\d{8}T\d{6}Z-[a-f0-9]{12}", identifier):
            raise OperatorError("Select an exact recorded deployment ID.")
        target_file = self.state_dir / "deployments" / (identifier + ".release.json")
        if not target_file.exists():
            raise OperatorError("Recorded immutable release was not found.")
        target = json.loads(target_file.read_text())
        if self.database_state() != target["database"]:
            raise OperatorError("Schema/content-incompatible rollback refused. Use --prepare-recovery with the matching backup; newer player data will not be deleted.")
        previous = self.current()
        journal = self.journal("compatible-rollback", target["revision"], previous)
        try:
            self.phase(journal, "stopping-application-writers")
            self.stop(previous)
            self.no_other_writers()
            self.phase(journal, "verified-safety-backup")
            safety = self.backup(previous, previous)
            journal["backup"] = safety["directory"]
            self.rehearse(safety, previous, migrate=False)
            self.phase(journal, "starting-compatible-images")
            self.start(target)
            self.verify_healthy(target)
            self.complete(target, journal)
            self.phase(journal, "completed")
        except BaseException as error:
            try:
                self.stop(target)
                if self.safe_to_resume(previous):
                    self.start(previous)
                    self.verify_healthy(previous)
                    journal["previousApplicationResumed"] = True
            except BaseException:
                pass
            self.phase(journal, "failed-compatible-rollback")
            raise OperatorError("Compatible image rollback failed; inspect the private journal. No database restoration occurred.") from error
        return {"revision": target["revision"], "databaseRestored": False, "safetyBackup": safety["directory"]}

    def prepare_recovery(self, directory):
        directory = Path(directory).resolve()
        if not directory.is_relative_to(self.backups) or directory == self.backups:
            raise OperatorError("Choose a specific verified backup under the private backup directory.")
        backup = json.loads((directory / "receipt.json").read_text())
        if Path(backup["directory"]).resolve() != directory:
            raise OperatorError("Backup receipt path mismatch.")
        previous_state = backup["previousApplication"]["database"]
        if previous_state["migrations"] != backup["database"]["migrations"] or previous_state["content"] != backup["database"]["content"]:
            raise OperatorError("This backup has a partially migrated database and cannot boot its previous application. Select a pre-update compatible backup or resume the reviewed candidate.")
        latest_file = self.state_dir / "latest.json"
        latest = json.loads(latest_file.read_text()) if latest_file.exists() else {}
        self.resume_context = latest if latest.get("databaseMayHaveChanged") and latest.get("phase") != "completed" else None
        old = self.current()
        self.stop(old)
        self.no_other_writers()
        recovery_source = (self.resume_context or {}).get("candidate", old)
        safety = self.backup(old, recovery_source)
        # Verify preservation of newer data in a separate copy before offering
        # any manual cutover to the selected older snapshot.
        safety_restore = self.rehearse(safety, recovery_source, migrate=False)
        restored, _ = self.restore(backup, "kd_recovery_")
        self.grants(restored)
        plan = {"id": self.identifier(), "selectedBackup": str(directory), "safetyBackup": safety["directory"], "newerDataRestoreVerified": safety_restore, "recoveryDatabase": restored.connection["PGDATABASE"], "sourceDatabase": self.config["database"], "databaseRenamedOrReplaced": False, "writersStopped": True, "manualDbaCutoverRequired": True}
        write_json(self.state_dir / ("recovery-" + plan["id"] + ".json"), plan)
        return plan

    def complete_recovery(self, identifier, preserved_database):
        if not re.fullmatch(r"\d{8}T\d{6}Z-[a-f0-9]{12}", identifier) or not re.fullmatch(r"kindred_dominion_test_preserved_[0-9]{14}", preserved_database):
            raise OperatorError("Use the exact recovery plan ID and explicitly preserved newer database name.")
        plan = json.loads((self.state_dir / ("recovery-" + identifier + ".json")).read_text())
        selected = json.loads((Path(plan["selectedBackup"]) / "receipt.json").read_text())
        safety = json.loads((Path(plan["safetyBackup"]) / "receipt.json").read_text())
        self.no_other_writers()
        # Both databases must still exactly contain their respective snapshots.
        # No database rename/drop, credential replacement or data overwrite is
        # performed by this command.
        self.pg.copy(preserved_database).compare(json.loads((Path(safety["directory"]) / "database.snapshot.json").read_text()))
        self.pg.compare(json.loads((Path(selected["directory"]) / "database.snapshot.json").read_text()))
        state = self.database_state()
        if state["migrations"] != selected["database"]["migrations"] or state["content"] != selected["database"]["content"]:
            raise OperatorError("The manually selected recovery database does not match its source/schema receipt.")
        self.recheck_private_configuration()
        self.grants()
        latest_file = self.state_dir / "latest.json"
        latest = json.loads(latest_file.read_text()) if latest_file.exists() else {}
        self.resume_context = latest if latest.get("databaseMayHaveChanged") and latest.get("phase") != "completed" else None
        previous = self.current()
        target = selected["previousApplication"]
        target["database"] = state
        self.start(target)
        self.verify_healthy(target)
        journal = self.journal("explicit-recovery-cutover", target["revision"], previous)
        journal["preservedNewerDatabase"] = preserved_database
        journal["selectedBackup"] = selected["directory"]
        self.complete(target, journal)
        self.phase(journal, "completed")
        return {"recoveredRevision": target["revision"], "preservedNewerDatabase": preserved_database, "databaseDeleted": False}
