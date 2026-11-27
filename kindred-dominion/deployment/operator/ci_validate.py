"""Disposable Ubuntu CI: actual three Docker builds and hardened unit container."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

source = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("ci_operator", source / "__init__.py", submodule_search_locations=[str(source)])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
from ci_operator.host import unit_validation_command


def main():
    app = source.parents[1]
    sha = subprocess.check_output(["git", "-C", str(app), "rev-parse", "HEAD"], text=True).strip()
    images = {}
    for name, dockerfile, target in (("game", "Dockerfile", None), ("backend", "Dockerfile.backend", "runtime"), ("maintenance", "Dockerfile.backend", "maintenance")):
        tag = "kindred-ci-" + name + ":" + sha
        command = ["docker", "build", "--build-arg", "VCS_REF=" + sha, "--tag", tag, "--file", dockerfile]
        if target:
            command.extend(("--target", target))
        subprocess.run([*command, "."], cwd=app, check=True)
        images[name] = subprocess.check_output(["docker", "image", "inspect", "--format", "{{.Id}}", tag], text=True).strip()
        user = subprocess.check_output(["docker", "image", "inspect", "--format", "{{.Config.User}}", tag], text=True).strip()
        if user not in ("1000:1000", "101:101"):
            raise RuntimeError("Candidate image is not explicitly nonroot.")
    subprocess.run(unit_validation_command(images["maintenance"]), check=True)
    # Separate immutable root-filesystem write probe, also networkless and
    # credential-free. A successful write must fail CI.
    subprocess.run(["docker", "run", "--rm", "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", "--entrypoint", "node", images["maintenance"], "-e", "try{require('fs').writeFileSync('/app/src/ci-write-probe','forbidden');process.exit(1)}catch(e){if(!['EROFS','EACCES'].includes(e.code))throw e}"], check=True)
    proof = "kindred-ci-pg18:" + sha
    subprocess.run(["docker", "build", "--build-arg", "MAINTENANCE_IMAGE=kindred-ci-maintenance:" + sha, "--tag", proof, "--file", "deployment/operator/Dockerfile.postgres-proof", "."], cwd=app, check=True)
    repository = app.parent.resolve()
    subprocess.run(["docker", "run", "--rm", "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", "--pids-limit", "256", "--tmpfs", "/tmp:rw,nosuid,nodev,size=128m,mode=1777", "--tmpfs", "/app/node_modules/.vite-temp:rw,nosuid,nodev,size=64m,mode=0700,uid=1000,gid=1000", "--tmpfs", "/app/node_modules/.vite:rw,nosuid,nodev,size=128m,mode=0700,uid=1000,gid=1000", "--tmpfs", "/app/.local:rw,nosuid,nodev,size=128m,mode=0700,uid=1000,gid=1000", "--tmpfs", "/proof:rw,nosuid,nodev,size=2g,mode=0700,uid=1000,gid=1000", "--tmpfs", "/var/lib/postgresql:ro,nosuid,nodev,size=1m,mode=0555", "--mount", "type=bind,src=" + str(repository) + ",dst=/source,readonly", proof], check=True)
    print(json.dumps({"revision": sha, "images": images, "networklessReadOnlyFullSuite": True, "sourceWritesDenied": True, "postgres18FullRehearsal": True, "hostDeploymentPerformed": False}, indent=2))


if __name__ == "__main__":
    main()
