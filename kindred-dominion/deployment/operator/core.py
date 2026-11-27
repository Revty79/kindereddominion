"""Deployment ordering and failure semantics, independent of the host adapter."""
from __future__ import annotations
import re


class OperatorError(RuntimeError):
    pass


def revision(value: str) -> str:
    if not re.fullmatch(r"[0-9a-f]{40}", value or ""):
        raise OperatorError("Select a reviewed full 40-character lowercase Git commit, not a moving branch or tag.")
    return value


def update(host, requested, *, reviewed=False, rehearse_only=False, resume=False):
    revision(requested)
    if not reviewed:
        raise OperatorError("The trusted operator must acknowledge release review with --reviewed.")
    if resume and rehearse_only:
        raise OperatorError("A post-migration resume cannot use --rehearse-only or start the older application.")
    with host.lock():
        host.preflight()
        host.require_recoverable(requested, resume)
        candidate = host.source(requested)
        old = host.current()
        host.check_forward(old, candidate)
        if old["revision"] == requested and not resume:
            host.verify_healthy(old)
            return {"revision": requested, "unchanged": True}
        journal = host.journal("update", requested, old)
        stopped = False
        migration_attempted = bool(getattr(host, "resume_context", None))
        if migration_attempted:
            journal["databaseMayHaveChanged"] = True
            host.phase(journal, "resuming-uncertain-migration")
        try:
            host.phase(journal, "building-before-downtime")
            host.build(candidate)
            journal["candidate"] = candidate
            host.phase(journal, "stopping-application-writers")
            host.stop(old)
            stopped = True
            host.no_other_writers()
            host.phase(journal, "verified-backup")
            backup = host.backup(old, candidate if resume else old)
            journal["backup"] = backup["directory"]
            host.phase(journal, "isolated-restore-rehearsal")
            rehearsal = host.rehearse(backup, candidate, migrate=True)
            journal["rehearsal"] = rehearsal
            host.recheck_private_configuration()
            host.no_other_writers()
            if rehearse_only:
                host.start(old)
                host.verify_healthy(old)
                stopped = False
                host.phase(journal, "completed-rehearsal-only")
                return {"revision": requested, "rehearsed": True, "liveDatabaseMigrated": False, "backup": backup["directory"]}
            # Persist this uncertainty BEFORE invoking any live migration command.
            migration_attempted = True
            journal["databaseMayHaveChanged"] = True
            host.phase(journal, "live-migration-started")
            host.migrate(candidate)
            host.phase(journal, "published-content-synchronization")
            host.publish(candidate)
            host.grants()
            host.verify_preservation(backup)
            candidate["database"] = host.database_state()
            host.phase(journal, "starting-reviewed-images")
            host.start(candidate)
            host.verify_healthy(candidate)
            stopped = False
            host.complete(candidate, journal)
            host.phase(journal, "completed")
            return {"revision": requested, "completed": True, "backup": backup["directory"]}
        except BaseException as error:
            journal["error"] = str(error) if isinstance(error, OperatorError) else "Operation interrupted or failed; inspect the private log."
            journal["databaseMayHaveChanged"] = migration_attempted
            journal["previousApplicationResumed"] = False
            if stopped and not migration_attempted and host.safe_to_resume(old):
                try:
                    host.start(old)
                    host.verify_healthy(old)
                    journal["previousApplicationResumed"] = True
                except BaseException:
                    pass
            if migration_attempted:
                # Even a transaction failure is uncertain until a trusted operator
                # inspects it. Never restore old data or start an older schema here.
                try:
                    host.stop(candidate)
                except BaseException:
                    pass
            host.phase(journal, "failed-after-migration" if migration_attempted else "failed-before-migration")
            raise OperatorError(journal["error"] + (" Application writers remain stopped. Run sudo kindred-status and inspect its private log; after review run sudo kindred-update --resume for this exact failed revision, or use the documented kindred-rollback separate-database recovery." if migration_attempted else " No live migration was attempted. Run sudo kindred-status, inspect its private log and retry sudo kindred-update after correcting the cause.")) from error


def backup(host):
    with host.lock():
        host.preflight()
        host.require_recoverable(None, False)
        old = host.current()
        journal = host.journal("backup", old["revision"], old)
        stopped = False
        try:
            host.phase(journal, "stopping-application-writers")
            host.stop(old)
            stopped = True
            host.no_other_writers()
            host.phase(journal, "verified-backup")
            result = host.backup(old, old)
            journal["backup"] = result["directory"]
            host.phase(journal, "isolated-restore-verification")
            journal["rehearsal"] = host.rehearse(result, old, migrate=False)
            host.recheck_private_configuration()
            host.start(old)
            host.verify_healthy(old)
            stopped = False
            host.phase(journal, "completed")
            return {"verifiedBackup": result["directory"], "isolatedRestoreVerified": True}
        except BaseException as error:
            journal["error"] = "Backup/restore verification failed. No live database migration was attempted."
            if stopped and host.safe_to_resume(old):
                try:
                    host.start(old)
                    host.verify_healthy(old)
                except BaseException:
                    pass
            host.phase(journal, "failed-before-migration")
            raise OperatorError(journal["error"]) from error
