import { useState } from "react";
import type { EntityType, Transfer, Workspace } from "../content/types";
import {
  activateVersion,
  checkpoint,
  compareContent,
  restoreDraft,
} from "../content/operations";
import {
  applyImport,
  exportTransfer,
  importPreview,
  parseTransfer,
  validateWorkspace,
} from "../content/transfer";
import { recoveryWorkspace } from "../content/persistence";
import { download, Field, Issues } from "./components";
import { validatePack } from "../content/validation";
export default function Versions({
  workspace,
  onChange,
  onRecovery,
}: {
  workspace: Workspace;
  onChange: (fn: (w: Workspace) => Workspace) => Promise<void>;
  onRecovery: (w: Workspace) => Promise<void>;
}) {
  const [name, setName] = useState(""),
    [kind, setKind] = useState<"checkpoint" | "testing">("checkpoint"),
    [compare, setCompare] = useState("v1.1-baseline"),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState<Transfer | null>(null),
    [replace, setReplace] = useState(false);
  const issues = validatePack(workspace.working);
  const previous = workspace.versions.find((v) => v.id === compare);
  const changes = previous ? compareContent(previous, workspace.working) : [];
  async function perform(fn: (w: Workspace) => Workspace) {
    try {
      await onChange(fn);
      setMessage(
        "Content operation saved. Existing matches and historical records retain their snapshots.",
      );
    } catch (e) {
      setMessage(String(e));
    }
  }
  async function read(file: File | undefined) {
    setPending(null);
    setReplace(false);
    if (!file) return;
    try {
      const transfer = parseTransfer(await file.text());
      importPreview(workspace, transfer);
      applyImport(workspace, transfer, "replace");
      setPending(transfer);
      setMessage(
        "Import validated. Review its contents and conflicts before applying.",
      );
    } catch (e) {
      setMessage(
        `Import rejected. Existing content is unchanged. ${String(e)}`,
      );
    }
  }
  const preview = pending ? importPreview(workspace, pending) : null;
  async function recover() {
    try {
      const previous = await recoveryWorkspace();
      if (!previous)
        throw new Error("No prior committed recovery snapshot exists.");
      validateWorkspace(previous);
      download(
        `studio-before-recovery-${Date.now()}.json`,
        exportTransfer(workspace, "backup"),
      );
      await onRecovery(previous);
      setMessage(
        "Previous transaction restored. A backup of the current session was downloaded first.",
      );
    } catch (e) {
      setMessage(String(e));
    }
  }
  return (
    <section>
      <h2>Content versions & backups</h2>
      <p>
        Working drafts are editable. Saved versions are immutable snapshots. The
        original V1.1 content remains recoverable and stays active until you
        explicitly activate a valid testing version.
      </p>
      <div className="studio-grid three">
        <Field label="Checkpoint name">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Checkpoint status">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="checkpoint">Named checkpoint</option>
            <option value="testing">
              Approved testing version (still provisional cards)
            </option>
          </select>
        </Field>
        <button
          className="primary"
          disabled={!name.trim() || issues.some((i) => i.severity === "error")}
          onClick={() => void perform((w) => checkpoint(w, name, kind))}
        >
          Create named checkpoint
        </button>
      </div>
      <Issues issues={issues} />
      <div className="studio-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Version</th>
              <th>Status</th>
              <th>Cards</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {workspace.versions.map((v) => (
              <tr key={v.id}>
                <td>
                  {v.name}
                  <small>{v.id}</small>
                </td>
                <td>
                  {v.kind}
                  {v.id === workspace.activeVersion ? " · ACTIVE" : ""}
                </td>
                <td>{v.cards.length}</td>
                <td>
                  <div className="studio-actions">
                    <button
                      onClick={() => void perform((w) => restoreDraft(w, v.id))}
                    >
                      Restore as new draft
                    </button>
                    <button
                      disabled={
                        v.kind === "archived" ||
                        v.id === workspace.activeVersion
                      }
                      onClick={() =>
                        void perform((w) => activateVersion(w, v.id))
                      }
                    >
                      Activate for new matches
                    </button>
                    <button
                      disabled={
                        v.id === "v1.1-baseline" ||
                        v.id === workspace.activeVersion
                      }
                      onClick={() =>
                        void perform((w) => ({
                          ...w,
                          versions: w.versions.map((p) =>
                            p.id === v.id ? { ...p, kind: "archived" } : p,
                          ),
                        }))
                      }
                    >
                      Archive version
                    </button>
                    <button
                      onClick={() =>
                        download(`${v.id}.json`, {
                          format: "kindred-dominion-studio",
                          schema: 1,
                          engineVersion: v.engineVersion,
                          type: "content",
                          exportedAt: new Date().toISOString(),
                          data: v,
                        })
                      }
                    >
                      Export version
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="studio-subpanel">
        <h3>Compare working draft</h3>
        <Field label="Compare content against">
          <select value={compare} onChange={(e) => setCompare(e.target.value)}>
            {workspace.versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
        <p>{changes.length} changed, added or removed definitions</p>
        <div className="studio-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Entity</th>
                <th>Identifier</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c, i) => (
                <tr key={i}>
                  <td>{c.type}</td>
                  <td>{c.id}</td>
                  <td>{c.change}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="studio-subpanel">
        <h3>Explicit exports</h3>
        <p>
          Complete backups include definitions, metadata, local artwork,
          versions, scenarios, replays and simulation reports. Keep a copy
          outside browser storage.
        </p>
        <div className="studio-actions">
          {(
            [
              "backup",
              "content",
              "cards",
              "collections",
              "decks",
              "rulesets",
              "scenarios",
              "replays",
              "reports",
            ] as EntityType[]
          ).map((type) => (
            <button
              className={type === "backup" ? "primary" : ""}
              key={type}
              onClick={() =>
                download(
                  `kindred-dominion-${type}-${Date.now()}.json`,
                  exportTransfer(workspace, type),
                )
              }
            >
              Export {type === "backup" ? "complete Studio backup" : type}
            </button>
          ))}
        </div>
      </section>
      <section className="studio-subpanel">
        <h3>Import with validation and conflict preview</h3>
        <Field label="Import Studio content file">
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => void read(e.target.files?.[0])}
          />
        </Field>
        {preview && pending && (
          <>
            <p>
              {preview.type}: {preview.count} primary items. Preview:{" "}
              {preview.names.join(", ")}.
            </p>
            <p>
              Identifier conflicts: {preview.conflicts.join(", ") || "None"}.
            </p>
            <label className="studio-check">
              <input
                type="checkbox"
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
              />
              I reviewed conflicts and explicitly authorize replacing matching
              content
              {pending.type === "backup"
                ? " and restoring the whole workspace"
                : ""}
              .
            </label>
            <button
              className="primary"
              disabled={
                (!!preview.conflicts.length || pending.type === "backup") &&
                !replace
              }
              onClick={() =>
                void perform((w) =>
                  applyImport(w, pending, replace ? "replace" : "reject"),
                ).then(() => setPending(null))
              }
            >
              Apply validated import atomically
            </button>
            <button onClick={() => setPending(null)}>Cancel import</button>
          </>
        )}
      </section>
      <section className="studio-subpanel">
        <h3>Local recovery</h3>
        <p>
          Each successful IndexedDB transaction retains the preceding workspace.
          Concurrent-tab revision conflicts are rejected rather than overwriting
          newer edits.
        </p>
        <button onClick={() => void recover()}>
          Restore previous local transaction
        </button>
      </section>
      {message && (
        <p className="studio-message" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
