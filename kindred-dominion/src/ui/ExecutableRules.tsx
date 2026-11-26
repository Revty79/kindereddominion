import type { CardDefinition } from "../engine/types";
import {
  describeAbility,
  describeCondition,
  describeNumber,
  describeTarget,
} from "../engine/registry";
export default function ExecutableRules({ card }: { card: CardDefinition }) {
  return (
    <details open className="executable-rules">
      <summary>Executable card mechanics</summary>
      {(card.continuous ?? []).map((a) => (
        <p key={a.id}>
          <b>Continuous:</b>{" "}
          {a.kind === "power"
            ? describeNumber(a.amount)
            : `${a.protection} protection`}{" "}
          to {describeTarget(a.target)}
          {a.condition ? ` if ${describeCondition(a.condition)}` : ""}. Active
          only while the source remains on the battlefield.
        </p>
      ))}
      {(card.scaling ?? []).map((a) => (
        <p key={a.id}>
          <b>Dynamic:</b> {describeNumber(a.amount)} power
          {a.condition ? ` if ${describeCondition(a.condition)}` : ""}.
        </p>
      ))}
      {(card.scoring ?? []).map((a) => (
        <p key={a.id}>
          <b>Card scoring:</b> {describeNumber(a.amount)} points; {a.when}
          {a.condition ? ` if ${describeCondition(a.condition)}` : ""}.
        </p>
      ))}
      {card.abilities.map((a) => (
        <p key={a.id}>{describeAbility(a)}</p>
      ))}
    </details>
  );
}
