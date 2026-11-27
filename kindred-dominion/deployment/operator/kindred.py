#!/usr/bin/env python3
"""Trusted local operator entry point. Never invoked by the web application."""
from __future__ import annotations
import argparse
import json
import signal
import sys
from pathlib import Path
if __package__:
    from .core import OperatorError, update, backup
    from .host import Host
else:
    from core import OperatorError, update, backup
    from host import Host


def main(argv=None, *, lock_lease=None, approval=None):
    parser = argparse.ArgumentParser(description="Reviewed homeserver TEST operations; no automatic pruning or in-place database restoration.")
    parser.add_argument("--config", default="/etc/kindred-dominion/test/operator.json")
    commands = parser.add_subparsers(dest="command", required=True)
    deploy = commands.add_parser("update")
    deploy.add_argument("revision")
    deploy.add_argument("--reviewed", action="store_true")
    deploy.add_argument("--rehearse-only", action="store_true")
    deploy.add_argument("--resume", action="store_true")
    for name in ("status", "backup", "start", "stop", "restart"):
        commands.add_parser(name)
    rollback = commands.add_parser("rollback")
    choice = rollback.add_mutually_exclusive_group(required=True)
    choice.add_argument("--to", metavar="DEPLOYMENT_ID")
    choice.add_argument("--prepare-recovery", metavar="PRIVATE_BACKUP_DIRECTORY")
    choice.add_argument("--complete-recovery", metavar="RECOVERY_PLAN_ID")
    rollback.add_argument("--preserved-database")
    rollback.add_argument("--reviewed", action="store_true")
    args = parser.parse_args(argv)
    def interrupted(_signal, _frame):
        raise OperatorError("Operator command interrupted. Inspect the durable private journal before restarting writers.")
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        host = Host(args.config, lock_lease=lock_lease)
        if args.command == "update":
            if not approval or approval.get("revision") != args.revision or lock_lease is None:
                raise OperatorError("Use the installed sudo kindred-update command so release approval and operator integrity are verified automatically.")
            host.release_approval = approval
            result = update(host, args.revision, reviewed=True, rehearse_only=args.rehearse_only, resume=args.resume)
            result["message"] = "Kindred Dominion is up to date." if result.get("unchanged") else "Kindred Dominion rehearsal completed." if result.get("rehearsed") else "Kindred Dominion update completed."
            result["releaseApproval"] = approval
        elif args.command == "backup":
            result = backup(host)
        elif args.command == "status":
            host.preflight()
            latest = host.state_dir / "latest.json"
            record = json.loads(latest.read_text()) if latest.exists() else {}
            if record.get("databaseMayHaveChanged") and record.get("phase") != "completed":
                host.resume_context = record
            current = host.current()
            try:
                host.verify_healthy(current)
                healthy = True
            except OperatorError:
                healthy = False
            result = {"application": current, "database": host.database_state(), "healthy": healthy, "latest": json.loads(latest.read_text()) if latest.exists() else None, "log": str(host.run.logfile)}
        else:
            with host.lock():
                host.preflight()
                if args.command == "rollback":
                    if not args.reviewed:
                        raise OperatorError("Controlled rollback/recovery requires explicit --reviewed acknowledgement.")
                    if args.prepare_recovery:
                        result = host.prepare_recovery(args.prepare_recovery)
                    elif args.complete_recovery:
                        if not args.preserved_database:
                            raise OperatorError("Name the separately preserved newer database with --preserved-database.")
                        result = host.complete_recovery(args.complete_recovery, args.preserved_database)
                    else:
                        host.require_recoverable(None, False)
                        result = host.rollback(args.to)
                else:
                    if args.command != "stop":
                        host.require_recoverable(None, False)
                    else:
                        latest = host.state_dir / "latest.json"
                        record = json.loads(latest.read_text()) if latest.exists() else {}
                        if record.get("databaseMayHaveChanged") and record.get("phase") != "completed":
                            host.resume_context = record
                    current = host.current()
                    if args.command in ("stop", "restart"):
                        host.stop(current)
                    if args.command in ("start", "restart"):
                        host.start(current)
                        host.verify_healthy(current)
                    result = {"operation": args.command, "revision": current["revision"], "otherServicesAffected": False}
        print(json.dumps(result, indent=2))
        return 0
    except OperatorError as error:
        print("Kindred stopped safely: " + str(error), file=sys.stderr)
        return 1
    except Exception:
        print("Kindred operator failed. Inspect the private log/journal; credentials and raw database errors were not printed.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
