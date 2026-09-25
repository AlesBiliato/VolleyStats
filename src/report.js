import {
  aggregatePlayerStatistics,
  percent,
  resolveRosterName,
  statistics,
} from "./statistics.js";

export { resolveRosterName } from "./statistics.js";

export const generalGroups = [
  { label: "PUNTOS", columns: ["Tot", "BP", "G-P"] },
  { label: "SAQUE", columns: ["Tot", "Err", "Punto directo"] },
  { label: "RECEPCIÓN", columns: ["Tot", "Err", "Pos.%", "Exc.%"] },
  { label: "ATAQUE", columns: ["Tot", "Err", "Blq", "Exc", "Exc.%"] },
  { label: "BLOQUEO", columns: ["Err", "Puntos"] },
];

function generalMetrics(player) {
  return {
    points: player.points,
    breakPoints: player.breakPoints,
    gp: player.gp,
    serve: player.serve,
    serveErrors: player.serveErrors,
    aces: player.aces,
    reception: player.reception,
    receptionErrors: player.receptionErrors,
    positiveReception: player.positiveReception,
    excellentReception: player.excellentReception,
    positiveReceptionPercent: percent(
      player.positiveReception,
      player.reception,
    ),
    excellentReceptionPercent: percent(
      player.excellentReception,
      player.reception,
    ),
    attack: player.attack,
    attackErrors: player.attackErrors,
    blocked: player.blocked,
    kills: player.kills,
    attackEfficiency: percent(player.kills, player.attack),
    blockErrors: player.blockErrors,
    blockPoints: player.blockPoints,
  };
}

function cleanFilenamePart(value, fallback) {
  const clean = String(value || fallback)
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+|[._]+$/g, "");
  return clean || fallback;
}

function periodData(match, key, label, setNumber = null) {
  const periodStatistics = statistics(match, key);
  const total = aggregatePlayerStatistics(periodStatistics.players);
  const closedSet = setNumber
    ? match.finishedSets.find((item) => item.set === setNumber) || null
    : null;

  return {
    key,
    label,
    setNumber,
    closedScore: closedSet ? [...closedSet.score] : null,
    statistics: periodStatistics,
    general: {
      groups: generalGroups,
      rows: periodStatistics.players.map((player) => ({
        id: player.id,
        name: player.name,
        role: player.role,
        initialPosition: player.initialPosition,
        metrics: generalMetrics(player),
      })),
      total: {
        label: "Total equipo",
        metrics: generalMetrics(total),
      },
    },
    phases: periodStatistics.phases.map((phase) => ({
      name: phase.name,
      title: phase.name === "K1" ? "Recepción" : "Saque",
      played: phase.won + phase.lost,
      won: phase.won,
      lost: phase.lost,
      wonPercent: percent(phase.won, phase.won + phase.lost),
    })),
    rotations: periodStatistics.rotations.map((rotation) => ({
      name: rotation.name,
      won: rotation.won,
      lost: rotation.lost,
      balance: rotation.won - rotation.lost,
      wonPercent: percent(rotation.won, rotation.won + rotation.lost),
    })),
    errors: {
      rival: [
        {
          key: "serve",
          label: "Errores de saque rival",
          count: periodStatistics.rivalErrors.serve,
        },
        {
          key: "attack",
          label: "Errores de ataque rival",
          count: periodStatistics.rivalErrors.attack,
        },
      ],
      unforced: periodStatistics.unforcedReasons.map((reason) => ({
        ...reason,
      })),
      unforcedTotal: periodStatistics.unforced,
    },
  };
}

export function buildMatchReport(match, options = {}) {
  if (!match || match.status !== "finished") {
    throw Error("El informe final solo está disponible para partidos finalizados.");
  }

  const rosterName =
    options.teamName || resolveRosterName(match, options.rosters || []);
  const rival = String(match.rival || "Rival").trim() || "Rival";
  const visitor = match.venue === "Visitante";
  const homeTeam = visitor ? rival : rosterName;
  const awayTeam = visitor ? rosterName : rival;
  const finishedSets = match.finishedSets.map((item) => ({
    set: item.set,
    score: [...item.score],
  }));
  const ourSets = finishedSets.filter(({ score }) => score[0] > score[1]).length;
  const rivalSets = finishedSets.filter(({ score }) => score[1] > score[0]).length;
  const date = String(match.date || "").trim();
  const periods = [periodData(match, "all", "PARTIDO COMPLETO")];

  for (let set = 1; set <= match.set; set++) {
    periods.push(periodData(match, String(set), `SET ${set}`, set));
  }

  return {
    schemaVersion: 1,
    header: {
      rosterName,
      rival,
      venue: match.venue || "",
      competition: match.competition || "",
      date,
      time: match.time || "",
      homeTeam,
      awayTeam,
      matchup: `${homeTeam} vs ${awayTeam}`,
    },
    result: {
      ourSets,
      rivalSets,
      label: visitor
        ? `${rivalSets} - ${ourSets}`
        : `${ourSets} - ${rivalSets}`,
      finishedSets,
    },
    periods,
    filename: `VolleyStats_${cleanFilenamePart(homeTeam, "Equipo")}_vs_${cleanFilenamePart(awayTeam, "Rival")}_${cleanFilenamePart(date, "sin_fecha")}.pdf`,
  };
}
