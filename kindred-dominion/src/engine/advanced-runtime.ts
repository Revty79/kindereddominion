import type {
  Ability,
  CardLibrary,
  Cell,
  Player,
  Protection,
  Trigger,
} from "./types";
import type {
  EventContext,
  EventParticipant,
  HistoryEvent,
  PowerBreakdown,
  PowerChange,
} from "./advanced-types";
import {
  bound,
  evaluateCondition,
  matchesHistory,
  participant,
  position,
  powerTable,
} from "./evaluation";
import type { Resolver, Source } from "./game";

const powerTriggers = new Set<Trigger>([
  "enhanced",
  "weakened",
  "otherEnhanced",
  "otherWeakened",
  "firstEnhanced",
  "firstWeakened",
  "powerThreshold",
]);
export class AdvancedRuntime {
  last: Record<string, PowerBreakdown>;
  explicit = new Map<string, number>();
  incoming = new Map<string, EventParticipant>();
  settling = false;
  constructor(readonly host: Resolver) {
    this.last = powerTable(host.state, host.library);
  }
  get state() {
    return this.host.state;
  }
  get library(): CardLibrary {
    return this.host.library;
  }
  key(source: Source, a: Ability) {
    return `${this.state.cards[source.id].lineage}:${a.id}`;
  }
  canRun(a: Ability, source: Source, ctx: EventContext): boolean {
    if (ctx.chain?.includes(this.key(source, a))) {
      this.host.diagnostic("safeguard", "Causal self-reentry blocked.", {
        ability: a.id,
        source: source.id,
        chain: ctx.chain,
      });
      return false;
    }
    if (a.eventFilter?.excludeSelf && ctx.card === source.id) return false;
    const p = ctx.participant;
    if (
      !matchesHistory(a.eventFilter, ctx.player, source.player, {
        definitionId: p?.definitionId,
        tags: p?.tags,
        kindred: p?.kindred,
        cause: ctx.cause,
      })
    )
      return false;
    const accepted =
      a.eventFilter?.powerChanges ??
      (a.trigger === "powerThreshold"
        ? ["permanent", "aura", "dynamic"]
        : ["permanent"]);
    if (
      powerTriggers.has(a.trigger) &&
      ctx.change &&
      !accepted.some((kind) =>
        kind === "permanent"
          ? ctx.change!.permanent
          : kind === "aura"
            ? ctx.change!.continuous
            : ctx.change!.dynamic,
      )
    )
      return false;
    if (
      ["firstEnhanced", "firstWeakened"].includes(a.trigger) &&
      !accepted.some((kind) => ctx.firstKinds?.includes(kind))
    )
      return false;
    return true;
  }
  chain(a: Ability, source: Source, ctx: EventContext): EventContext {
    return { ...ctx, chain: [...(ctx.chain ?? []), this.key(source, a)] };
  }
  record(
    event: HistoryEvent,
    player: Player,
    p?: Pick<EventParticipant, "definitionId" | "tags" | "kindred">,
    cause: string = event,
  ): void {
    const history = this.state.mechanics!.history;
    const existing = history.find(
      (h) =>
        h.event === event &&
        h.player === player &&
        h.definitionId === p?.definitionId &&
        h.kindred === p?.kindred &&
        h.cause === cause &&
        JSON.stringify(h.tags) === JSON.stringify(p?.tags ?? []),
    );
    if (existing) existing.count = bound(existing.count + 1);
    else {
      if (history.length >= 4096)
        throw new Error("Historical counter bucket ceiling reached.");
      history.push({
        event,
        player,
        definitionId: p?.definitionId,
        tags: [...(p?.tags ?? [])],
        kindred: p?.kindred,
        cause,
        count: 1,
      });
    }
  }
  context(cause: string, id?: string, parent?: EventContext): EventContext {
    const p =
      id && this.state.cards[id]
        ? participant(this.state, this.library, id, cause)
        : undefined;
    return {
      id: this.state.nextEvent - 1,
      player: p?.owner ?? this.state.active,
      card: id,
      participant: p,
      cause,
      chain: parent?.chain ?? [],
      ...(parent?.removed ? { removed: parent.removed } : {}),
      ...(parent?.incoming ? { incoming: parent.incoming } : {}),
    };
  }
  dispatch(
    trigger: Trigger,
    ctx: EventContext,
    onlySource = false,
    includeDeparted = false,
  ): void {
    const ids = this.state.board.flatMap((c) =>
      c.creature ? [c.creature] : [],
    );
    if (includeDeparted && ctx.card && !ids.includes(ctx.card))
      ids.push(ctx.card);
    this.host.enqueue(
      ids
        .filter((id) => !onlySource || id === ctx.card)
        .flatMap((id) =>
          this.host.collect(
            this.host.source(
              id,
              ctx.card === id ? ctx.participant?.position : undefined,
            ),
            trigger,
            ctx,
          ),
        ),
    );
  }
  prepareIncoming(id: string, previous: string) {
    this.incoming.set(id, participant(this.state, this.library, previous));
  }
  placed(
    id: string,
    kind: "placement" | "replacement" | "evolution",
    resurrected: boolean,
    parent: EventContext,
  ): EventContext {
    const removed = this.incoming.get(id),
      ctx: EventContext = {
        ...this.context(resurrected ? "resurrection" : kind, id, parent),
        id: parent.id,
        resurrected,
        ...(removed
          ? {
              removed: {
                ...removed,
                cause: kind === "replacement" ? "sacrifice" : "evolution",
              },
            }
          : {}),
      };
    if (removed) ctx.incoming = participant(this.state, this.library, id, kind);
    this.incoming.delete(id);
    if (!resurrected)
      this.record("played", ctx.player, ctx.participant, ctx.cause);
    if (kind === "replacement")
      this.record("replaced", ctx.player, ctx.participant, "replacement");
    if (kind === "evolution")
      this.record("evolved", ctx.player, ctx.participant, "evolution");
    return ctx;
  }
  resurrected(id: string, parent?: EventContext) {
    const ctx = this.context("resurrection", id, parent);
    ctx.id = this.host.event(
      "resurrected",
      `${ctx.participant!.name} returned to the battlefield.`,
      ctx.player,
      id,
    );
    this.record("resurrected", ctx.player, ctx.participant, "resurrection");
    this.dispatch("resurrected", ctx);
  }
  removed(
    p: EventParticipant,
    eventId: number,
    cause: string,
    parent?: EventContext,
  ): EventContext {
    const ctx: EventContext = {
      ...this.context(cause, undefined, parent),
      id: eventId,
      player: p.owner,
      card: p.id,
      participant: p,
      removed: p,
    };
    const incoming = [...this.incoming.entries()].find(
      ([, v]) => v.id === p.id,
    )?.[0];
    if (incoming)
      ctx.incoming = participant(
        this.state,
        this.library,
        incoming,
        "incoming",
      );
    if (["destruction", "power", "sacrifice"].includes(cause))
      this.record("destroyed", p.owner, p, cause);
    if (cause === "sacrifice") this.record("sacrificed", p.owner, p, cause);
    if (cause === "banish" || cause === "return") {
      this.record(
        cause === "banish" ? "banished" : "returned",
        p.owner,
        p,
        cause,
      );
      this.dispatch(
        cause === "banish" ? "banished" : "returned",
        ctx,
        false,
        true,
      );
    }
    return ctx;
  }
  powerEffect(id: string, amount: number): void {
    if (!amount) return;
    this.explicit.set(id, (this.explicit.get(id) ?? 0) + amount);
    // Only immutable definition metadata is needed here. Avoid querying a derived table
    // while a simultaneous multi-target permanent change is still being applied.
    const card = this.state.cards[id],
      definition = this.library[card.definitionId];
    this.record(
      amount > 0 ? "enhanced" : "weakened",
      card.owner,
      {
        definitionId: definition.id,
        tags: definition.tags,
        kindred: definition.kindred,
      },
      "powerEffect",
    );
  }
  change(
    id: string,
    previous: number,
    current: number,
    components: PowerChange["components"],
    cause: string,
    source: string | undefined,
    parent: EventContext | undefined,
  ): void {
    if (previous === current) return;
    const kind: PowerChange["kind"] = components.permanent
      ? "permanent"
      : components.aura
        ? "aura"
        : "dynamic";
    this.host.step();
    const eventId = this.host.event(
      "power-change",
      `${this.library[this.state.cards[id].definitionId].name}: ${previous} → ${current} (${kind}, ${cause}).`,
      this.state.cards[id].owner,
      id,
    );
    const change: PowerChange = {
      eventId,
      creature: id,
      previous,
      current,
      amount: current - previous,
      source,
      cause,
      kind,
      permanent: components.permanent !== 0,
      continuous: components.aura !== 0,
      dynamic: components.dynamic !== 0,
      components,
    };
    this.state.events.at(-1)!.change = change;
    const firstKinds: PowerChange["kind"][] = [];
    const own: Trigger = current > previous ? "enhanced" : "weakened";
    for (const k of ["permanent", "aura", "dynamic"] as const)
      if (components[k]) {
        const key = `${this.state.cards[id].lineage}:${own}:${k}`;
        if (!this.state.mechanics!.firstChanges[key]) firstKinds.push(k);
        this.state.mechanics!.firstChanges[key] = true;
      }
    const ctx = {
      ...this.context(cause, id, parent),
      id: eventId,
      change,
      firstKinds,
    };
    this.host.diagnostic(
      "power-change",
      "Authoritative effective-power change.",
      change,
    );
    const up = current > previous,
      other: Trigger = up ? "otherEnhanced" : "otherWeakened";
    this.dispatch(own, ctx, true);
    this.host.enqueue(
      this.state.board
        .filter((c) => c.creature && c.creature !== id)
        .flatMap((c) =>
          this.host.collect(this.host.source(c.creature!), other, ctx),
        ),
    );
    if (firstKinds.length)
      this.dispatch(up ? "firstEnhanced" : "firstWeakened", ctx, true);
    const sourceInfo = this.host.source(id);
    this.host.enqueue(
      this.library[this.state.cards[id].definitionId].abilities.flatMap(
        (a, index) => {
          if (a.trigger !== "powerThreshold" || !a.threshold) return [];
          const t = a.threshold.value,
            direction = a.threshold.direction;
          const crossed =
            (direction !== "down" && previous < t && current >= t) ||
            (direction !== "up" && previous >= t && current < t);
          return crossed
            ? [{ source: sourceInfo, ability: a, context: ctx, index }]
            : [];
        },
      ),
    );
  }
  settle(cause = "battlefield", source?: Source, parent?: EventContext): void {
    if (this.settling) return;
    this.settling = true;
    try {
      for (let pass = 0; ; pass++) {
        if (pass > this.state.config.safeguards.maxCards)
          throw new Error("Continuous destruction cascade ceiling reached.");
        const next = powerTable(this.state, this.library);
        for (const cell of this.state.board)
          if (cell.creature) {
            const id = cell.creature,
              p = next[id],
              old = this.last[id];
            const explicit = this.explicit.get(id) ?? 0;
            // Inherited modifiers are not a newly applied enhancement event. Each record uses the actual final power,
            // including all acyclic derived contributions; intermediate arithmetic is never presented as a game state.
            const previous = old
              ? old.effective + (explicit ? 0 : p.intrinsic - old.intrinsic)
              : p.intrinsic;
            const auraDelta = p.aura - (old?.aura ?? 0);
            const dynamicDelta = p.dynamic - (old?.dynamic ?? 0);
            this.change(
              id,
              previous,
              p.effective,
              { permanent: explicit, aura: auraDelta, dynamic: dynamicDelta },
              explicit ? "powerEffect" : cause,
              source?.id ?? p.auras[0]?.source ?? id,
              parent,
            );
          }
        this.explicit.clear();
        this.last = next;
        const dead = this.state.board.flatMap((c) =>
          c.creature && next[c.creature].effective <= 0 ? [c.creature] : [],
        );
        if (!dead.length) break;
        this.host.remove(dead, "power", parent);
      }
      for (const cell of this.state.board)
        if (cell.creature) {
          const source = this.host.source(cell.creature);
          this.library[
            this.state.cards[cell.creature].definitionId
          ].abilities.forEach((a, index) => {
            if (a.trigger !== "condition") return;
            const key = this.key(source, a),
              value = evaluateCondition(a.condition, {
                state: this.state,
                library: this.library,
                source: source.id,
                context: parent,
              });
            const previous = this.state.mechanics!.thresholds[key] ?? false;
            this.state.mechanics!.thresholds[key] = value;
            if (value && !previous) {
              const ctx = this.context(cause, source.id, parent);
              ctx.id = this.host.event(
                "threshold",
                `${a.id}: condition changed false → true.`,
                source.player,
                source.id,
              );
              this.host.enqueue([{ source, ability: a, context: ctx, index }]);
            }
          });
        }
    } finally {
      this.settling = false;
    }
  }
  protected(id: string, protection: Protection): boolean {
    const p = powerTable(this.state, this.library)[id];
    return (
      p.permanentProtections.includes(protection) ||
      p.continuousProtections.some((x) => x.protection === protection)
    );
  }
  territory(
    before: Cell,
    after: Cell,
    source: Source,
    parent?: EventContext,
  ): void {
    const emit = (trigger: Trigger, event: HistoryEvent, player: Player) => {
      const ctx = {
        ...this.context(event, source.id, parent),
        player,
        actor: source.player,
        position: { row: after.row, col: after.col },
      };
      ctx.id = this.host.event(
        "territory-change",
        `${trigger} at ${after.row + 1},${after.col + 1}.`,
        player,
        source.id,
      );
      this.state.events.at(-1)!.details = {
        before,
        after: structuredClone(after),
        actor: source.player,
      };
      this.record(event, player, ctx.participant, parent?.cause ?? "influence");
      this.dispatch(trigger, ctx);
    };
    if (before.owner !== after.owner && after.owner !== null) {
      emit(
        before.owner === null ? "territoryClaimed" : "territoryCaptured",
        before.owner === null ? "claimed" : "captured",
        after.owner,
      );
      if (before.owner !== null) emit("territoryLost", "lost", before.owner);
    }
    if (after.fortification > before.fortification && after.owner !== null)
      emit("territoryFortified", "fortified", after.owner);
    if (after.fortification < before.fortification && before.owner !== null)
      emit("fortificationReduced", "fortificationReduced", before.owner);
  }
  drawn(
    ids: string[],
    cause: "draw" | "generate",
    source?: Source,
    parent?: EventContext,
  ) {
    for (const id of ids) {
      const ctx = this.context(cause, id, parent);
      ctx.actor = source?.player ?? ctx.player;
      ctx.id = this.host.event(
        "card-change",
        `${this.library[this.state.cards[id].definitionId].name} ${cause === "draw" ? "drawn" : "generated"}.`,
        ctx.player,
        id,
      );
      this.record(
        cause === "draw" ? "drawn" : "generated",
        ctx.player,
        ctx.participant,
        cause,
      );
      this.dispatch(cause === "draw" ? "drawn" : "generated", ctx);
    }
  }
}
