"""Owner-triggered release publication check; no secrets, deployment or bypass."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys

source = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("approval", source / "__init__.py", submodule_search_locations=[str(source)])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
from approval.release import Approvals
from approval.bundle import git_blob
from approval.core import OperatorError, revision


def main():
    policy = json.loads((source / "release-trust.json").read_text())
    sha = revision(os.environ.get("RELEASE_SHA"))
    if os.environ.get("RELEASE_REF") != "refs/heads/main" or os.environ.get("RELEASE_EVENT") != "workflow_dispatch" or int(os.environ.get("RELEASE_REPOSITORY_ID", "0")) != policy["repositoryId"] or int(os.environ.get("RELEASE_ACTOR_ID", "0")) not in policy["approverIds"]:
        raise OperatorError("Only the repository owner may approve an exact main revision using this manual workflow.")
    repo = source.parents[2]
    if subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip() != sha:
        raise OperatorError("Approval checkout does not match the immutable dispatch revision.")
    approvals = Approvals(policy, lambda commit, path: git_blob(repo, commit, path))
    ci = approvals.runs("kindred-ci.yml").get(sha)
    if not approvals.successful(ci, sha, "kindred-ci.yml", "push", "validate"):
        raise OperatorError("Exact source CI is missing, pending or unsuccessful. Wait for Validate Kindred source to succeed, then rerun this approval workflow.")
    print(json.dumps({"approvedRevision": sha, "sourceCiRun": ci["id"], "sourceCiAttempt": ci.get("run_attempt", 1), "deploymentPerformed": False}))


if __name__ == "__main__":
    main()
