import { rotationFromLineup } from "./domain.js";

const blank = () => ({
  actions: 0,
  won: 0,
  lost: 0,
  points: 0,
  errors: 0,
  attack: 0,
  kills: 0,
  attackErrors: 0,
  blocked: 0,
  reception: 0,
  receptionErrors: 0,
  positiveReception: 0,
  excellentReception: 0,
  serve: 0,
  serveErrors: 0,
  aces: 0,
  blockErrors: 0,
  blockPoints: 0,
  breakPoints: 0,
  positiveActions: 0,
  negativeActions: 0,
  gp: 0,
});

export const unforcedReasons = [
  ["rotation", "Falta de rotación"],
  ["net", "Toque de red"],
  ["other", "Otros"],
];

export const playerStatKeys = [
  "points",
  "breakPoints",
  "gp",
  "serve",
  "serveErrors",
  "aces",
  "reception",
  "receptionErrors",
  "positiveReception",
  "excellentReception",
  "attack",
  "attackErrors",
  "blocked",
  "kills",
  "blockErrors",
  "blockPoints",
];

export const percent = (numerator, denominator) =>
  denominator ? `${Math.round((numerator / denominator) * 100)} %` : "—";

export function aggregatePlayerStatistics(players) {
  return players.reduce((total, player) => {
    for (const key of playerStatKeys) total[key] += player[key] || 0;
    return total;
  }, blank());
}

export function resolveRosterName(match, rosters = []) {
  const historicalName =
    typeof match.rosterName === "string" ? match.rosterName.trim() : "";
  if (historicalName) return historicalName;

  const matchesRoster = (roster) =>
    roster.players.length === match.roster.length &&
    roster.players.every((player) => {
      const matchPlayer = match.roster.find((item) => item.id === player.id);
      return (
        matchPlayer &&
        matchPlayer.name === player.name &&
        matchPlayer.role === player.role
      );
    });
  const linkedRoster =
    typeof match.rosterId === "string"
      ? rosters.find((roster) => roster.id === match.rosterId)
      : rosters.find(matchesRoster);

  return linkedRoster?.name.trim() || "Nuestro equipo";
}

function resolveEventContext(state, event, index) {
  const previous = state.undo[index];
  const rotation =
    rotationFromLineup(
      state.roster,
      previous?.lineup,
      Number.isInteger(event.rotation) && event.rotation >= 1 && event.rotation <= 6
        ? event.rotation
        : Number.isInteger(previous?.rotation) && previous.rotation >= 1 && previous.rotation <= 6
          ? previous.rotation
          : null,
    );
  const phase = ["K1", "K2"].includes(event.phase)
    ? event.phase
    : typeof previous?.serving === "boolean"
      ? previous.serving
        ? "K2"
        : "K1"
      : null;
  return { rotation, phase };
}

export function statistics(state, set = "all") {
  const indexed = state.events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => set === "all" || event.set === Number(set));
  const total = blank();
  const players = state.roster.map((player) => ({
    ...player,
    ...blank(),
    initialPosition: null,
  }));
  const phases = ["K1", "K2"].map((name) => ({ name, ...blank() }));
  const rotations = Array.from({ length: 6 }, (_, index) => ({
    name: `R${index + 1}`,
    ...blank(),
  }));
  const rotationPhases = Array.from({ length: 6 }, (_, index) =>
    ["K1", "K2"].map((phase) => ({
      rotation: index + 1,
      name: `R${index + 1}`,
      phase,
      won: 0,
      lost: 0,
    })),
  ).flat();
  const unforcedByReason = new Map(
    unforcedReasons.map(([reason, label]) => [reason, { reason, label, count: 0 }]),
  );
  const rivalErrors = { serve: 0, attack: 0 };
  let unforced = 0;
  let substitutions = 0;
  const firstPeriodEvent = indexed.find(({ event }) => event.type !== "next");
  const opening =
    set === "all"
      ? { before: state.undo[0] }
      : firstPeriodEvent && { before: state.undo[firstPeriodEvent.index] };
  const initialLineup =
    opening?.before?.lineup ||
    (set === "all" ? state.undo[0]?.lineup || state.lineup : undefined);

  if (initialLineup) {
    players.forEach((player) => {
      const index = initialLineup.indexOf(player.id);
      if (index >= 0) player.initialPosition = index + 1;
    });
  }

  for (const { event, index } of indexed) {
    if (event.type === "sub") substitutions++;
    if (!["point", "action"].includes(event.type)) continue;

    const won = Math.max(0, event.after[0] - event.before[0]);
    const lost = Math.max(0, event.after[1] - event.before[1]);
    const context = resolveEventContext(state, event, index);

    for (const group of [
      total,
      phases.find((phase) => phase.name === context.phase),
      rotations[context.rotation - 1],
    ].filter(Boolean)) {
      group.won += won;
      group.lost += lost;
      group.actions += event.type === "action" ? 1 : 0;
    }

    const rotationPhase = rotationPhases.find(
      (group) =>
        group.rotation === context.rotation && group.phase === context.phase,
    );
    if (rotationPhase) {
      rotationPhase.won += won;
      rotationPhase.lost += lost;
    }

    if (event.type === "point" && event.category === "unforced-error") {
      unforced++;
      const known = unforcedByReason.get(event.reason);
      if (known) {
        known.count++;
      } else {
        unforcedByReason.set(event.reason || "unknown", {
          reason: event.reason || "unknown",
          label: event.reason || "Sin motivo",
          count: 1,
        });
      }
    }

    if (event.type === "point" && event.team === 0) {
      if (/error de saque rival/i.test(event.label)) rivalErrors.serve++;
      if (/error de ataque rival/i.test(event.label)) rivalErrors.attack++;
    }

    if (event.type !== "action") continue;
    const player = players.find((candidate) => candidate.id === event.player);
    if (!player) continue;

    player.actions++;
    player.points += won;
    player.errors += lost;
    const gpLost = event.action === "Bloqueo" ? 0 : lost;
    player.gp += won - gpLost;
    if (context.phase === "K2" && won) player.breakPoints++;
    if (["#", "+"].includes(event.grade)) player.positiveActions++;
    else if (["=", "Blo", "-"].includes(event.grade)) player.negativeActions++;

    if (event.action === "Saque") {
      player.serve++;
      player.serveErrors += lost;
      if (won && event.grade === "#") player.aces++;
    }
    if (event.action === "Bloqueo") {
      player.blockErrors += lost;
      player.blockPoints += won;
    }
    if (event.action === "Ataque") {
      player.attack++;
      player.kills += won;
      player.attackErrors += event.grade === "=" ? 1 : 0;
      if (event.grade === "Blo") player.blocked++;
    }
    if (event.action === "Recepción") {
      player.reception++;
      player.receptionErrors += lost;
      player.positiveReception += ["#", "+"].includes(event.grade) ? 1 : 0;
      player.excellentReception += event.grade === "#" ? 1 : 0;
    }
  }

  const unforcedReasonTotals = [...unforcedByReason.values()];

  return {
    total,
    players,
    phases,
    rotations,
    rotationPhases: rotationPhases.map((group) => {
      const played = group.won + group.lost;
      return {
        ...group,
        played,
        balance: group.won - group.lost,
        wonPercent: percent(group.won, played),
      };
    }),
    rivalErrors,
    unforced,
    unforcedReasons: unforcedReasonTotals,
    rotationErrors:
      unforcedReasonTotals.find(({ reason }) => reason === "rotation")?.count || 0,
    netErrors:
      unforcedReasonTotals.find(({ reason }) => reason === "net")?.count || 0,
    otherErrors:
      unforcedReasonTotals.find(({ reason }) => reason === "other")?.count || 0,
    substitutions,
  };
}
