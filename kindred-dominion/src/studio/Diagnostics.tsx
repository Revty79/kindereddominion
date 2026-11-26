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
  const before = steps[index - 1]?.state,
    after = selected?.state;
  const cells =
    before && after
      ? after.board.flatMap((cell) => {
          const prior = before.board.find(
            (c) => c.row === cell.row && c.col === cell.col,
          );
          if (!prior) return [];
          const changes = [
            prior.owner !== cell.owner
              ? `ownership ${prior.owner === null ? "neutral" : `Player ${prior.owner + 1}`} → ${cell.owner === null ? "neutral" : `Player ${cell.owner + 1}`}`
              : "",
            prior.tokens !== cell.tokens
              ? `tokens ${prior.tokens} → ${cell.tokens}`
              : "",
            prior.fortification !== cell.fortification
              ? `fortification ${prior.fortification} → ${cell.fortification}`
              : "",
            prior.creature !== cell.creature
              ? `occupant ${prior.creature ?? "empty"} → ${cell.creature ?? "empty"}`
              : "",
          ].filter(Boolean);
          return changes.length
            ? [
                `${String.fromCharCode(65 + cell.row)}${cell.col + 1}: ${changes.join("; ")}`,
              ]
            : [];
        })
      : [];
  const instances =
    before && after
      ? Object.values(after.cards).flatMap((card) => {
          const prior = before.cards[card.id];
          if (!prior)
            return [
              `${card.id} (${card.definitionId}) generated in ${card.location}.`,
            ];
          const changes = [
            prior.location !== card.location
              ? `${prior.location} → ${card.location}`
              : "",
            prior.modifier !== card.modifier
              ? `power modifier ${prior.modifier} → ${card.modifier}`
              : "",
            JSON.stringify(prior.statuses) !== JSON.stringify(card.statuses)
              ? `protection ${prior.statuses.join(", ") || "none"} → ${card.statuses.join(", ") || "none"}`
              : "",
            prior.resurrections !== card.resurrections
              ? `resurrections ${prior.resurrections} → ${card.resurrections}`
              : "",
          ].filter(Boolean);
          return changes.length
            ? [`${card.id} (${card.definitionId}): ${changes.join("; ")}`]
            : [];
        })
      : [];
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
                {!!(cells.length + instances.length) && (
                  <div>
                    <h4>
                      Observed changes since the preceding recorded snapshot
                    </h4>
                    <ul>
                      {[...cells, ...instances].map((change, i) => (
                        <li key={i}>{change}</li>
                      ))}
                    </ul>
                  </div>
                )}
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
