import type { CardLibrary, GameState } from "../engine/types";
import { powerBreakdown } from "../engine/evaluation";
import { scoreGame } from "../engine/scoring";
export default function PowerDetails({
  state,
  library,
  id,
}: {
  state: GameState;
  library: CardLibrary;
  id: string;
}) {
  const p = powerBreakdown(state, library, id),
    name = library[state.cards[id].definitionId].name;
  const sourceName = (source: string) =>
    state.cards[source]
      ? `${library[state.cards[source].definitionId].name} (${source})`
      : source;
  return (
    <details open className="power-breakdown" data-testid="power-breakdown">
      <summary>
        {name} · effective power {p.effective}
      </summary>
      <dl>
        <dt>Printed base power</dt>
        <dd>{p.base}</dd>
        <dt>Permanent enhancement</dt>
        <dd>+{p.permanentEnhancement}</dd>
        <dt>Permanent weakening</dt>
        <dd>{p.permanentWeakening}</dd>
        <dt>Permanent net modifier</dt>
        <dd>{p.permanent}</dd>
        <dt>Active aura modifiers</dt>
        <dd>{p.aura}</dd>
        <dt>Power before dynamic scaling</dt>
        <dd>{p.preDynamic}</dd>
        <dt>Dynamic scaling modifiers</dt>
        <dd>{p.dynamic}</dd>
        <dt>Final effective power</dt>
        <dd>{p.effective}</dd>
        <dt>Permanent protection</dt>
        <dd>{p.permanentProtections.join(", ") || "None"}</dd>
        <dt>Continuous protection</dt>
        <dd>
          {p.continuousProtections
            .map(
              (x) =>
                `${x.protection} from ${sourceName(x.source)} / ${x.ability}`,
            )
            .join("; ") || "None"}
        </dd>
      </dl>
      {state.cards[id].modifier !== 0 &&
        state.cards[id].permanentEnhancement === undefined && (
          <small>
            This snapshot stores a net permanent modifier. Earlier individual
            enhancements and weakenings were not recorded.
          </small>
        )}
      {!!p.auras.length && (
        <>
          <b>Aura sources</b>
          <ul>
            {p.auras.map((x, i) => (
              <li key={i}>
                {sourceName(x.source)} / {x.ability}: {x.amount > 0 ? "+" : ""}
                {x.amount}
              </li>
            ))}
          </ul>
        </>
      )}
      {!!p.scaling.length && (
        <>
          <b>Dynamic contributions</b>
          <ul>
            {p.scaling.map((x, i) => (
              <li key={i}>
                {x.ability}: {x.amount > 0 ? "+" : ""}
                {x.amount}
              </li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}
export function ScoreDetails({
  state,
  library,
}: {
  state: GameState;
  library: CardLibrary;
}) {
  const score = scoreGame(state, library),
    b = score.breakdown;
  if (!b) return null;
  return (
    <details className="score-breakdown" data-testid="score-breakdown">
      <summary>
        Score breakdown · Jade {score.totals[0]} / Amber {score.totals[1]}
      </summary>
      <dl>
        <dt>Ordinary winning-row points</dt>
        <dd>{b.ordinary.join(" / ")}</dd>
        <dt>Tactical ruleset points</dt>
        <dd>{b.tactical.join(" / ")}</dd>
        <dt>Card-specific bonus points</dt>
        <dd>{b.bonuses.join(" / ")}</dd>
        <dt>Final score</dt>
        <dd>{score.totals.join(" / ")}</dd>
      </dl>
      <ul>
        {b.sources.map((x, i) => (
          <li key={i}>
            Player {x.player + 1}:{" "}
            {library[state.cards[x.source].definitionId].name} / {x.ability}: +
            {x.points}
          </li>
        ))}
      </ul>
    </details>
  );
}
