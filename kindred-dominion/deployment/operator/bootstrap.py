"""Trusted pre-deployment discovery/self-update, under the deployment lock."""
from __future__ import annotations
import argparse
import importlib
import json
from pathlib import Path
from .core import OperatorError, revision
from .host import Host, write_json
from .release import Approvals
from .bundle import activate, git_blob, load, secure, stage


def choose(host, approvals, requested=None, resume=False):
    latest = host.state_dir / "latest.json"
    journal = json.loads(latest.read_text()) if latest.exists() else {}
    if journal.get("databaseMayHaveChanged") and journal.get("phase") != "completed":
        if not resume:
            raise OperatorError("An unfinished live migration needs review. Run sudo kindred-status, inspect its private log, then sudo kindred-update --resume to retry that exact revision. Separate-database recovery remains available with kindred-rollback; do not restore an old dump over TEST.")
        failed = revision(journal.get("requestedRevision"))
        if requested and requested != failed:
            raise OperatorError("Resume must use the exact failed revision; run sudo kindred-update --resume.")
        requested = failed
        host.require_recoverable(requested, True)
    elif resume:
        raise OperatorError("There is no unfinished live migration to resume. Use sudo kindred-update.")
    current = host.current()
    host.git(["fetch", "--no-tags", "origin", "main"])
    head = revision(host.git(["rev-parse", "origin/main"]))
    # Reject rewritten/divergent main; never pick an unrelated release.
    host.git(["merge-base", "--is-ancestor", current["revision"], head])
    if requested:
        revision(requested)
        host.git(["merge-base", "--is-ancestor", current["revision"], requested])
        host.git(["merge-base", "--is-ancestor", requested, head])
        return approvals.verify(requested)
    candidates = host.git(["rev-list", "--first-parent", "--max-count=200", head]).splitlines()
    forward = []
    for sha in candidates:
        forward.append(sha)
        if sha == current["revision"]:
            break
    else:
        raise OperatorError("Running release is outside the bounded main history. Keep the app running and ask the maintainer to review its ancestry; use an explicitly approved forward revision after review.")
    return approvals.select(forward)


def main(argv, *, library, state, trust, current, host_factory=Host, approvals_factory=Approvals):
    parser = argparse.ArgumentParser(description="One-command approved Kindred Dominion updates", add_help=False)
    parser.add_argument("command", choices=("update", "status", "backup", "rollback", "start", "stop", "restart"))
    # Only parse update flags here; recovery/status arguments retain existing CLI.
    args, rest = parser.parse_known_args(argv)
    if args.command != "update":
        return importlib.import_module(__package__ + ".kindred").main(argv)
    update_parser = argparse.ArgumentParser(prog="kindred-update", description="Automatically select and deploy the latest owner-approved main release.")
    update_parser.add_argument("revision", nargs="?", help="Optional approved full SHA for advanced operations")
    update_parser.add_argument("--reviewed", action="store_true", help="Legacy acknowledgement; never bypasses approval")
    update_parser.add_argument("--rehearse-only", action="store_true")
    update_parser.add_argument("--resume", action="store_true")
    selected = update_parser.parse_args(rest)
    if selected.revision:
        revision(selected.revision)
    if selected.resume and selected.rehearse_only:
        raise OperatorError("Resume cannot use rehearsal-only mode.")
    host = host_factory("/etc/kindred-dominion/test/operator.json")
    with host.lock() as lease:
        host.preflight()
        secure(trust, private=True)
        policy = json.loads(trust.read_text())
        approvals = approvals_factory(policy, lambda sha, path: git_blob(host.repo, sha, path))
        approval = choose(host, approvals, selected.revision, selected.resume)
        sha = approval["revision"]
        print("Verified approved release " + sha + ". Preparing operator and candidate validation.", flush=True)
        record = stage(library, sha, lambda commit, path: git_blob(host.repo, commit, path), approval)
        # Revalidate latest run attempts immediately before code activation.
        approval = approvals.verify(sha)
        record["approval"] = approval
        package = load(library, record)
        candidate = importlib.import_module(package + ".kindred")
        activate(library, state, record, current)
        write_json(state / "release-selection.json", approval)
        child_args = ["update", sha]
        if selected.rehearse_only:
            child_args.append("--rehearse-only")
        if selected.resume:
            child_args.append("--resume")
        # Retain verified tooling even if deployment fails: it contains the
        # recovery implementation for the new release. Old bundles remain intact.
        return candidate.main(child_args, lock_lease=lease, approval=approval)
