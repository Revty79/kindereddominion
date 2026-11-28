import {preserveRulesetVersions} from "./rulesets";
import { initialWorkspace } from "./baseline";
import type { Workspace } from "./types";
const DB = "kindred-dominion-studio";
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("snapshots");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB could not open."));
    request.onblocked = () =>
      reject(
        new Error("Close older Studio tabs to finish opening local storage."),
      );
  });
}
async function readKey(key: string): Promise<Workspace | null> {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("snapshots", "readonly"),
        request = tx.objectStore("snapshots").get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
export async function loadWorkspace(): Promise<Workspace> {
  return (await readKey("current")) ?? initialWorkspace();
}
export async function recoveryWorkspace(): Promise<Workspace | null> {
  return readKey("previous");
}
export async function persistWorkspace(
  workspace: Workspace,
  expectedRevision?: number,
): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("snapshots", "readwrite"),
        store = tx.objectStore("snapshots");
      const current = store.get("current");
      let conflict = false;
      current.onsuccess = () => {
        if (
          expectedRevision !== undefined &&
          current.result &&
          current.result.revision !== expectedRevision
        ) {
          conflict = true;
          tx.abort();
          return;
        }
        if (current.result) store.put(current.result, "previous");
        try{store.put(structuredClone(preserveRulesetVersions(current.result??null,workspace)), "current");}catch{conflict=true;tx.abort();}
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error("Local content save failed."));
      tx.onabort = () =>
        reject(
          conflict
            ? new Error(
                "Another tab has newer Studio changes. Reload before saving; no content was overwritten.",
              )
            : (tx.error ?? new Error("Local content transaction was aborted.")),
        );
    });
  } finally {
    db.close();
  }
}
