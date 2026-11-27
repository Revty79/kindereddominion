#!/usr/bin/env python3
"""Install reviewed operator code locally; never deploy, migrate or replace secrets."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
from core import OperatorError, revision

MARKER = "# Kindred Dominion managed operator wrapper"
FILES = ("core.py", "host.py", "kindred.py", "operator.example.json")
ACTIONS = ("update", "status", "backup", "rollback", "start", "stop", "restart")


def private_directory(path):
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    info = path.stat()
    if path.resolve() != path or info.st_uid != 0 or info.st_mode & 0o077:
        raise OperatorError("Existing private directory must be canonical, root-owned and mode 0700: " + str(path))


def main():
    parser = argparse.ArgumentParser(description="Install seven permanent local operator commands from a reviewed clean commit; do not modify running services or private credentials.")
    parser.add_argument("--revision", required=True)
    parser.add_argument("--reviewed", action="store_true")
    args = parser.parse_args()
    selected = revision(args.revision)
    if not args.reviewed:
        raise OperatorError("Explicit --reviewed acknowledgement is required.")
    if os.name != "posix" or os.geteuid() != 0 or socket.gethostname().split(".")[0] != "homeserver":
        raise OperatorError("Run locally with sudo on homeserver. No server connection was attempted.")
    release = dict(line.split("=", 1) for line in Path("/etc/os-release").read_text().splitlines() if "=" in line)
    if release.get("ID", "").strip('"') != "ubuntu" or release.get("VERSION_ID", "").strip('"') != "24.04":
        raise OperatorError("The reviewed target is Ubuntu 24.04.")
    source = Path(__file__).resolve().parent
    repo = source.parents[2]
    if repo != Path("/srv/kindred-dominion/source/repository") or repo.resolve() != repo:
        raise OperatorError("Run the installer from the reviewed repository path.")
    def git(*parts):
        return subprocess.check_output(["git", "-c", "safe.directory=" + str(repo), "-C", str(repo), *parts], text=True).strip()
    if git("rev-parse", "HEAD") != selected or git("status", "--porcelain", "--untracked-files=no"):
        raise OperatorError("Installer revision must exactly match clean tracked source; nothing was reset or cleaned.")
    if git("remote", "get-url", "origin").lower() not in ("https://github.com/revty79/kindereddominion.git", "git@github.com:revty79/kindereddominion.git"):
        raise OperatorError("Unexpected repository origin.")
    git("ls-files", "--error-unmatch", *[str((source / name).relative_to(repo)) for name in FILES])
    private = Path("/etc/kindred-dominion/test")
    for path in (private, Path("/srv/kindred-dominion/backups"), Path("/srv/kindred-dominion/state")):
        private_directory(path)
    config = private / "operator.json"
    if config.is_symlink():
        raise OperatorError("Operator configuration cannot be a symlink.")
    # Existing environment/configuration is never replaced or re-keyed.
    if not config.exists():
        with config.open("xb") as stream:
            os.chmod(config, 0o600)
            stream.write((source / "operator.example.json").read_bytes())
    if config.stat().st_uid != 0 or config.stat().st_mode & 0o077:
        raise OperatorError("Existing operator.json must be root-owned and mode 0600.")
    library = Path("/usr/local/lib/kindred-dominion")
    library.mkdir(parents=True, exist_ok=True, mode=0o755)
    if library.resolve() != library or library.stat().st_uid != 0 or library.stat().st_mode & 0o022:
        raise OperatorError("Operator library directory is not trusted root-owned storage.")
    version = library / selected
    version.mkdir(exist_ok=True, mode=0o755)
    if version.resolve() != version or version.stat().st_uid != 0 or version.stat().st_mode & 0o022:
        raise OperatorError("Operator version directory is not trusted storage.")
    hashes = {}
    for name in FILES:
        data = (source / name).read_bytes()
        target = version / name
        if target.exists() or target.is_symlink():
            if target.is_symlink() or target.read_bytes() != data or target.stat().st_uid != 0 or target.stat().st_mode & 0o022:
                raise OperatorError("Existing pinned operator file differs; it was not overwritten.")
        else:
            with target.open("xb") as stream:
                os.chmod(target, 0o644)
                stream.write(data)
        hashes[name] = hashlib.sha256(data).hexdigest()
    for action in ACTIONS:
        wrapper = Path("/usr/local/bin/kindred-" + action)
        if wrapper.is_symlink() or wrapper.exists() and MARKER not in wrapper.read_text():
            raise OperatorError("Refusing to overwrite an unrelated existing command: " + str(wrapper))
    # Install wrappers only after all pinned code and collisions were validated.
    for action in ACTIONS:
        wrapper = Path("/usr/local/bin/kindred-" + action)
        temporary = wrapper.with_suffix(".new-" + selected)
        with temporary.open("x", encoding="utf-8") as stream:
            os.chmod(temporary, 0o755)
            stream.write('#!/bin/sh\n' + MARKER + '\nexec /usr/bin/python3 -B "' + str(version / "kindred.py") + '" ' + action + ' "$@"\n')
        os.replace(temporary, wrapper)
    print(json.dumps({"installedOperatorRevision": selected, "commands": ["kindred-" + action for action in ACTIONS], "codeSha256": hashes, "privateCredentialsReplaced": False, "applicationDeployed": False}, indent=2))


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OperatorError, OSError, subprocess.SubprocessError) as error:
        print("Operator installation stopped: " + str(error), file=sys.stderr)
        raise SystemExit(1)
