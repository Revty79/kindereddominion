"""Immutable operator bundles and atomic, durable activation (protocol 1)."""
from __future__ import annotations
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import uuid
from .core import OperatorError, revision
from .host import write_json

FILES = ("__init__.py", "bootstrap.py", "bundle.py", "release.py", "core.py", "host.py", "kindred.py", "operator.example.json", "operator-runtime.json")
PREFIX = "kindred-dominion/deployment/operator/"
MAX_FILE = 512 * 1024


def secure(path, *, private=False):
    path = Path(path)
    info = path.stat()
    if path.is_symlink() or path.resolve() != path or os.name == "posix" and (info.st_uid != 0 or info.st_mode & (0o077 if private else 0o022)):
        raise OperatorError("Untrusted operator storage: " + str(path))


def git_blob(repo, sha, path):
    revision(sha)
    if not re.fullmatch(r"[A-Za-z0-9_./-]+", path) or ".." in path:
        raise OperatorError("Invalid release file path.")
    base = ["git", "--no-replace-objects", "-c", "safe.directory=" + str(repo), "-c", "core.hooksPath=/dev/null", "-C", str(repo)]
    try:
        mode = subprocess.check_output([*base, "ls-tree", sha, "--", path], stderr=subprocess.DEVNULL, timeout=30).decode()
        if not mode.startswith("100644 blob ") or not mode.endswith("\t" + path + "\n"):
            raise OperatorError("Release file is missing or is not a regular tracked file: " + path)
        size = int(subprocess.check_output([*base, "cat-file", "-s", sha + ":" + path], stderr=subprocess.DEVNULL, timeout=30))
        if size > MAX_FILE:
            raise OperatorError("Operator file exceeded its size limit.")
        return subprocess.check_output([*base, "cat-file", "blob", sha + ":" + path], stderr=subprocess.DEVNULL, timeout=30)
    except subprocess.SubprocessError as error:
        raise OperatorError("Cannot read the exact approved operator Git objects; no code was activated.") from error


def validate_record(library, record):
    sha = revision(record.get("revision"))
    secure(library)
    secure(library / "releases")
    directory = library / "releases" / sha
    secure(directory)
    hashes = record.get("files", {})
    if set(hashes) != set(FILES):
        raise OperatorError("Operator bundle file list is incomplete or unsupported.")
    for name, expected in hashes.items():
        target = directory / name
        secure(target)
        if target.stat().st_size > MAX_FILE or hashlib.sha256(target.read_bytes()).hexdigest() != expected:
            raise OperatorError("Installed operator integrity failed; application was not changed. Restore the previous verified operator pointer using the documented operator recovery command.")
    metadata = json.loads((directory / "operator-runtime.json").read_text())
    if metadata != {"protocol": 1, "files": list(FILES)}:
        raise OperatorError("Unsupported operator protocol; a reviewed one-time trust upgrade is required.")
    return directory


def load(library, record):
    directory = validate_record(library, record)
    name = "kindred_operator_" + record["revision"]
    if name not in sys.modules:
        spec = importlib.util.spec_from_file_location(name, directory / "__init__.py", submodule_search_locations=[str(directory)])
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
    return name


def stage(library, sha, blob, approval):
    revision(sha)
    secure(library)
    releases = library / "releases"
    releases.mkdir(mode=0o755, exist_ok=True)
    secure(releases)
    # Read and validate ALL bytes before creating any executable installation.
    data = {name: blob(sha, PREFIX + name) for name in FILES}
    if any(len(value) > MAX_FILE for value in data.values()) or json.loads(data["operator-runtime.json"]) != {"protocol": 1, "files": list(FILES)}:
        raise OperatorError("Candidate operator protocol/file bounds are incompatible; existing operator retained.")
    for name in FILES:
        if name.endswith(".py"):
            compile(data[name], name, "exec")
    record = {"revision": sha, "files": {name: hashlib.sha256(value).hexdigest() for name, value in data.items()}, "approval": approval}
    destination = releases / sha
    if destination.exists() or destination.is_symlink():
        validate_record(library, record)
        return record
    temporary = releases / (".partial-" + sha + "-" + uuid.uuid4().hex)
    temporary.mkdir(mode=0o755)
    for name, value in data.items():
        with (temporary / name).open("xb") as stream:
            os.chmod(temporary / name, 0o644)
            stream.write(value)
            stream.flush()
            os.fsync(stream.fileno())
    # Check imports/entry point in a separate interpreter before activation.
    # No Host construction, private environment, Docker or database access.
    command = [sys.executable, "-E", "-s", "-B", "-c", "import importlib.util,sys; p=sys.argv[1]; s=importlib.util.spec_from_file_location('probe',p+'/__init__.py',submodule_search_locations=[p]); m=importlib.util.module_from_spec(s); sys.modules['probe']=m; s.loader.exec_module(m); from probe import bootstrap,kindred; assert callable(bootstrap.main) and callable(kindred.main)", str(temporary)]
    clean = {"PATH": os.environ.get("PATH", ""), "SYSTEMROOT": os.environ.get("SYSTEMROOT", ""), "LANG": "C.UTF-8"}
    try:
        subprocess.run(command, env=clean, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30, check=True)
    except subprocess.SubprocessError as error:
        raise OperatorError("Approved operator failed its isolated import check; previous operator retained. Inspect release validation and retry sudo kindred-update after a corrected approval.") from error
    os.rename(temporary, destination)
    if os.name == "posix":
        descriptor = os.open(releases, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    validate_record(library, record)
    return record


def activate(library, state, record, previous):
    validate_record(library, record)
    if previous == record:
        return
    # A crash here leaves either the complete old pointer or complete new one.
    if previous:
        write_json(state / "operator-previous.json", previous)
    write_json(state / "operator-upgrade.json", {"phase": "prepared", "previous": previous, "candidate": record})
    write_json(state / "operator-current.json", record)
    write_json(state / "operator-upgrade.json", {"phase": "activated", "previous": previous, "candidate": record})
