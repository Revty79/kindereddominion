import { useState } from "react";
import type { DiagnosticStep, GameState } from "../engine/types";
export default function Diagnostics({
  steps,
  onState,
}: {
  steps: DiagnosticStep[];
  onState?: (state: GameState | null) => void;
}) {
  const [index, setIndex] = useState(-1);
  const selected = steps[index];
  return (
    <section className="studio-subpanel">
      <div className="studio-section-title">
        <h3>Ability resolution inspector</h3>
        <button
          onClick={() => {
            setIndex(-1);
            onState?.(null);
          }}
        >
          Show committed state
        </button>
      </div>
      <p>
        Actions remain atomic. These are actual recorded diagnostic snapshots,
        never reconstructed guesses. Selecting a step is read-only.
      </p>
      {!steps.length ? (
        <p>
          Execute an action to inspect requirements, targets, conditions,
          limits, effects and score changes.
        </p>
      ) : (
        <div className="diagnostic-layout">
          <ol>
            {steps.map((step, i) => (
              <li key={i}>
                <button
                  className={index === i ? "selected" : ""}
                  onClick={() => {
                    setIndex(i);
                    onState?.(step.state ?? null);
                  }}
                >
                  <b>
                    {i + 1} · {step.kind}
                  </b>
                  <span>{step.message}</span>
                </button>
              </li>
            ))}
          </ol>
          <div>
            {selected ? (
              <>
                <h4>{selected.message}</h4>
                <pre>{JSON.stringify(selected.details, null, 2)}</pre>
              </>
            ) : (
              <p>
                Choose a resolution step. {steps.length} diagnostic snapshots
                recorded.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
