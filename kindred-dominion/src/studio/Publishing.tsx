import { useState } from "react";
import type { Workspace } from "../content/types";
import { createPublication } from "../assets/publication";
import { Field } from "./components";
export default function Publishing({ workspace }: { workspace: Workspace }) {
  const [version, setVersion] = useState("working"),
    [id, setId] = useState("founding-artwork-test-v1"),
    [name, setName] = useState(
      "Founding Kindreds · temporary artwork validation",
    ),
    [approval, setApproval] = useState<"testing" | "production">("testing"),
    [approved, setApproved] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function publish() {
    setBusy(true);
    try {
      const pack =
        version === "working"
          ? workspace.working
          : workspace.versions.find((v) => v.id === version)!;
      const bytes = await createPublication(pack, id, name, approval, approved);
      const url = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: "application/zip" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `${id}.kindred.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        "Portable package exported. No hosting or Git changes were made by this browser action. Validate and import it with the documented repository command.",
      );
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="studio-subpanel">
      <h3>Artwork & content publishing export</h3>
      <p>
        Publishing packages contain approved definition revisions, separate
        source masters, optimized WebP illustrations and checksummed manifests.
        Experimental artwork is rejected. These packages are imported into the
        repository; this does not deploy a website.
      </p>
      <div className="studio-grid two">
        <Field label="Publishing content source">
          <select
            value={version}
            onChange={(e) => {
              setVersion(e.target.value);
              setApproved(false);
            }}
          >
            <option value="working">
              Working draft, explicitly reviewed below
            </option>
            {workspace.versions
              .filter((v) => v.kind !== "archived")
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Published content identifier">
          <input value={id} onChange={(e) => setId(e.target.value)} />
        </Field>
        <Field label="Published content name">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Publication approval level">
          <select
            value={approval}
            onChange={(e) => setApproval(e.target.value as typeof approval)}
          >
            <option value="testing">
              Temporary / provisional testing package
            </option>
            <option value="production">
              Explicit production artwork approval
            </option>
          </select>
        </Field>
      </div>
      <label className="studio-check">
        <input
          type="checkbox"
          checked={approved}
          onChange={(e) => setApproved(e.target.checked)}
        />
        I explicitly approve these definition revisions for the selected
        publication level.
      </label>
      <button
        className="primary"
        disabled={busy || !approved}
        onClick={() => void publish()}
      >
        {busy
          ? "Packaging artwork…"
          : "Export approved content and artwork package"}
      </button>
      {message && (
        <p className="studio-message" role="status">
          {message}
        </p>
      )}
      <p>
        Repository command:{" "}
        <code>node scripts/import-content.mjs path/to/package.kindred.zip</code>
        . Existing asset revisions are never overwritten; changed artwork gets a
        new checksum revision while card identifiers remain stable.
      </p>
    </section>
  );
}
