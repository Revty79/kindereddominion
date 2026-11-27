"""Portable workflow/fault tests. No Docker daemon, SSH or owner database used."""
import contextlib
import copy
import json
from pathlib import Path
import tempfile
import threading
import unittest
from core import update, backup, revision, OperatorError
from host import Host, Postgres, Runner, read_env, write_json, maintenance_storage, unit_validation_command

OLD, NEW = "a" * 40, "b" * 40


class FakeHost:
    def __init__(self, fail=None, resume=False):
        self.events, self.fail = [], fail
        self.running, self.changed, self.completed = OLD, False, None
        self.resume_context = {"databaseMayHaveChanged": True} if resume else None
        self.mutex = threading.Lock()
        self.last = None
    def event(self, name):
        self.events.append(name)
        if self.fail == name:
            self.fail = None
            raise OperatorError("Injected " + name)
    @contextlib.contextmanager
    def lock(self):
        if not self.mutex.acquire(False):
            raise OperatorError("Exclusive lock busy")
        try:
            self.event("lock"); yield
        finally:
            self.mutex.release()
    def preflight(self): self.event("preflight")
    def require_recoverable(self, requested, resume):
        self.event("recovery-check")
        if self.resume_context and (not resume or requested != NEW):
            raise OperatorError("Unresolved migration")
    def source(self, selected):
        self.event("source"); return {"revision": selected}
    def current(self): return {"revision": OLD, "database": {"migrations": [6]}}
    def check_forward(self, old, candidate): self.event("forward-only")
    def journal(self, *args): self.last = {"databaseMayHaveChanged": False}; return self.last
    def phase(self, journal, phase): self.events.append("phase:" + phase); journal["phase"] = phase
    def build(self, candidate): self.event("build"); candidate["images"] = {"backend": "immutable"}
    def stop(self, release): self.event("stop:" + release["revision"]); self.running = None
    def no_other_writers(self): self.event("no-other-writers")
    def backup(self, *args): self.event("backup"); return {"directory": "private-backup"}
    def rehearse(self, *args, **kwargs): self.event("rehearsal"); return {"restoreVerified": True}
    def recheck_private_configuration(self): self.event("recheck-private")
    def migrate(self, *args):
        self.changed = True; self.event("migrate")
    def publish(self, *args): self.event("publish")
    def grants(self): self.event("grants")
    def verify_preservation(self, *args): self.event("preservation")
    def database_state(self): return {"migrations": [7]}
    def start(self, release): self.event("start:" + release["revision"]); self.running = release["revision"]
    def verify_healthy(self, release): self.event("healthy:" + release["revision"])
    def complete(self, candidate, journal): self.event("complete"); self.completed = candidate
    def safe_to_resume(self, old): return not self.changed and not self.resume_context


class Workflow(unittest.TestCase):
    def test_full_order_and_only_reviewed_images(self):
        host = FakeHost(); result = update(host, NEW, reviewed=True)
        self.assertTrue(result["completed"]); self.assertEqual(host.running, NEW)
        operations = ["build", "stop:" + OLD, "backup", "rehearsal", "migrate", "publish", "grants", "preservation", "start:" + NEW, "healthy:" + NEW, "complete"]
        indexes = [host.events.index(item) for item in operations]
        self.assertEqual(indexes, sorted(indexes)); self.assertEqual(host.last["phase"], "completed")
    def test_review_required_before_any_host_operation(self):
        for value in ("main", "latest", "ABCDEF" * 7, "b" * 39):
            with self.assertRaises(OperatorError): revision(value)
        host = FakeHost()
        with self.assertRaises(OperatorError): update(host, NEW)
        self.assertEqual(host.events, [])
    def test_failed_build_leaves_previous_application_running(self):
        host = FakeHost("build")
        with self.assertRaises(OperatorError): update(host, NEW, reviewed=True)
        self.assertEqual(host.running, OLD); self.assertNotIn("backup", host.events); self.assertFalse(host.changed)
        self.assertFalse(any(item.startswith("stop:") for item in host.events))
    def test_pre_migration_failures_resume_old_without_data_restore(self):
        for fail in ("no-other-writers", "backup", "rehearsal", "recheck-private"):
            with self.subTest(fail=fail):
                host = FakeHost(fail)
                with self.assertRaises(OperatorError): update(host, NEW, reviewed=True)
                self.assertEqual(host.running, OLD); self.assertFalse(host.changed); self.assertTrue(host.last["previousApplicationResumed"])
    def test_each_post_migration_failure_leaves_writers_stopped(self):
        for fail in ("migrate", "publish", "grants", "preservation", "start:" + NEW, "healthy:" + NEW, "complete"):
            with self.subTest(fail=fail):
                host = FakeHost(fail)
                with self.assertRaises(OperatorError): update(host, NEW, reviewed=True)
                self.assertIsNone(host.running); self.assertTrue(host.last["databaseMayHaveChanged"])
                self.assertEqual(host.last["phase"], "failed-after-migration"); self.assertNotIn("start:" + OLD, host.events)
    def test_rehearsal_does_not_migrate_live_database(self):
        host = FakeHost(); result = update(host, NEW, reviewed=True, rehearse_only=True)
        self.assertFalse(result["liveDatabaseMigrated"]); self.assertEqual(host.running, OLD); self.assertNotIn("migrate", host.events)
    def test_resume_never_clears_existing_database_uncertainty_on_build_failure(self):
        host = FakeHost("build", resume=True)
        with self.assertRaises(OperatorError): update(host, NEW, reviewed=True, resume=True)
        self.assertTrue(host.last["databaseMayHaveChanged"]); self.assertIsNone(host.running); self.assertNotIn("start:" + OLD, host.events)
    def test_resume_must_select_the_same_reviewed_revision(self):
        for selected, resume in ((OLD, True), (NEW, False)):
            with self.assertRaises(OperatorError): update(FakeHost(resume=True), selected, reviewed=True, resume=resume)
        with self.assertRaises(OperatorError): update(FakeHost(resume=True), NEW, reviewed=True, resume=True, rehearse_only=True)
    def test_same_revision_is_health_checked_without_migration(self):
        host = FakeHost(); self.assertTrue(update(host, OLD, reviewed=True)["unchanged"])
        self.assertNotIn("build", host.events); self.assertIn("healthy:" + OLD, host.events)
    def test_exclusive_lock_rejects_concurrent_update(self):
        host = FakeHost(); host.mutex.acquire()
        try:
            with self.assertRaises(OperatorError): update(host, NEW, reviewed=True)
        finally: host.mutex.release()
        self.assertEqual(host.events, [])
    def test_backup_requires_isolated_restore_verification(self):
        host = FakeHost(); self.assertTrue(backup(host)["isolatedRestoreVerified"])
        self.assertEqual(host.running, OLD); self.assertNotIn("migrate", host.events)
        failed = FakeHost("rehearsal")
        with self.assertRaises(OperatorError): backup(failed)
        self.assertEqual(failed.running, OLD)


class Adapter(unittest.TestCase):
    def test_vitest_has_separate_config_and_transform_cache_mounts(self):
        command = unit_validation_command("sha256:" + "a" * 64)
        mounts = [command[index + 1] for index, value in enumerate(command) if value == "--tmpfs"]
        by_path = dict(mount.split(":", 1) for mount in mounts)
        self.assertEqual(len(mounts), len(by_path))
        self.assertEqual(set(by_path), {"/tmp", "/app/.local", "/app/node_modules/.vite", "/app/node_modules/.vite-temp"})
        self.assertIn("size=64m", by_path["/app/node_modules/.vite-temp"])
        for name in ("/app/.local", "/app/node_modules/.vite", "/app/node_modules/.vite-temp"):
            for option in ("rw", "nosuid", "nodev", "mode=0700", "uid=1000", "gid=1000"):
                self.assertIn(option, by_path[name].split(","))
    def test_vitest_keeps_full_suite_and_container_isolation(self):
        command = unit_validation_command("sha256:" + "a" * 64)
        self.assertIn("--read-only", command)
        self.assertEqual(command[command.index("--network") + 1], "none")
        self.assertEqual(command[command.index("--cap-drop") + 1], "ALL")
        self.assertEqual(command[command.index("--security-opt") + 1], "no-new-privileges:true")
        self.assertEqual(command[-4:], ["node_modules/vitest/vitest.mjs", "run", "--maxWorkers=1", "--no-file-parallelism"])
        self.assertFalse(any(arg in command for arg in ("--env", "-e", "--env-file", "--volume", "-v", "--privileged", "--passWithNoTests")))
    def test_build_uses_the_hardened_full_suite_before_marking_candidate_validated(self):
        host = Host.__new__(Host); host.config = {"network": "kindred-dominion-net"}
        candidate = {"revision": NEW, "applicationDir": "/isolated/release/kindred-dominion", "images": {}}
        service = {"read_only": True, "cap_drop": ["ALL"], "security_opt": ["no-new-privileges:true"]}
        config = {"services": {name: copy.deepcopy(service) for name in ("game", "backend", "maintenance")}, "networks": {"default": {"external": True, "name": host.config["network"]}}}
        config["services"]["game"]["ports"] = [{"host_ip": "127.0.0.1", "published": "18083", "target": 8080}]
        config["services"]["maintenance"]["tmpfs"] = ["/app/.local:rw,nosuid,nodev,size=128m,mode=0700,uid=1000,gid=1000"]
        host.compose = lambda *args, **kwargs: json.dumps(config)
        host.image_revision = lambda image: NEW
        host.git = lambda args, directory=None: NEW if args == ["rev-parse", "HEAD"] else ""
        commands = []
        def run(args, **kwargs):
            commands.append(args)
            if args[1:3] == ["image", "ls"]:
                return "\n".join(name + ":" + NEW for name in ("kindred-dominion", "kindred-dominion-backend", "kindred-dominion-maintenance"))
            if "{{.Config.User}}" in args:
                return "101:101" if args[-1].startswith("kindred-dominion:") else "1000:1000"
            if "{{.Id}}" in args: return "sha256:" + "a" * 64
            return ""
        host.run = run
        host.build(candidate)
        validation = [command for command in commands if "node_modules/vitest/vitest.mjs" in command]
        self.assertEqual(len(validation), 1)
        self.assertIn("/app/node_modules/.vite-temp:rw,nosuid,nodev,size=64m,mode=0700,uid=1000,gid=1000", validation[0])
        self.assertTrue(candidate["validatedBeforeDowntime"])
        def fail_validation(args, **kwargs):
            if "node_modules/vitest/vitest.mjs" in args: raise OperatorError("Injected Vite configuration write failure")
            return run(args, **kwargs)
        host.run = fail_validation; candidate.pop("validatedBeforeDowntime")
        with self.assertRaises(OperatorError): host.build(candidate)
        self.assertNotIn("validatedBeforeDowntime", candidate)
    def test_environment_is_literal_and_duplicates_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "private.env"
            file.write_text("PGPASSWORD='$(touch /tmp/never) `whoami`'\nPGPORT=5432 # target\nSESSION_SECRET=abc#literal\n", encoding="utf-8")
            self.assertEqual(read_env(file)["PGPASSWORD"], "$(touch /tmp/never) `whoami`")
            self.assertEqual(read_env(file)["PGPORT"], "5432"); self.assertEqual(read_env(file)["SESSION_SECRET"], "abc#literal")
            for content in ("PGHOST=a\nPGHOST=b", 'PGPASSWORD="unclosed', "export PGHOST=bad", 'PGPASSWORD="line\\nbreak"'):
                file.write_text(content, encoding="utf-8")
                with self.assertRaises(OperatorError): read_env(file)
    def test_manifest_atomic_write(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "journal.json"
            write_json(file, {"phase": "building"}); write_json(file, {"phase": "completed"})
            self.assertEqual(json.loads(file.read_text()), {"phase": "completed"}); self.assertEqual(len(list(Path(directory).iterdir())), 1)
    def test_maintenance_storage_preserves_bounded_nonroot_tmpfs(self):
        correct = "/app/.local:rw,nosuid,nodev,size=128m,mode=0700,uid=1000,gid=1000"
        self.assertTrue(maintenance_storage([correct])); self.assertTrue(maintenance_storage([correct.replace("128m", "134217728").replace("0700", "700")]))
        for invalid in (correct.replace("uid=1000", "uid=0"), correct.replace("nosuid,", ""), correct.replace("128m", "1g"), correct.replace("rw,", "ro,"), "/tmp:rw"):
            self.assertFalse(maintenance_storage([invalid]))
    def test_snapshot_comparison_detects_missing_changed_and_duplicate_rows(self):
        original = [{"name": "player", "rows": ["one", "two"], "columns": ["id"]}]
        pg = Postgres(None, ".", {})
        for rows in (["one"], ["one", "changed"], ["one", "two", "two"]):
            pg.snapshot = lambda _spec, rows=rows: [{"name": "player", "rows": rows}]
            with self.assertRaises(OperatorError): pg.compare(original, after_publication=True)
        pg.snapshot = lambda _spec: [{"name": "player", "rows": ["two", "one"]}]
        self.assertTrue(pg.compare(original))
    def test_publication_only_allows_additions_to_immutable_metadata(self):
        expected = [{"name": "card_revision", "rows": ["old"]}]
        pg = Postgres(None, ".", {}); pg.snapshot = lambda _spec: [{"name": "card_revision", "rows": ["old", "new"]}]
        self.assertTrue(pg.compare(expected, after_publication=True))
        with self.assertRaises(OperatorError): pg.compare(expected)
        pg.snapshot = lambda _spec: [{"name": "card_revision", "rows": ["new"]}]
        with self.assertRaises(OperatorError): pg.compare(expected, after_publication=True)
    def test_snapshot_checks_original_table_and_columns_against_catalog_identity(self):
        pg = Postgres(None, ".", {})
        queries = []
        def rows(query):
            queries.append(query)
            if "pg_catalog.pg_class" in query:
                return [{"name": "player", "oid": 12001}]
            if "pg_catalog.pg_attribute" in query:
                return [{"name": "id"}, {"name": "new_column"}]
            self.fail("Unexpected metadata query")
        pg.rows = rows; pg.sql = lambda query: "row-hash"
        snapshot = pg.snapshot([{"name": "player", "columns": ["id"]}])
        self.assertEqual(snapshot[0]["columns"], ["id"])
        self.assertEqual(snapshot[0]["rows"], ["row-hash"])
        self.assertIn("a.attrelid=12001::oid", queries[-1])
        with self.assertRaises(OperatorError): pg.snapshot([{"name": "pg_statistic", "columns": ["id"]}])
        with self.assertRaises(OperatorError): pg.snapshot([{"name": "player", "columns": ["missing_column"]}])
    def test_runtime_audit_rejects_missing_table_sequence_and_unsafe_role_privileges(self):
        pg = Postgres(None, ".", {})
        for failed in ("table", "sequence", "role"):
            pg.rows = lambda query, failed=failed: [{"name": "fixture"}] if ("application_sequences" if failed == "sequence" else "application_tables") in query and failed != "role" else []
            pg.sql = lambda query, failed=failed: "t" if failed == "role" else "f"
            with self.assertRaises(OperatorError): pg.verify_runtime_privileges()
        pg.rows = lambda query: []; pg.sql = lambda query: "f"
        pg.verify_runtime_privileges()
    def test_unresolved_interrupted_phase_blocks_start_and_other_revisions(self):
        with tempfile.TemporaryDirectory() as directory:
            host = Host.__new__(Host); host.state_dir = Path(directory); host.resume_context = None
            write_json(host.state_dir / "latest.json", {"databaseMayHaveChanged": True, "phase": "live-migration-started", "requestedRevision": NEW})
            with self.assertRaises(OperatorError): host.require_recoverable(None, False)
            with self.assertRaises(OperatorError): host.require_recoverable(OLD, True)
            host.require_recoverable(NEW, True); self.assertIsNotNone(host.resume_context)
    def test_resumed_journal_first_write_retains_uncertainty_and_observed_candidate(self):
        host = Host.__new__(Host); host.identifier = lambda: "new-journal"
        host.run = type("Log", (), {"logfile": Path("private.log")})()
        host.resume_context = {"id": "interrupted-journal", "candidate": {"revision": NEW, "images": {"backend": "immutable"}}}
        records = []; host.phase = lambda journal, phase: records.append(copy.deepcopy(journal))
        result = host.journal("update", NEW, {"revision": OLD})
        self.assertTrue(records[0]["databaseMayHaveChanged"])
        self.assertEqual(result["candidate"], host.resume_context["candidate"])
    def test_incompatible_rollback_is_rejected_before_stopping_writers(self):
        with tempfile.TemporaryDirectory() as directory:
            host = Host.__new__(Host); host.state_dir = Path(directory)
            (host.state_dir / "deployments").mkdir()
            identifier = "20261127T000000Z-abcdefabcdef"
            write_json(host.state_dir / "deployments" / (identifier + ".release.json"), {"database": {"migrations": [6]}})
            host.database_state = lambda: {"migrations": [7]}
            events = []; host.stop = lambda release: events.append("stop")
            with self.assertRaises(OperatorError): host.rollback(identifier)
            self.assertEqual(events, [])
    def test_explicit_recovery_recognizes_stopped_candidate_images_from_failed_update(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory); selected = folder / "selected"; safety = folder / "safety"
            selected.mkdir(); safety.mkdir()
            state = {"migrations": [6], "content": ["old-approved"]}
            write_json(selected / "receipt.json", {"directory": str(selected), "database": state, "previousApplication": {"revision": OLD}})
            write_json(safety / "receipt.json", {"directory": str(safety)})
            for item in (selected, safety): write_json(item / "database.snapshot.json", [])
            host = Host.__new__(Host); host.state_dir = folder; host.resume_context = None
            identifier = "20261127T000000Z-abcdefabcdef"
            write_json(folder / ("recovery-" + identifier + ".json"), {"selectedBackup": str(selected), "safetyBackup": str(safety)})
            write_json(folder / "latest.json", {"databaseMayHaveChanged": True, "phase": "failed-after-migration", "candidate": {"revision": NEW}})
            host.pg = type("PG", (), {"copy": lambda self, name: self, "compare": lambda self, rows: True})()
            host.no_other_writers = lambda: None; host.database_state = lambda: state
            host.recheck_private_configuration = lambda: None; host.grants = lambda: None
            def current():
                self.assertEqual(host.resume_context["candidate"]["revision"], NEW)
                return {"revision": OLD}
            host.current = current
            events = []; host.start = lambda release: events.append(release["revision"])
            host.verify_healthy = lambda release: None; host.journal = lambda *args: {}
            host.complete = lambda *args: None; host.phase = lambda *args: None
            result = host.complete_recovery(identifier, "kindred_dominion_test_preserved_20261127000000")
            self.assertEqual(events, [OLD]); self.assertFalse(result["databaseDeleted"])


if __name__ == "__main__": unittest.main()
