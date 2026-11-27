"""Environment-scoped release eligibility; public CI for TEST, approval for production."""
from __future__ import annotations
import hashlib
import json
import urllib.error
import urllib.request
if __package__:
    from .core import OperatorError, revision
else:
    from core import OperatorError, revision

API = "https://api.github.com/repos/Revty79/kindereddominion/"
NO_RELEASE = "No eligible approved release was found. Leave the current application running. Ask the owner to review the main revision and run GitHub Actions 'Approve Kindred release', then retry sudo kindred-update."
NO_TEST_RELEASE = "No eligible TEST release with successful exact-commit main CI was found. The current application was not changed. Check 'Validate Kindred source' for a successful revision and retry sudo kindred-update. No GitHub login or manual release approval is required for TEST."
TEST_POLICY = "test-exact-main-ci-v1"
PRODUCTION_POLICY = "owner-dispatch-and-source-ci-v1"
TEST_TARGET = {"environment": "test", "hostname": "homeserver", "privateDirectory": "/etc/kindred-dominion/test", "database": "kindred_dominion_test", "migrationRole": "kindred_test_migrator", "runtimeRole": "kindred_test_runtime", "databaseHost": "127.0.0.1", "databasePort": 5432, "databaseGuard": {"environment": "test", "disposable": False}}


def validate_policy(policy, environment):
    settings = policy.get("environments", {}).get(environment, {})
    expected = {"test": TEST_POLICY, "production": PRODUCTION_POLICY}.get(environment)
    if policy.get("format") != 2 or not expected or settings.get("eligibility") != expected:
        raise OperatorError("Missing or unsupported environment-specific release trust. Run the documented one-time reviewed TEST policy upgrade; no application was changed.")
    if environment == "production" and settings.get("deploymentEnabled") is not False:
        raise OperatorError("Production deployment remains disabled until separately authorized; TEST settings cannot enable it.")
    if environment == "test" and (settings.get("deploymentEnabled") is not True or settings.get("target") != TEST_TARGET):
        raise OperatorError("TEST release trust is not bound to the fixed homeserver TEST database and roles.")
    return settings


def require_test_scope(approval, target):
    if target != TEST_TARGET or approval.get("environment") != "test" or approval.get("target") != TEST_TARGET or approval.get("policy") != TEST_POLICY or approval.get("deploymentEnabled") is not True:
        raise OperatorError("Release policy/target mismatch. TEST CI eligibility cannot authorize a production database or deployment.")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise OperatorError("GitHub release API redirected; release verification stopped.")


class GitHub:
    def __init__(self):
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def get(self, suffix):
        if not suffix.startswith("actions/") or ".." in suffix:
            raise OperatorError("Unexpected CI/release API path.")
        request = urllib.request.Request(API + suffix, headers={"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "kindred-verified-updater/1"})
        try:
            with self.opener.open(request, timeout=30) as response:
                data = response.read(8 * 1024 * 1024 + 1)
                if len(data) > 8 * 1024 * 1024:
                    raise OperatorError("GitHub CI/release response exceeded its safety limit.")
                return json.loads(data)
        except (OSError, ValueError, urllib.error.HTTPError) as error:
            raise OperatorError("Public GitHub CI/release verification is unavailable or rate limited. Nothing was deployed. Retry sudo kindred-update later; inspect local network/API availability if it persists. TEST needs no GitHub login or API credentials.") from error


def latest_per_sha(runs):
    result = {}
    for run in runs:
        sha = run.get("head_sha")
        if isinstance(sha, str) and (run.get("id", 0), run.get("run_attempt", 0)) > (result.get(sha, {}).get("id", 0), result.get(sha, {}).get("run_attempt", 0)):
            result[sha] = run
    return result


class Approvals:
    def __init__(self, policy, blob, api=None, *, environment="production", target=None):
        self.policy, self.blob, self.api = policy, blob, api or GitHub()
        self.environment, self.target = environment, target
        validate_policy(policy, "production")
        self.settings = validate_policy(policy, environment)
        self.no_release = NO_TEST_RELEASE if environment == "test" else NO_RELEASE

    def require_deployment_allowed(self):
        if self.environment != "test":
            raise OperatorError("Production deployment is disabled until separately authorized, even with explicit release approval.")
        if self.target != TEST_TARGET:
            raise OperatorError("TEST release policy requires the verified homeserver TEST database identity and environment guard.")

    def runs(self, workflow, sha=None):
        # Bound discovery; advanced/resume verification queries an exact SHA.
        # No unbounded scan or unvalidated fallback.
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
        ci = ci if ci is not None else self.runs("kindred-ci.yml", sha).get(sha)
        if not self.successful(ci, sha, "kindred-ci.yml", "push", "validate"):
            raise OperatorError(self.no_release)
        receipt = {"revision": sha, "repositoryId": self.policy["repositoryId"], "ciRun": ci["id"], "ciAttempt": ci.get("run_attempt", 1), "environment": self.environment, "deploymentEnabled": self.settings["deploymentEnabled"], "policy": self.settings["eligibility"]}
        if self.environment == "test":
            self.require_deployment_allowed()
            # Never self-update back to the legacy owner-login runtime, even
            # when that older main revision has green source CI.
            try:
                runtime = json.loads(self.blob(sha, "kindred-dominion/deployment/operator/operator-runtime.json"))
            except (OperatorError, ValueError) as error:
                raise OperatorError(self.no_release) from error
            if runtime.get("protocol") != 1 or TEST_POLICY not in runtime.get("releasePolicies", []):
                raise OperatorError(self.no_release)
            receipt["target"] = self.target
            return receipt
        approval = approval if approval is not None else self.runs("kindred-release.yml", sha).get(sha)
        if not self.successful(approval, sha, "kindred-release.yml", "workflow_dispatch", "approve", True):
            raise OperatorError(self.no_release)
        receipt.update(approvalRun=approval["id"], approvalAttempt=approval.get("run_attempt", 1), approverId=approval["actor"]["id"])
        return receipt

    def select(self, candidates, requested=None):
        ci = self.runs("kindred-ci.yml")
        approvals = self.runs("kindred-release.yml") if self.environment == "production" else {}
        if requested:
            revision(requested)
            if requested not in candidates:
                raise OperatorError("Requested revision is outside the forward main release history. No downgrade or unrelated revision was deployed.")
            candidates = [requested]
        for sha in candidates:
            if sha not in ci or self.environment == "production" and sha not in approvals:
                continue
            try:
                return self.verify(sha, approvals.get(sha), ci[sha])
            except OperatorError as error:
                if str(error) != self.no_release:
                    raise
        raise OperatorError(self.no_release)
