import {preserveRulesetVersions} from "../content/rulesets";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import App from "./App";
import { initialWorkspace } from "../content/baseline";
import { loadWorkspace, persistWorkspace } from "../content/persistence";
import { validateWorkspace } from "../content/transfer";
import type { Workspace } from "../content/types";
import type { MatchRecord } from "../replay/record";
import { addBundledVersions } from "../content/bundled";
const Studio =
  import.meta.env.VITE_STUDIO !== "0"
    ? lazy(() => import("../studio/Studio"))
    : null;
export default function GameHost() {
  const [workspace, setWorkspace] = useState(() => addBundledVersions(initialWorkspace())),
    [ready, setReady] = useState(false),
    [studio, setStudio] = useState(location.hash === "#studio"),
    [error, setError] = useState("");
  const current = useRef(workspace),
    tail = useRef(Promise.resolve());
  const initialization = useRef<Promise<Workspace> | null>(null);
  useEffect(() => {
    let live = true;
    // React development effect rechecks must share one initialization transaction.
    // A real second tab may independently install the same bundled version; reload its committed revision.
    if (!initialization.current)
      initialization.current = (async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          const value = await loadWorkspace();
          validateWorkspace(value);
          const withBundled = addBundledVersions(value);
          if (withBundled === value) return value;
          withBundled.revision = value.revision + 1;
          try {
            await persistWorkspace(withBundled, value.revision);
            return withBundled;
          } catch (error) {
            if (!String(error).includes("newer Studio changes")) {
              setError(
                `Your saved workspace is available, but the bundled content update could not be saved: ${String(error)}. Export a complete backup before retrying storage changes.`,
              );
              return value;
            }
          }
        }
        throw new Error(
          "Another tab is updating content. Reload after its save completes.",
        );
      })();
    initialization.current
      .then((value) => {
        if (live) {
          current.current = value;
          setWorkspace(value);
        }
      })
      .catch((e) => {
        if (live)
          setError(
            `Studio storage needs attention: ${String(e)}. Original V1.1 gameplay remains available.`,
          );
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, []);
  function change(fn: (w: Workspace) => Workspace): Promise<void> {
    const operation = tail.current
      .catch(() => {})
      .then(async () => {
        const previous = current.current;
        const next = preserveRulesetVersions(previous,{ ...fn(previous), revision: previous.revision + 1 });
        await persistWorkspace(next, previous.revision);
        current.current = next;
        setWorkspace(next);
        setError("");
      });
    tail.current = operation;
    return operation;
  }
  async function recovery(value: Workspace) {
    validateWorkspace(value);
    const next = preserveRulesetVersions(current.current,{
      ...structuredClone(value),
      revision: current.current.revision + 1,
    });
    await persistWorkspace(next);
    current.current = next;
    setWorkspace(next);
    setError("");
  }
  async function record(value: MatchRecord) {
    try {
      await change((w) => ({
        ...w,
        replays: w.replays.some((r) => r.id === value.id)
          ? w.replays.map((r) => (r.id === value.id ? value : r))
          : [...w.replays, value],
      }));
    } catch (e) {
      setError(`Replay could not be saved: ${String(e)}`);
    }
  }
  const content =
    workspace.versions.find((v) => v.id === workspace.activeVersion) ??
    workspace.versions[0];
  if (!ready)
    return (
      <div className="notice" role="status">
        Loading local game content…
      </div>
    );
  return (
    <>
      {error && (
        <div className="notice" role="alert">
          {error}
        </div>
      )}
      {studio && Studio ? (
        <Suspense
          fallback={<p className="notice">Opening Developer Studio…</p>}
        >
          <Studio
            workspace={workspace}
            onChange={change}
            onRecovery={recovery}
            onExit={() => {
              setStudio(false);
              history.replaceState(
                null,
                "",
                location.pathname + location.search,
              );
            }}
          />
        </Suspense>
      ) : (
        <App
          content={content}
          onRecord={record}
          onOpenStudio={
            Studio
              ? () => {
                  setStudio(true);
                  history.replaceState(null, "", "#studio");
                }
              : undefined
          }
        />
      )}
    </>
  );
}
