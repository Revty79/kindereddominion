"""Real PG18 regression in a fresh networkless container. Never a host DB tool.

Production Host backup/restore/rehearse/grants/preservation run unchanged. Only
the local peer-DBA transport and Docker maintenance transport are substituted
by this fresh cluster's private TCP DBA and the identical compiled Node CLI.
"""
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import time
import urllib.request
import uuid
from core import OperatorError
from host import Host, Postgres, Runner, write_json

ROOT, APP, BIN = Path("/proof"), Path("/app"), Path("/usr/lib/postgresql/18/bin")
REDACT = set()
LEGACY_AUDIT = "SELECT tablename FROM pg_tables WHERE schemaname='kd' AND NOT (has_table_privilege('kindred_test_runtime','kd.'||quote_ident(tablename),'SELECT') AND has_table_privilege('kindred_test_runtime','kd.'||quote_ident(tablename),'INSERT') AND has_table_privilege('kindred_test_runtime','kd.'||quote_ident(tablename),'UPDATE') AND has_table_privilege('kindred_test_runtime','kd.'||quote_ident(tablename),'DELETE'))"


def must_fail(operation, description):
    try:
        operation()
    except OperatorError:
        return
    raise OperatorError("Regression failed to detect " + description)


class FixtureHost(Host):
    def __init__(self, runner, admin, pg, environment):
        # Do not relax or invoke production host preflight. This fixture has no
        # Docker socket, shared database, host credentials or published ports.
        self.admin, self.pg, self.cli_environment = admin, pg, environment
        self.runner, self.active_journal, self.private_hashes = runner, "pg18-proof", {}
        self.repo, self.backups = Path("/source"), ROOT / "backups"
        self.backups.mkdir(mode=0o700)
        self.config = {"database": "kindred_dominion_test", "migrationRole": "kindred_test_migrator", "runtimeRole": "kindred_test_runtime", "postgresBin": str(BIN), "publishedContent": "founding-kindreds-artwork-v1"}
        self.maintenance_calls = []

    def run(self, args, **kwargs):
        if str(args[0]) == "runuser":
            if str(args[4]) != str(BIN / "createdb") or not str(args[-1]).startswith(("kd_rehearsal_", "kd_recovery_")):
                raise OperatorError("Unexpected fixture DBA command")
            return self.admin.command("createdb", ["--owner=kindred_test_migrator", "--template=template0", str(args[-1])])
        return self.runner(args, **kwargs)

    def maintenance(self, release, args, database=None):
        selected = database or self.pg.connection["PGDATABASE"]
        self.maintenance_calls.append((args[0], selected))
        cli = release.get("fixtureCli", str(APP / "server-dist/cli.mjs"))
        return self.runner(["node", cli, *args, "--allow-environment=test"], cwd=APP, env={**self.cli_environment, "PGDATABASE": selected}, output=False)


def reproduce(pg):
    failures = []
    for settings in ("", "SET enable_nestloop=off; SET enable_mergejoin=off; "):
        result = subprocess.run([str(BIN / "psql"), "-X", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-c", settings + LEGACY_AUDIT], env={**os.environ, **pg.connection}, text=True, capture_output=True, check=False)
        if result.returncode and "42P01" in result.stderr and 'relation "kd.pg_' in result.stderr:
            failures.append(result.stderr)
    if not failures:
        raise OperatorError("The original PostgreSQL 18 audit failure was not reproduced")
    exact = subprocess.run([str(BIN / "psql"), "-X", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-c", "SELECT has_table_privilege('kindred_test_runtime','kd.'||quote_ident(tablename),'SELECT') FROM pg_catalog.pg_tables WHERE schemaname='pg_catalog' AND tablename='pg_statistic'"], env={**os.environ, **pg.connection}, text=True, capture_output=True, check=False)
    if not exact.returncode or 'relation "kd.pg_statistic" does not exist' not in exact.stderr or "42P01" not in exact.stderr:
        raise OperatorError("The reported kd.pg_statistic lookup was not reproduced")
    return {"originalAuditFailed": True, "sqlState": "42P01", "reportedRelationReproduced": "kd.pg_statistic", "plannerVariantsFailing": len(failures)}


def main():
    if not Path("/.dockerenv").exists() or os.geteuid() != 1000 or ROOT.resolve() != ROOT or (ROOT / "data").exists():
        raise OperatorError("Run only in the documented fresh, nonroot, networkless proof container")
    ROOT.mkdir(mode=0o700, exist_ok=True)
    runner = Runner(ROOT / "operator.private.log")
    password = secrets.token_urlsafe(48)
    REDACT.add(password)
    password_file = ROOT / "password.private"
    password_file.write_text(password); os.chmod(password_file, 0o600)
    runner([BIN / "initdb", "-D", ROOT / "data", "-U", "kd_proof_admin", "--auth-host=scram-sha-256", "--auth-local=scram-sha-256", "--pwfile=" + str(password_file), "--encoding=UTF8", "--locale=C"], output=False)
    started, backend = False, None
    try:
        runner([BIN / "pg_ctl", "-D", ROOT / "data", "-l", ROOT / "postgres.private.log", "-o", "-h 127.0.0.1 -p 5432 -k /proof -c shared_buffers=32MB -c max_connections=30", "-w", "start"], output=False)
        started = True
        connection = {"PGHOST": "127.0.0.1", "PGPORT": "5432", "PGDATABASE": "postgres", "PGUSER": "kd_proof_admin", "PGPASSWORD": password}
        admin = Postgres(runner, BIN, connection)
        if admin.identity()["version"] // 10000 != 18:
            raise OperatorError("Regression requires actual PostgreSQL 18")
        setup = ROOT / "roles.private.sql"
        setup.write_text("CREATE ROLE kindred_test_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '" + password + "'; CREATE ROLE kindred_test_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '" + password + "'; CREATE DATABASE kindred_dominion_test OWNER kindred_test_migrator;")
        os.chmod(setup, 0o600)
        admin.command("psql", ["-X", "--set=ON_ERROR_STOP=1", "--file", setup])
        pg = Postgres(runner, BIN, {**connection, "PGDATABASE": "kindred_dominion_test", "PGUSER": "kindred_test_migrator"})
        env = {**pg.connection, "APP_ENV": "test", "KINDRED_ENV_FILE": "/proof/absent.env", "SESSION_SECRET": secrets.token_urlsafe(48), "FRONTEND_ORIGIN": "https://proof.kindred.invalid", "COOKIE_SECURE": "true", "REGISTRATION_MODE": "closed", "LOCAL_TEST_ACQUISITION": "false", "API_HOST": "127.0.0.1", "API_PORT": "3001", "LOG_LEVEL": "silent"}
        REDACT.add(env["SESSION_SECRET"])
        host = FixtureHost(runner, admin, pg, env)
        revision = host.git(["rev-parse", "HEAD"])
        release = {"revision": revision, "applicationDir": str(APP), "images": {}}
        print("PG18 proof: initializing current application schema and official content", flush=True)
        host.maintenance(release, ["migrate"])
        Host.publish(host, release)
        legacy = reproduce(pg)
        print("PG18 proof: reproduced legacy catalog-name failure", flush=True)
        player, deck, acquisition, match = [str(uuid.uuid4()) for _ in range(4)]
        pg.sql("""
CREATE TABLE kd.pg_app_probe(id integer, payload text);
INSERT INTO kd.pg_app_probe VALUES(1,'application row despite pg prefix');
CREATE SCHEMA outside_app; CREATE TABLE outside_app.player(id integer);
CREATE VIEW kd.probe_view AS SELECT * FROM kd.pg_app_probe;
CREATE MATERIALIZED VIEW kd.probe_materialized AS SELECT * FROM kd.pg_app_probe;
CREATE SEQUENCE kd.probe_sequence;
CREATE TABLE kd.probe_partitioned(id integer,payload text) PARTITION BY RANGE(id);
CREATE TABLE kd.probe_partition0 PARTITION OF kd.probe_partitioned FOR VALUES FROM(0) TO(10);
INSERT INTO kd.probe_partitioned VALUES(1,'partition data');
CREATE TABLE kd.probe_duplicates(payload text); INSERT INTO kd.probe_duplicates VALUES('same'),('same');
CREATE TABLE kd.probe_columns(id integer,discarded text,payload text);
ALTER TABLE kd.probe_columns DROP COLUMN discarded;
INSERT INTO kd.probe_columns(id,payload) VALUES(1,'retained column');
""")
        pg.sql(f"""
INSERT INTO kd.player(id,username,display_name,password_hash,starting_kindred) VALUES('{player}','proof_player','Preserved player','fixture-not-a-login-hash','nature');
INSERT INTO kd.session(token_hash,player_id,csrf,expires_at) VALUES('fixture-session','{player}','fixture-csrf',now()+interval '1 day');
INSERT INTO kd.progression_extension(player_id,experience,level,currency) VALUES('{player}',51,2,7);
INSERT INTO kd.deck(id,player_id,name,version_id,config) SELECT '{deck}','{player}','Preserved deck',version_id,'{{"fixture":true}}' FROM kd.content_selection;
UPDATE kd.player SET default_deck_id='{deck}' WHERE id='{player}';
INSERT INTO kd.deck_card(deck_id,slot,card_id,edition_id) SELECT '{deck}',0,card_id,id FROM kd.edition WHERE card_id='n001' ORDER BY id LIMIT 1;
INSERT INTO kd.deck_history(deck_id,revision,snapshot) VALUES('{deck}',1,'{{"fixture":true}}');
INSERT INTO kd.acquisition(id,player_id,idempotency_key,fingerprint,source,result) VALUES('{acquisition}','{player}','proof-acquisition','fixture-fingerprint','fixture','{{}}');
INSERT INTO kd.inventory(player_id,edition_id,quantity) SELECT '{player}',id,1 FROM kd.edition WHERE card_id='n001' ORDER BY id LIMIT 1;
INSERT INTO kd.inventory_entry(acquisition_id,edition_id,delta,resulting_quantity) SELECT '{acquisition}',id,1,1 FROM kd.edition WHERE card_id='n001' ORDER BY id LIMIT 1;
INSERT INTO kd.studio_workspace(player_id,revision,workspace) VALUES('{player}',1,'{{ "fixture" : true }}');
INSERT INTO kd.match(id,player_id,opponent_type,version_id,engine_version,config,decks,seed,starting_player,state,record,status) SELECT '{match}','{player}','computer',v.id,v.engine_version,'{{}}','[]',1,0,'{{ "fixture" : true }}','{{ "fixture" : true }}','playing' FROM kd.content_selection s JOIN kd.content_version v ON v.id=s.version_id;
INSERT INTO kd.match_action(match_id,sequence,request_id,action,signature) VALUES('{match}',0,'fixture-request','{{}}','fixture-signature');
INSERT INTO kd.invite(token_hash,max_uses,expires_at) VALUES('fixture-invite',1,now()+interval '1 day');
""")
        Host.grants(host)
        before = pg.snapshot()
        names = {table["name"] for table in before}
        required = {"player", "inventory", "session", "deck", "match", "studio_workspace", "pg_app_probe", "probe_partitioned", "probe_partition0", "probe_duplicates", "probe_columns"}
        if not required <= names or names & {"pg_statistic", "probe_view", "probe_materialized", "probe_sequence"}:
            raise OperatorError("Application relation discovery included catalogs/caches or missed application data")
        source_state = pg.state()
        source_calls = len(host.maintenance_calls)
        backup = Host.backup(host, release, release)
        # Keep ESM's ancestor node_modules resolution inside /app. The CLI
        # and fixture migration remain on the dedicated writable tmpfs.
        cli = APP / ".local/pg18-candidate-cli"; cli.mkdir()
        shutil.copyfile(APP / "server-dist/cli.mjs", cli / "cli.mjs")
        shutil.copytree(APP / "server-dist/migrations", cli / "migrations")
        (cli / "migrations/1795900000000_rehearsal_probe.cjs").write_text("exports.up=pgm=>pgm.sql('ALTER TABLE kd.invite ADD COLUMN proof_additive text; CREATE TABLE kd.proof_new_table(id integer);');exports.down=()=>{};\n")
        candidate = {**release, "fixtureCli": str(cli / "cli.mjs")}
        print("PG18 proof: real backup, isolated restore, additive migration, publish, grants and row verification", flush=True)
        rehearsal = Host.rehearse(host, backup, candidate, migrate=True)
        restored = pg.copy(rehearsal["database"])
        if len(restored.state()["migrations"]) != len(source_state["migrations"]) + 1:
            raise OperatorError("Additive fixture migration did not execute")
        if [call[0] for call in host.maintenance_calls[source_calls:]] != ["migrate", "seed", "seed", "status"]:
            raise OperatorError("Complete rehearsal maintenance order changed")
        # Exercise the database checks used after live publication, on the
        # restored disposable copy only; the original source never migrates.
        host.pg = restored
        Host.publish(host, candidate); Host.grants(host); Host.verify_preservation(host, backup)
        restored.sql("REVOKE UPDATE ON kd.player FROM kindred_test_runtime")
        must_fail(restored.verify_runtime_privileges, "missing runtime table UPDATE")
        Host.grants(host)
        restored.sql("REVOKE USAGE ON SEQUENCE kd.probe_sequence FROM kindred_test_runtime")
        must_fail(restored.verify_runtime_privileges, "missing runtime sequence USAGE")
        Host.grants(host)
        restored.sql("GRANT CREATE ON SCHEMA kd TO kindred_test_runtime")
        must_fail(restored.verify_runtime_privileges, "runtime schema CREATE")
        restored.sql("REVOKE CREATE ON SCHEMA kd FROM kindred_test_runtime")
        admin.sql("GRANT kindred_test_migrator TO kindred_test_runtime")
        must_fail(restored.verify_runtime_privileges, "runtime migrator membership")
        admin.sql("REVOKE kindred_test_migrator FROM kindred_test_runtime")
        Host.grants(host)
        restored.sql("UPDATE kd.player SET display_name='corrupt fixture'")
        must_fail(lambda: restored.compare(before, after_publication=True), "changed player row")
        restored.sql("UPDATE kd.player SET display_name='Preserved player'")
        restored.sql("INSERT INTO kd.probe_duplicates VALUES('same')")
        must_fail(lambda: restored.compare(before, after_publication=True), "extra duplicate row")
        restored.sql("DELETE FROM kd.probe_duplicates WHERE ctid=(SELECT ctid FROM kd.probe_duplicates LIMIT 1)")
        restored.sql("CREATE SCHEMA proof_saved; CREATE TABLE proof_saved.session AS TABLE kd.session; DELETE FROM kd.session")
        must_fail(lambda: restored.compare(before, after_publication=True), "deleted session row")
        restored.sql("INSERT INTO kd.session SELECT * FROM proof_saved.session")
        restored.sql("ALTER TABLE kd.probe_columns RENAME COLUMN payload TO changed_payload")
        must_fail(lambda: restored.compare(before, after_publication=True), "missing original column")
        restored.sql("ALTER TABLE kd.probe_columns RENAME COLUMN changed_payload TO payload")
        restored.sql("CREATE TABLE proof_saved.duplicates AS TABLE kd.probe_duplicates; DROP TABLE kd.probe_duplicates; CREATE VIEW kd.probe_duplicates AS TABLE proof_saved.duplicates")
        must_fail(lambda: restored.compare(before, after_publication=True), "table replaced by view")
        restored.sql("DROP VIEW kd.probe_duplicates; CREATE TABLE kd.probe_duplicates AS TABLE proof_saved.duplicates")
        Host.grants(host); Host.verify_preservation(host, backup)
        runtime = Postgres(runner, BIN, {**restored.connection, "PGUSER": "kindred_test_runtime"})
        runtime.sql("BEGIN; INSERT INTO kd.probe_duplicates VALUES('runtime DML'); ROLLBACK")
        must_fail(lambda: runtime.sql("CREATE TABLE kd.forbidden_runtime_ddl(id integer)"), "runtime DDL")
        backend_log = (ROOT / "backend.private.log").open("w")
        backend = subprocess.Popen(["node", str(APP / "server-dist/index.mjs")], cwd=APP, env={**os.environ, **env, "PGDATABASE": rehearsal["database"], "PGUSER": "kindred_test_runtime"}, stdout=backend_log, stderr=backend_log)
        ready = False
        for _ in range(40):
            try:
                with urllib.request.urlopen("http://127.0.0.1:3001/readyz", timeout=1) as response:
                    ready = json.load(response).get("status") == "ready"
                    if ready: break
            except OSError:
                pass
            time.sleep(0.25)
        if not ready:
            raise OperatorError("Actual backend runtime-role readiness failed after rehearsal")
        pg.compare(before)
        if pg.state() != source_state:
            raise OperatorError("Original source database changed during isolated rehearsal")
        result = {"postgresVersion": admin.identity()["version"], "legacyRegression": legacy, "applicationTables": len(before), "preservedOriginalRows": sum(table["count"] for table in before), "sourceMigrationCount": len(source_state["migrations"]), "rehearsalMigrationCount": len(restored.state()["migrations"]), "backupAndSourceBundleVerified": True, "completeHostRehearsalVerified": True, "postPublicationPreservationVerified": True, "rowColumnAndDuplicateCorruptionDetected": True, "runtimePermissionFailuresDetected": True, "runtimeDmlWithoutDdl": True, "backendReadyWithRuntimeRole": True, "sourceDatabaseUnchanged": True, "hostDatabaseAccessed": False}
        write_json(ROOT / "result.json", result)
        print(json.dumps(result, indent=2), flush=True)
    finally:
        if backend:
            backend.terminate(); backend.wait(timeout=15)
        if started:
            runner([BIN / "pg_ctl", "-D", ROOT / "data", "-m", "fast", "-w", "stop"], output=False)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("PG18 proof failed: " + (str(error) if isinstance(error, OperatorError) else type(error).__name__), file=sys.stderr)
        for name in ("operator.private.log", "backend.private.log", "postgres.private.log"):
            path = ROOT / name
            if path.exists():
                diagnostic = path.read_text(errors="replace")[-3000:]
                for secret in REDACT:
                    diagnostic = diagnostic.replace(secret, "[redacted]")
                print("Generated-fixture diagnostic " + name + ":\n" + diagnostic, file=sys.stderr)
        raise SystemExit(1)
