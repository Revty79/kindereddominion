#!/usr/bin/env python3
"""Small installed trust anchor. Versioned runtime performs verified self-updates."""
import hashlib
import importlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys

LIBRARY = Path("/usr/local/lib/kindred-dominion")
STATE = Path("/srv/kindred-dominion/state")
TRUST = Path("/etc/kindred-dominion/test/release-trust.json")


def checked(path, private=False):
    value = path.stat()
    if path.is_symlink() or path.resolve() != path or value.st_uid != 0 or value.st_mode & (0o077 if private else 0o022):
        raise RuntimeError("Operator trust storage has unsafe ownership, permissions or symlinks.")


def recover_operator():
    import fcntl
    checked(STATE / "operator-previous.json", True)
    checked(STATE / "operator.lock", True)
    with (STATE / "operator.lock").open("a+b") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        previous = json.loads((STATE / "operator-previous.json").read_text())
        # Validate all retained bytes using this stable launcher before import.
        validate(previous)
        temporary = STATE / "operator-current.recovery-new"
        with temporary.open("x") as stream:
            os.chmod(temporary, 0o600)
            json.dump(previous, stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, STATE / "operator-current.json")
        descriptor = os.open(STATE, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    print("Restored previous verified operator only. Application and database were unchanged. Run sudo kindred-status before retrying sudo kindred-update.")
    return 0


def validate(record):
    sha = record.get("revision", "")
    if not re.fullmatch("[0-9a-f]{40}", sha):
        raise RuntimeError("Invalid installed operator revision.")
    directory = LIBRARY / "releases" / sha
    checked(directory)
    files = record.get("files", {})
    required = {"__init__.py", "bootstrap.py", "bundle.py", "release.py", "core.py", "host.py", "kindred.py", "operator.example.json", "operator-runtime.json"}
    if set(files) != required:
        raise RuntimeError("Incomplete operator integrity receipt.")
    for name, expected in files.items():
        file = directory / name
        checked(file)
        if file.stat().st_size > 512 * 1024 or hashlib.sha256(file.read_bytes()).hexdigest() != expected:
            raise RuntimeError("Installed operator integrity check failed. Run sudo kindred-update --recover-operator; application data was not changed. If the retained operator is also damaged, reinstall from the reviewed Git revision as documented.")
    return sha, directory


def boot(argv):
    if os.name != "posix" or os.geteuid() != 0:
        raise RuntimeError("Run the installed command with sudo on homeserver.")
    # No user-controlled Python/Git/loader configuration is inherited by root.
    for key in list(os.environ):
        if key.startswith(("PYTHON", "GIT_", "LD_", "PG", "KINDRED_", "COMPOSE_", "DOCKER_")):
            os.environ.pop(key)
    os.environ["PATH"] = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
    for path, private in ((LIBRARY, False), (LIBRARY / "releases", False), (STATE, True), (TRUST, True)):
        checked(path, private)
    if argv == ["update", "--recover-operator"]:
        return recover_operator()
    checked(STATE / "operator-current.json", True)
    record = json.loads((STATE / "operator-current.json").read_text())
    sha, directory = validate(record)
    package = "kindred_operator_" + sha
    spec = importlib.util.spec_from_file_location(package, directory / "__init__.py", submodule_search_locations=[str(directory)])
    module = importlib.util.module_from_spec(spec)
    sys.modules[package] = module
    spec.loader.exec_module(module)
    return importlib.import_module(package + ".bootstrap").main(argv, library=LIBRARY, state=STATE, trust=TRUST, current=record)


if __name__ == "__main__":
    try:
        raise SystemExit(boot(sys.argv[1:]))
    except Exception as error:
        # Only trusted, deliberately public OperatorError text may be printed.
        message = str(error) if isinstance(error, RuntimeError) else "Operator startup failed; inspect private state and use the documented operator recovery procedure."
        print("Kindred stopped safely: " + message, file=sys.stderr)
        raise SystemExit(1)
