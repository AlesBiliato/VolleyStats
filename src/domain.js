export function rotationFromLineup(roster, lineup, fallbackRotation) {
  if (!Array.isArray(roster) || !Array.isArray(lineup) || lineup.length !== 6) {
    return fallbackRotation;
  }

  const setters = lineup
    .map((playerId) => roster.find((player) => player.id === playerId))
    .filter((player) => player?.role === "Colocador");

  return setters.length === 1
    ? lineup.findIndex((playerId) => playerId === setters[0].id) + 1
    : fallbackRotation;
}

export const roster = [
  { id: 7, name: "Álex", role: "Receptor" },
  { id: 12, name: "Dani", role: "Central" },
  { id: 9, name: "Pablo", role: "Opuesto" },
  { id: 4, name: "Marcos", role: "Colocador" },
  { id: 15, name: "Hugo", role: "Central" },
  { id: 8, name: "Lucas", role: "Receptor" },
  { id: 1, name: "Nico", role: "Líbero" },
  { id: 3, name: "Leo", role: "Receptor" },
  { id: 6, name: "Adrián", role: "Colocador" },
  { id: 11, name: "Mario", role: "Opuesto" },
];
export const initial = () => ({
  schemaVersion: 1,
  id: "demo-match",
  demo: true,
  rival: "Equipo rival",
  competition: "Partido de prueba",
  date: new Date().toISOString().slice(0, 10),
  venue: "Local",
  roster: structuredClone(roster),
  set: 1,
  score: [0, 0],
  rotation: 1,
  serving: false,
  activeLiberoId: null,
  lineup: [4, 9, 12, 7, 8, 15],
  setStarts: [{ set: 1, lineup: [4, 9, 12, 7, 8, 15], activeLiberoId: null, serving: false }],
  finishedSets: [],
  status: "playing",
  events: [],
  undo: [],
});
export function createMatch({ team, rival, lineup, serving, activeLiberoId = null }) {
  if (!Array.isArray(team) || team.length < 6 || new Set(team.map(p => p.id)).size !== team.length)
    throw Error("Añade al menos seis jugadores a tu plantilla.");
  if (!Array.isArray(lineup) || lineup.length !== 6 || new Set(lineup).size !== 6 ||
      !lineup.every(id => team.some(p => p.id === id && p.role !== "Líbero")))
    throw Error("Selecciona seis titulares distintos, uno por zona, sin incluir al líbero.");
  if (typeof rival !== "string" || !rival.trim() || typeof serving !== "boolean")
    throw Error("Indica el rival y quién saca primero.");
  if (activeLiberoId !== null && !team.some(p => p.id === activeLiberoId && p.role === "Líbero"))
    throw Error("El líbero activo no pertenece a la plantilla.");
  const next = { ...initial(), id: globalThis.crypto.randomUUID(), demo: false,
    rival: rival.trim(), competition: "Partido", roster: structuredClone(team),
    lineup: [...lineup], serving, activeLiberoId,
    setStarts: [{ set: 1, lineup: [...lineup], activeLiberoId, serving }] };
  next.rotation = rotationFromLineup(next.roster, next.lineup, next.rotation);
  return next;
}
export function transition(previous, command) {
  const state = structuredClone(previous);
  state.rotation = rotationFromLineup(state.roster, state.lineup, state.rotation);
  const { events, undo, ...snapshot } = structuredClone(state);
  if (command.type === "undo") {
    const last = state.undo.pop();
    if (!last) return previous;
    return {
      ...last,
      rotation: rotationFromLineup(last.roster, last.lineup, last.rotation),
      events: state.events.slice(0, -1),
      undo: state.undo,
    };
  }
  const canFinishMatch =
    command.type === "finish-match" &&
    ["playing", "between"].includes(state.status);
  const canStartNextSet =
    command.type === "next" && state.status === "between";
  const canRecordPlayingCommand =
    state.status === "playing" &&
    ["point", "action", "sub", "libero-change", "finish"].includes(command.type);
  if (!canFinishMatch && !canStartNextSet && !canRecordPlayingCommand)
    return previous;
  let label = command.label || command.type;
  if (command.type === "point") {
    state.score[command.team]++;
    if (command.team === 0 && !state.serving) {
      state.lineup = [...state.lineup.slice(1), state.lineup[0]];
    }
    state.rotation = rotationFromLineup(state.roster, state.lineup, state.rotation);
    state.serving = command.team === 0;
  } else if (command.type === "action") {
    const win = command.grade === "#" && command.action !== "Recepción";
    const lose =
      command.grade === "=" ||
      command.grade === "Blo" ||
      (command.action === "Saque" && command.grade === "-");
    if (win || lose) {
      state.score[win ? 0 : 1]++;
      if (win && !state.serving) {
        state.lineup = [...state.lineup.slice(1), state.lineup[0]];
      }
      state.rotation = rotationFromLineup(state.roster, state.lineup, state.rotation);
      state.serving = win;
    }
  } else if (command.type === "sub") {
    const index = state.lineup.indexOf(command.out);
    if (index < 0 || state.lineup.includes(command.in)) return previous;
    state.lineup[index] = command.in;
    state.rotation = rotationFromLineup(state.roster, state.lineup, state.rotation);
  } else if (command.type === "libero-change") {
    if (
      command.activeLiberoId === state.activeLiberoId ||
      !Number.isInteger(command.activeLiberoId) ||
      !state.roster.some(
        (player) =>
          player.id === command.activeLiberoId && player.role === "Líbero",
      )
    ) return previous;
    state.activeLiberoId = command.activeLiberoId;
  } else if (command.type === "finish") {
    state.finishedSets.push({ set: state.set, score: [...state.score] });
    state.status = "between";
  } else if (command.type === "finish-match") {
    state.status = "finished";
  } else if (command.type === "next") {
    if (state.set >= 5) return previous;
    const fallbackStart = previous.setStarts?.find(start => start.set === previous.set);
    const nextLineup = command.lineup || fallbackStart?.lineup || previous.lineup;
    const nextLiberoId = command.activeLiberoId === undefined
      ? (fallbackStart ? fallbackStart.activeLiberoId : (previous.activeLiberoId ?? null))
      : command.activeLiberoId;
    if (!Array.isArray(nextLineup) || nextLineup.length !== 6 || new Set(nextLineup).size !== 6 ||
        !nextLineup.every(id => state.roster.some(p => p.id === id && p.role !== "Líbero")) ||
        (nextLiberoId !== null && !state.roster.some(p => p.id === nextLiberoId && p.role === "Líbero")) ||
        typeof command.serving !== "boolean") return previous;
    state.set++;
    state.score = [0, 0];
    state.lineup = [...nextLineup];
    state.rotation = rotationFromLineup(state.roster, state.lineup, state.rotation);
    state.serving = command.serving;
    state.activeLiberoId = nextLiberoId;
    state.setStarts = [...(state.setStarts || []), {
      set: state.set,
      lineup: [...nextLineup],
      activeLiberoId: nextLiberoId,
      serving: command.serving,
    }];
    state.status = "playing";
  } else return previous;
  state.undo.push(snapshot);
  state.events.push({
    id: globalThis.crypto.randomUUID(),
    at: new Date().toISOString(),
    set: previous.set,
    rotation: snapshot.rotation,
    phase: previous.serving ? "K2" : "K1",
    before: [...previous.score],
    after: [...state.score],
    ...command,
    label,
  });
  return state;
}
