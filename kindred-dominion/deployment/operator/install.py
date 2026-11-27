#!/usr/bin/env python3
"""One-time reviewed trust installation; never deploy or replace credentials."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import uuid

SOURCE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("kindred_installer", SOURCE / "__init__.py", submodule_search_locations=[str(SOURCE)])
package = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = package
spec.loader.exec_module(package)
from kindred_installer.bundle import activate, git_blob, secure, stage
from kindred_installer.core import OperatorError, revision
from kindred_installer.host import write_json
from kindred_installer.release import validate_policy

MARKER = "# Kindred Dominion managed operator wrapper"
ACTIONS = ("update", "status", "backup", "rollback", "start", "stop", "restart")


def private_directory(path):
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    secure(path, private=True)


def atomic_file(path, data, mode):
    temporary = path.with_name(path.name + ".install-new-" + uuid.uuid4().hex)
    with temporary.open("xb") as stream:
        os.chmod(temporary, mode)
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
    if os.name == "posix":
        descriptor = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)


def install_at(repo, selected, library, private, state, commands):
    """Path-injected native integration fixture; CLI supplies only fixed host paths."""
    blob = lambda sha, path: git_blob(repo, sha, path)
    for path in (private, state):
        private_directory(path)
    library.mkdir(parents=True, exist_ok=True, mode=0o755)
    secure(library)
    secure(commands)
    for action in ACTIONS:
        wrapper = commands / ("kindred-" + action)
        if wrapper.is_symlink() or wrapper.exists() and (MARKER not in wrapper.read_text() or os.name == "posix" and (wrapper.stat().st_uid != 0 or wrapper.stat().st_mode & 0o022)):
            raise OperatorError("Refusing unsafe/unrelated existing command: " + str(wrapper))
    trust_data = blob(selected, "kindred-dominion/deployment/operator/release-trust.json")
    new_policy = json.loads(trust_data)
    validate_policy(new_policy, "test")
    validate_policy(new_policy, "production")
    trust = private / "release-trust.json"
    previous_trust = None
    if trust.exists() or trust.is_symlink():
        secure(trust, private=True)
        previous_trust = trust.read_bytes()
        old_policy = json.loads(previous_trust)
        legacy_policy = {key: new_policy[key] for key in ("repositoryId", "approverIds", "workflowSha256")}
        legacy_policy["format"] = 1
        if old_policy != new_policy and old_policy != legacy_policy:
            raise OperatorError("Existing root release trust is neither the recognized legacy policy nor the current scoped policy. Review an explicit trust rotation; nothing was replaced.")
    record = stage(library, selected, blob, {"policy": "initial-explicit-owner-install", "revision": selected})
    launcher = library / "launcher.py"
    if launcher.exists() or launcher.is_symlink():
        secure(launcher)
    launcher_data = blob(selected, "kindred-dominion/deployment/operator/launcher.py")
    compile(launcher_data, "launcher.py", "exec")
    policy_upgraded = previous_trust is not None and json.loads(previous_trust) != new_policy
    if policy_upgraded:
        previous_hash = hashlib.sha256(previous_trust).hexdigest()
        preserved = private / ("release-trust.previous-" + previous_hash + ".json")
        if preserved.exists() or preserved.is_symlink():
            secure(preserved, private=True)
            if preserved.read_bytes() != previous_trust:
                raise OperatorError("Preserved legacy policy differs; it was not overwritten.")
        else:
            atomic_file(preserved, previous_trust, 0o600)
        write_json(state / "release-policy-upgrade.json", {"revision": selected, "fromSha256": previous_hash, "toSha256": hashlib.sha256(trust_data).hexdigest(), "legacyPolicyBackup": str(preserved), "testEligibility": new_policy["environments"]["test"]["eligibility"], "productionDeploymentEnabled": False})
        atomic_file(trust, trust_data, 0o600)
    for name, data in (("operator.json", blob(selected, "kindred-dominion/deployment/operator/operator.example.json")), ("release-trust.json", trust_data)):
        target = private / name
        if not target.exists():
            atomic_file(target, data, 0o600)
        secure(target, private=True)
    pointer = state / "operator-current.json"
    previous = None
    if pointer.exists():
        secure(pointer, private=True)
        previous = json.loads(pointer.read_text())
    activate(library, state, record, previous)
    atomic_file(launcher, launcher_data, 0o644)
    for action in ACTIONS:
        wrapper = commands / ("kindred-" + action)
        atomic_file(wrapper, ('#!/bin/sh\n' + MARKER + '\nexec /usr/bin/python3 -E -s -B "' + str(launcher) + '" ' + action + ' "$@"\n').encode(), 0o755)
    return {"installedOperatorRevision": selected, "commands": ["kindred-" + action for action in ACTIONS], "privateCredentialsReplaced": False, "applicationDeployed": False, "releasePolicyUpgraded": policy_upgraded, "environment": "test", "productionDeploymentEnabled": False, "routineUpdate": "sudo kindred-update"}


def main():
    parser = argparse.ArgumentParser(description="One-time installation of reviewed automatic updater trust; existing secrets/application are preserved.")
    parser.add_argument("--revision", help="Optional exact reviewed SHA; defaults to this checkout's HEAD")
    parser.add_argument("--reviewed", action="store_true")
    args = parser.parse_args()
    if not args.reviewed:
        raise OperatorError("Explicit --reviewed acknowledgement is required for the one-time trust installation.")
    if os.name != "posix" or os.geteuid() != 0 or socket.gethostname().split(".")[0] != "homeserver":
        raise OperatorError("Run locally with sudo on homeserver. No server connection was attempted.")
    release = dict(line.split("=", 1) for line in Path("/etc/os-release").read_text().splitlines() if "=" in line)
    if release.get("ID", "").strip('"') != "ubuntu" or release.get("VERSION_ID", "").strip('"') != "24.04":
        raise OperatorError("The reviewed target is Ubuntu 24.04.")
    repo = SOURCE.parents[2]
    if repo != Path("/srv/kindred-dominion/source/repository") or repo.resolve() != repo:
        raise OperatorError("Run the installer from the reviewed repository path.")
    def git(*parts):
        return subprocess.check_output(["git", "--no-replace-objects", "-c", "safe.directory=" + str(repo), "-C", str(repo), *parts], text=True).strip()
    selected = revision(args.revision or git("rev-parse", "HEAD"))
    if git("rev-parse", "HEAD") != selected or git("status", "--porcelain", "--untracked-files=no"):
        raise OperatorError("Installer must match clean tracked HEAD; nothing was reset or cleaned.")
    if git("remote", "get-url", "origin").lower() not in ("https://github.com/revty79/kindereddominion.git", "git@github.com:revty79/kindereddominion.git"):
        raise OperatorError("Unexpected repository origin.")
    state = Path("/srv/kindred-dominion/state")
    private_directory(state)
    private_directory(Path("/srv/kindred-dominion/backups"))
    import fcntl
    with (state / "operator.lock").open("a+b") as lock:
        os.chmod(state / "operator.lock", 0o600)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise OperatorError("Another operator command is running; installation made no changes.") from error
        result = install_at(repo, selected, Path("/usr/local/lib/kindred-dominion"), Path("/etc/kindred-dominion/test"), state, Path("/usr/local/bin"))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, OSError, subprocess.SubprocessError, ValueError) as error:
        print("Operator installation stopped safely: " + str(error), file=sys.stderr)
        raise SystemExit(1)
