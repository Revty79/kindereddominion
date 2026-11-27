"""Native PostgreSQL proof of the operator snapshot adapter and M6 -> M7.

Only the existing registered disposable Windows cluster is accepted. Creates
two new random copies, keeps them and never alters DEV or hosted TEST.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "deployment/operator"))
from host import Postgres, Runner, read_env, write_json
from core import OperatorError


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--backup", required=True, help="Existing private schema-six disposable backup")
    parser.add_argument("--source-env", required=True, help="Registered integration configuration")
    args = parser.parse_args()
    root = Path.cwd().resolve()
    source_file, archive = Path(args.source_env).resolve(), Path(args.backup).resolve()
    private = root / ".local"
    if not source_file.is_relative_to(private) or not archive.is_relative_to(private):
        raise OperatorError("Inputs must stay in this checkout's ignored private test storage.")
    instance_file = private / "v1.3d/postgres/instance.json"
    instance = json.loads(instance_file.read_text())
    connection = read_env(source_file)
    allowed = [instance["database"], *instance.get("testDatabases", []), *instance.get("restoreDatabases", [])]
    if instance["host"] != "127.0.0.1" or instance["port"] == 5432 or Path(instance["data"]).resolve() != private / "v1.3d/postgres/data" or connection["APP_ENV"] != "integration" or connection["PGHOST"] != instance["host"] or int(connection["PGPORT"]) != instance["port"] or connection["PGDATABASE"] not in allowed or connection["PGUSER"] != "kindred_test" or connection["ISOLATION_TOKEN"] != instance["instanceId"]:
        raise OperatorError("Owned disposable PostgreSQL target validation failed; no database was created.")
    receipt = json.loads(Path(str(archive) + ".json").read_text())
    if len(receipt["migrations"]) != 6 or receipt["target"]["port"] != instance["port"] or not receipt["target"]["database"].startswith("kd_") or hashlib.sha256(archive.read_bytes()).hexdigest() != receipt["sha256"]:
        raise OperatorError("Use a checksum-verified schema-six disposable backup.")
    folder = private / "v1.5/native-rehearsal"
    folder.mkdir(parents=True, exist_ok=True)
    runner = Runner(folder / "native.private.log")
    runner.logfile.touch(mode=0o600, exist_ok=True)
    binary = os.environ.get("PG_BIN", "C:/Program Files/PostgreSQL/18/bin")
    password = (private / "v1.3d/postgres/password.private").read_text().strip()
    admin = Postgres(runner, binary, {**connection, "PGUSER": "kd_isolation_admin", "PGPASSWORD": password, "PGDATABASE": "postgres"})
    original = Postgres(runner, binary, connection)
    original_state = original.state()
    results = []
    for fail in (False, True):
        name = "kd_test_" + secrets.token_hex(8)
        admin.command("createdb", ["--owner=kindred_test", "--template=template0", name])
        pg = Postgres(runner, binary, {**connection, "PGDATABASE": name})
        pg.command("pg_restore", ["--exit-on-error", "--no-owner", "--no-privileges", "--dbname", name, archive])
        # Only the newly created restored copy is adopted by the isolation guard.
        pg.sql("UPDATE kd.environment_guard SET environment='integration',disposable=true,instance_id='" + instance["instanceId"] + "' WHERE singleton")
        instance["testDatabases"] = [*instance.get("testDatabases", []), name]
        write_json(instance_file, instance)
        before = pg.snapshot()
        write_json(folder / (name + ".before.json"), before)
        isolated_env = folder / (name + ".env")
        isolated_env.write_text("\n".join(key + "=" + json.dumps(value) for key, value in {**connection, "PGDATABASE": name}.items()) + "\n", encoding="utf-8")
        os.chmod(isolated_env, 0o600)
        cli = root / "server-dist/cli.mjs"
        if fail:
            broken = folder / (name + "-failed-image")
            broken.mkdir()
            shutil.copyfile(cli, broken / "cli.mjs")
            shutil.copytree(root / "server-dist/migrations", broken / "migrations")
            migration = broken / "migrations/1795800000000_hosted_administration.cjs"
            migration.write_text("exports.up=pgm=>pgm.sql('ALTER TABLE kd.invite ADD COLUMN forced_failure_probe text; SELECT 1/0;');exports.down=()=>{};\n", encoding="utf-8")
            cli = broken / "cli.mjs"
        failed = False
        try:
            runner([shutil.which("node"), cli, "migrate"], env={"KINDRED_ENV_FILE": str(isolated_env)}, cwd=root)
        except OperatorError:
            failed = True
        if failed != fail:
            raise OperatorError("Unexpected native migration result; inspect the private rehearsal log.")
        pg.compare(before, after_publication=not fail)
        count = len(pg.state()["migrations"])
        if count != (6 if fail else 7):
            raise OperatorError("Migration ledger did not match the expected transactional result.")
        results.append({"database": name, "restoreVerifiedAgainstOriginalColumns": True, "existingRowsPreserved": True, "intentionalMigrationFailure": fail, "migrationCount": count, "originalTableCount": len(before), "originalRowCount": sum(table["count"] for table in before)})
    if original.state() != original_state:
        raise OperatorError("The unrelated source schema/content changed during verification.")
    result = {"postgresPort": instance["port"], "productionHostAdapterExecuted": False, "dockerExecuted": False, "sourceDatabaseUntouched": True, "copiesRetained": results}
    write_json(folder / "results.json", result)
    print(json.dumps(result, indent=2))


if __name__ == "__main__": main()
