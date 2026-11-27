"""Real temporary Git/bundle/install/handoff tests; external host/API are fixtures."""
import contextlib
import copy
import hashlib
import importlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("updater_test", SOURCE / "__init__.py", submodule_search_locations=[str(SOURCE)])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
from updater_test import bootstrap, bundle, release, launcher
from updater_test.core import OperatorError
from updater_test.host import Host, write_json
from test_operator import FakeHost

install_spec = importlib.util.spec_from_file_location("updater_install_test", SOURCE / "install.py")
installer = importlib.util.module_from_spec(install_spec)
install_spec.loader.exec_module(installer)
OLD, NEW = "a" * 40, "b" * 40


class ApprovalTests(unittest.TestCase):
    def setUp(self):
        self.policy = {"repositoryId": 42, "approverIds": [7], "workflowSha256": {name: hashlib.sha256(name.encode()).hexdigest() for name in ("kindred-ci.yml", "kindred-release.yml")}}
        self.approval = self.run_record(2, "kindred-release.yml", "workflow_dispatch")
        self.ci = self.run_record(1, "kindred-ci.yml", "push")
        self.jobs = {1: self.job("validate"), 2: self.job("approve")}
        self.api = self
        self.verifier = release.Approvals(self.policy, lambda sha, path: path.rsplit("/", 1)[-1].encode(), self)

    def run_record(self, ident, workflow, event):
        return {"id": ident, "run_attempt": 1, "head_sha": NEW, "head_branch": "main", "path": ".github/workflows/" + workflow, "event": event, "actor": {"id": 7}, "triggering_actor": {"id": 7}, "repository": {"id": 42}, "head_repository": {"id": 42}, "status": "completed", "conclusion": "success"}

    def job(self, name):
        return {"total_count": 1, "jobs": [{"name": name, "head_sha": NEW, "status": "completed", "conclusion": "success", "steps": [{"status": "completed", "conclusion": "success"}]}]}

    def get(self, suffix):
        if "/workflows/" in suffix:
            values = [self.approval] if "kindred-release.yml" in suffix else [self.ci]
            return {"workflow_runs": copy.deepcopy(values)}
        return copy.deepcopy(self.jobs[int(suffix.split("/")[2])])

    def test_exact_owner_approval_and_source_ci_succeed(self):
        receipt = self.verifier.select([NEW, OLD])
        self.assertEqual(receipt["revision"], NEW)
        self.assertEqual(receipt["approverId"], 7)

    def test_fork_branch_event_actor_workflow_and_job_spoofing_fail_closed(self):
        cases = [("head_branch", "other"), ("head_sha", OLD), ("path", ".github/workflows/evil.yml"), ("event", "push"), ("head_repository", {"id": 43}), ("repository", {"id": 43}), ("actor", {"id": 8}), ("triggering_actor", {"id": 8}), ("status", "in_progress"), ("conclusion", "failure")]
        for key, value in cases:
            with self.subTest(key=key), patch.dict(self.approval, {key: value}):
                with self.assertRaises(OperatorError): self.verifier.verify(NEW)
        for key, value in (("name", "fake"), ("head_sha", OLD), ("conclusion", "skipped")):
            with patch.dict(self.jobs[2]["jobs"][0], {key: value}):
                with self.assertRaises(OperatorError): self.verifier.verify(NEW)

    def test_modified_workflow_and_skipped_steps_are_rejected(self):
        self.policy["workflowSha256"]["kindred-release.yml"] = "0" * 64
        with self.assertRaises(OperatorError): self.verifier.verify(NEW)
        self.setUp()
        self.jobs[2]["jobs"][0]["steps"][0]["conclusion"] = "skipped"
        with self.assertRaises(OperatorError): self.verifier.verify(NEW)

    def test_latest_failed_rerun_invalidates_old_green(self):
        older = copy.deepcopy(self.approval)
        newer = dict(older, run_attempt=2, conclusion="failure")
        self.assertEqual(release.latest_per_sha([newer, older])[NEW]["run_attempt"], 2)
        self.approval = newer
        with self.assertRaises(OperatorError): self.verifier.select([NEW])

    def test_latest_unapproved_main_is_skipped(self):
        self.assertEqual(self.verifier.select(["c" * 40, NEW])["revision"], NEW)
        with self.assertRaises(OperatorError): self.verifier.select([NEW], OLD)

    def test_incomplete_job_pagination_and_failed_ci_are_rejected(self):
        self.jobs[2]["total_count"] = 101
        with self.assertRaises(OperatorError): self.verifier.verify(NEW)
        self.setUp(); self.ci["conclusion"] = "failure"
        with self.assertRaises(OperatorError): self.verifier.verify(NEW)

    def test_redirects_are_not_followed(self):
        with self.assertRaises(OperatorError): release.NoRedirect().redirect_request(None, None, None, None, None, None)


class InstallationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="kindred-updater-")
        cls.repo = Path(cls.temporary.name).resolve() / "repository"
        cls.repo.mkdir()
        cls.git("init", "--initial-branch=main")
        cls.git("config", "user.email", "fixture@example.invalid")
        cls.git("config", "user.name", "Disposable updater fixture")
        cls.git("config", "core.autocrlf", "false")
        target = cls.repo / bundle.PREFIX
        target.mkdir(parents=True)
        for source in SOURCE.iterdir():
            if source.suffix in (".py", ".json"):
                (target / source.name).write_bytes(source.read_bytes())
        cls.git("add", ".")
        cls.git("commit", "-m", "First disposable release")
        cls.old = cls.git("rev-parse", "HEAD")
        with (target / "kindred.py").open("a") as stream:
            stream.write("\n# Next approved disposable operator version.\n")
        cls.git("add", "."); cls.git("commit", "-m", "Next disposable release")
        cls.new = cls.git("rev-parse", "HEAD")
        with (target / "kindred.py").open("a") as stream:
            stream.write("\n# Third approved disposable operator version.\n")
        cls.git("add", "."); cls.git("commit", "-m", "Third disposable release")
        cls.third = cls.git("rev-parse", "HEAD")

    @classmethod
    def tearDownClass(cls): cls.temporary.cleanup()

    @classmethod
    def git(cls, *args):
        return subprocess.check_output(["git", "-C", str(cls.repo), *args], stderr=subprocess.DEVNULL, text=True).strip()

    def setUp(self):
        if os.name == "posix" and os.geteuid() != 0:
            self.skipTest("Run native installation fixtures with sudo for real root ownership checks")
        self.temp = tempfile.TemporaryDirectory(prefix="kindred-install-")
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name).resolve()
        self.library, self.private, self.state, self.commands = [root / name for name in ("library", "private", "state", "commands")]
        self.commands.mkdir(mode=0o755)
        self.output = contextlib.redirect_stdout(io.StringIO())
        self.output.__enter__(); self.addCleanup(self.output.__exit__, None, None, None)

    def install(self, sha=None):
        return installer.install_at(self.repo, sha or self.old, self.library, self.private, self.state, self.commands)

    def record(self): return json.loads((self.state / "operator-current.json").read_text())

    def test_initial_and_repeated_install_preserve_private_config_and_wrappers(self):
        self.assertFalse(self.install()["applicationDeployed"])
        config = self.private / "operator.json"
        original = config.read_bytes()
        config.write_bytes(original + b"\n")
        self.install()
        self.assertEqual(config.read_bytes(), original + b"\n")
        self.assertEqual(self.record()["revision"], self.old)
        self.assertEqual(len(list(self.commands.iterdir())), 7)
        self.assertIn("launcher.py", (self.commands / "kindred-update").read_text())
        self.assertNotIn(self.old, (self.commands / "kindred-update").read_text())

    def test_unrelated_command_and_modified_trust_are_preserved(self):
        unrelated = self.commands / "kindred-update"
        unrelated.write_text("#!/bin/sh\necho unrelated\n")
        with self.assertRaises(RuntimeError): self.install()
        self.assertIn("unrelated", unrelated.read_text())
        unrelated.unlink(); self.install()
        trust = self.private / "release-trust.json"
        trust.write_text('{"repositoryId":999}')
        with self.assertRaises(RuntimeError): self.install(self.new)
        self.assertEqual(self.record()["revision"], self.old)

    def test_missing_protocol_corrupt_bundle_and_failed_import_leave_pointer_unchanged(self):
        self.install()
        before = (self.state / "operator-current.json").read_bytes()
        original = lambda sha, path: bundle.git_blob(self.repo, sha, path)
        for filename, contents in (("operator-runtime.json", b'{"protocol":2}'), ("kindred.py", b"raise RuntimeError('bad import')\n")):
            def bad_blob(sha, path):
                return contents if path == bundle.PREFIX + filename else original(sha, path)
            with self.assertRaises(RuntimeError): bundle.stage(self.library, self.new, bad_blob, {})
            self.assertEqual((self.state / "operator-current.json").read_bytes(), before)
        target = self.library / "releases" / self.old / "core.py"
        target.write_text("# corrupt")
        with self.assertRaises(RuntimeError): bundle.validate_record(self.library, self.record())

    def test_self_update_retains_old_verified_bundle_and_recovers_operator_only(self):
        self.install(); old = self.record()
        new = bundle.stage(self.library, self.new, lambda sha, path: bundle.git_blob(self.repo, sha, path), {"approved": True})
        bundle.activate(self.library, self.state, new, old)
        self.assertEqual(self.record()["revision"], self.new)
        bundle.validate_record(self.library, old)
        self.assertEqual(json.loads((self.state / "operator-previous.json").read_text()), old)
        if os.name == "posix":
            (self.state / "operator.lock").touch(mode=0o600)
            with patch.object(launcher, "LIBRARY", self.library), patch.object(launcher, "STATE", self.state):
                launcher.recover_operator()
            self.assertEqual(self.record(), old)

    def test_atomic_pointer_failure_keeps_complete_old_revision(self):
        self.install(); old = self.record()
        new = bundle.stage(self.library, self.new, lambda sha, path: bundle.git_blob(self.repo, sha, path), {})
        real_write = bundle.write_json
        def fail_pointer(path, value):
            if path.name == "operator-current.json": raise OSError("injected atomic replace failure")
            return real_write(path, value)
        with patch.object(bundle, "write_json", fail_pointer):
            with self.assertRaises(OSError): bundle.activate(self.library, self.state, new, old)
        self.assertEqual(self.record(), old)

    def test_real_lock_is_borrowed_without_gap_and_rejects_other_commands(self):
        if os.name != "posix": self.skipTest("fcntl is verified by Ubuntu CI")
        host = Host.__new__(Host); self.state.mkdir(mode=0o700); host.state_dir = self.state
        nested = Host.__new__(Host); nested.state_dir = self.state
        with host.lock() as lease:
            nested.lock_lease = lease
            with nested.lock():
                other = Host.__new__(Host); other.state_dir = self.state
                with self.assertRaises(OperatorError):
                    with other.lock(): pass
        with host.lock(): pass

    def test_in_process_handoff_uses_new_code_and_preserves_full_update_pipeline(self):
        self.install()
        host = DiscoveryHost(self.state, self.repo, self.old, self.new)
        approved = {"revision": self.new, "policy": "test-only"}
        class ApprovalsFixture:
            def __init__(self, *args): pass
            def select(self, *args): return approved
            def verify(self, *args): return approved
        events = []
        class PipelineHost(FakeHost):
            def __init__(inner, configuration, lock_lease):
                super().__init__()
                self.assertIs(lock_lease, host.lease)
                inner.running = self.old
            def current(inner): return {"revision": host.old}
            def event(inner, name): events.append(name); super().event(name)
            def complete(inner, candidate, journal):
                super().complete(candidate, journal)
                host.old = candidate["revision"]
        original_load = bootstrap.load
        def load_and_inject(library, record):
            package = original_load(library, record)
            candidate = importlib.import_module(package + ".kindred")
            self.assertIn(approved["revision"], str(candidate.__file__))
            candidate.Host = PipelineHost
            return package
        with patch.object(bootstrap, "load", load_and_inject):
            result = bootstrap.main(["update"], library=self.library, state=self.state, trust=self.private / "release-trust.json", current=self.record(), host_factory=lambda config: host, approvals_factory=ApprovalsFixture)
        self.assertEqual(result, 0)
        self.assertEqual(self.record()["revision"], self.new)
        for event in ("build", "backup", "rehearsal", "migrate", "preservation", "complete"):
            self.assertIn(event, events)
        self.assertLess(events.index("rehearsal"), events.index("migrate"))
        events.clear()
        with patch.object(bootstrap, "load", load_and_inject):
            result = bootstrap.main(["update"], library=self.library, state=self.state, trust=self.private / "release-trust.json", current=self.record(), host_factory=lambda config: host, approvals_factory=ApprovalsFixture)
        self.assertEqual(result, 0)
        self.assertIn("healthy:" + self.new, events)
        for event in ("build", "backup", "rehearsal", "migrate", "complete"):
            self.assertNotIn(event, events)
        events.clear(); host.head = self.third; approved["revision"] = self.third
        with patch.object(bootstrap, "load", load_and_inject):
            result = bootstrap.main(["update"], library=self.library, state=self.state, trust=self.private / "release-trust.json", current=self.record(), host_factory=lambda config: host, approvals_factory=ApprovalsFixture)
        self.assertEqual(result, 0)
        self.assertEqual(self.record()["revision"], self.third)
        self.assertIn("complete", events)

    def test_approval_unavailable_or_revoked_before_activation_preserves_operator(self):
        self.install(); before = self.record()
        host = DiscoveryHost(self.state, self.repo, self.old, self.new)
        class Unavailable:
            def __init__(self, *args): pass
            def select(self, *args): raise OperatorError("Approval API unavailable")
        class Revoked(Unavailable):
            def select(inner, *args): return {"revision": self.new}
            def verify(inner, *args): raise OperatorError("Latest approval attempt failed")
        for factory in (Unavailable, Revoked):
            with self.assertRaises(OperatorError):
                bootstrap.main(["update"], library=self.library, state=self.state, trust=self.private / "release-trust.json", current=before, host_factory=lambda config: host, approvals_factory=factory)
            self.assertEqual(self.record(), before)

    def test_launcher_refuses_tampered_runtime_before_import(self):
        if os.name != "posix": self.skipTest("Root launcher filesystem ownership is verified by Ubuntu CI")
        self.install()
        with patch.object(launcher, "LIBRARY", self.library):
            launcher.validate(self.record())
            (self.library / "releases" / self.old / "bootstrap.py").write_text("raise RuntimeError('must never import')")
            with self.assertRaisesRegex(RuntimeError, "integrity"):
                launcher.validate(self.record())


class DiscoveryHost:
    def __init__(self, state, repo=None, old=OLD, head=NEW):
        self.state_dir, self.repo, self.old, self.head = state, repo, old, head
        self.lease = object(); self.requests = []
    @contextlib.contextmanager
    def lock(self): yield self.lease
    def preflight(self): pass
    def current(self): return {"revision": self.old}
    def require_recoverable(self, sha, resume): self.requests.append((sha, resume))
    def git(self, args):
        if args[0] == "rev-parse": return self.head
        if args[0] == "rev-list": return self.head + "\n" + self.old
        return ""


class SelectionTests(unittest.TestCase):
    def test_resume_pins_failed_revision_and_requires_explicit_recovery(self):
        with tempfile.TemporaryDirectory() as folder:
            host = DiscoveryHost(Path(folder))
            write_json(host.state_dir / "latest.json", {"databaseMayHaveChanged": True, "phase": "live-migration-started", "requestedRevision": NEW})
            class ApprovalsFixture:
                def verify(self, sha): return {"revision": sha}
            with self.assertRaises(OperatorError): bootstrap.choose(host, ApprovalsFixture())
            result = bootstrap.choose(host, ApprovalsFixture(), resume=True)
            self.assertEqual(result["revision"], NEW)
            self.assertEqual(host.requests, [(NEW, True)])
            with self.assertRaises(OperatorError): bootstrap.choose(host, ApprovalsFixture(), OLD, resume=True)

    def test_no_update_selects_current_approved_revision_and_health_checks_it(self):
        from core import update
        host = FakeHost()
        result = update(host, OLD, reviewed=True)
        self.assertTrue(result["unchanged"])
        self.assertIn("healthy:" + OLD, host.events)
        self.assertNotIn("build", host.events)

    def test_repository_workflow_hashes_match_root_policy(self):
        policy = json.loads((SOURCE / "release-trust.json").read_text())
        for name, expected in policy["workflowSha256"].items():
            self.assertEqual(hashlib.sha256((SOURCE.parents[2] / ".github/workflows" / name).read_bytes()).hexdigest(), expected)


if __name__ == "__main__": unittest.main()
