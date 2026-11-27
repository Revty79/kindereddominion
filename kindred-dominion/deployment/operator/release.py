"""Fail-closed public GitHub release approval; no credentials or moving deploy refs."""
from __future__ import annotations
import hashlib
import json
import urllib.error
import urllib.request
from .core import OperatorError, revision

API = "https://api.github.com/repos/Revty79/kindereddominion/"
NO_RELEASE = "No eligible approved release was found. Leave the current application running. Ask the owner to review the main revision and run GitHub Actions 'Approve Kindred release', then retry sudo kindred-update."


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise OperatorError("GitHub approval API redirected; release verification stopped.")


class GitHub:
    def __init__(self):
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def get(self, suffix):
        if not suffix.startswith("actions/") or ".." in suffix:
            raise OperatorError("Unexpected approval API path.")
        request = urllib.request.Request(API + suffix, headers={"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "kindred-verified-updater/1"})
        try:
            with self.opener.open(request, timeout=30) as response:
                data = response.read(8 * 1024 * 1024 + 1)
                if len(data) > 8 * 1024 * 1024:
                    raise OperatorError("GitHub approval response exceeded its safety limit.")
                return json.loads(data)
        except (OSError, ValueError, urllib.error.HTTPError) as error:
            raise OperatorError("GitHub approval verification is unavailable or rate limited. Nothing was deployed. Retry sudo kindred-update later; inspect local network/API availability if it persists.") from error


def latest_per_sha(runs):
    result = {}
    for run in runs:
        sha = run.get("head_sha")
        if isinstance(sha, str) and (run.get("id", 0), run.get("run_attempt", 0)) > (result.get(sha, {}).get("id", 0), result.get(sha, {}).get("run_attempt", 0)):
            result[sha] = run
    return result


class Approvals:
    def __init__(self, policy, blob, api=None):
        self.policy, self.blob, self.api = policy, blob, api or GitHub()

    def runs(self, workflow, sha=None):
        # Bound lookup; older releases require a new owner approval, never an
        # unbounded API scan or an unsigned fallback.
        runs = []
        for page in (1, 2):
            suffix = "&head_sha=" + revision(sha) if sha else ""
            batch = self.api.get("actions/workflows/" + workflow + "/runs?branch=main&per_page=100&page=" + str(page) + suffix).get("workflow_runs", [])
            runs.extend(batch)
            if len(batch) < 100:
                break
        return latest_per_sha(runs)

    def successful(self, run, sha, workflow, event, job, owner=False):
        p = self.policy
        if not run or any((run.get("head_sha") != sha, run.get("head_branch") != "main", run.get("event") != event, run.get("path") != ".github/workflows/" + workflow, run.get("head_repository", {}).get("id") != p["repositoryId"], run.get("repository", {}).get("id") != p["repositoryId"], run.get("status") != "completed", run.get("conclusion") != "success")):
            return False
        if owner and any(run.get(key, {}).get("id") not in p["approverIds"] for key in ("actor", "triggering_actor")):
            return False
        expected = p["workflowSha256"].get(workflow)
        if not expected or hashlib.sha256(self.blob(sha, ".github/workflows/" + workflow)).hexdigest() != expected:
            return False
        jobs = self.api.get("actions/runs/" + str(int(run["id"])) + "/attempts/" + str(int(run.get("run_attempt", 1))) + "/jobs?per_page=100")
        values = jobs.get("jobs", [])
        if jobs.get("total_count") != len(values) or not values or job not in [item.get("name") for item in values]:
            return False
        # Skipped jobs/steps are not successful approval evidence.
        return all(item.get("head_sha") == sha and item.get("status") == "completed" and item.get("conclusion") == "success" and item.get("steps") and all(step.get("status") == "completed" and step.get("conclusion") == "success" for step in item["steps"]) for item in values)

    def verify(self, sha, approval=None, ci=None):
        revision(sha)
        approval = approval if approval is not None else self.runs("kindred-release.yml", sha).get(sha)
        ci = ci if ci is not None else self.runs("kindred-ci.yml", sha).get(sha)
        if not self.successful(approval, sha, "kindred-release.yml", "workflow_dispatch", "approve", True) or not self.successful(ci, sha, "kindred-ci.yml", "push", "validate"):
            raise OperatorError(NO_RELEASE)
        return {"revision": sha, "repositoryId": self.policy["repositoryId"], "approvalRun": approval["id"], "approvalAttempt": approval.get("run_attempt", 1), "ciRun": ci["id"], "ciAttempt": ci.get("run_attempt", 1), "approverId": approval["actor"]["id"], "policy": "owner-dispatch-and-source-ci-v1"}

    def select(self, candidates, requested=None):
        approvals, ci = self.runs("kindred-release.yml"), self.runs("kindred-ci.yml")
        if requested:
            revision(requested)
            if requested not in candidates:
                raise OperatorError("Requested revision is outside the forward main release history. No downgrade or unrelated revision was deployed.")
            candidates = [requested]
        for sha in candidates:
            if sha not in approvals or sha not in ci:
                continue
            try:
                return self.verify(sha, approvals[sha], ci[sha])
            except OperatorError as error:
                if str(error) != NO_RELEASE:
                    raise
        raise OperatorError(NO_RELEASE)
