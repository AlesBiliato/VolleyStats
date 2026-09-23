// Device-local repository boundary. Replace this adapter with IndexedDB when adding match archives.

const MATCH_KEY = "volleystats.match.v1";
const ROSTER_KEY = "volleystats.roster.v1";
const LEGACY_MATCH_KEY = "volleytrack.match.v1";
const LEGACY_ROSTER_KEY = "volleytrack.roster.v1";

const validScore = (score) =>
  Array.isArray(score) &&
  score.length === 2 &&
  score.every((n) => Number.isInteger(n) && n >= 0);

function validRoster(data) {
  if (!Array.isArray(data) || !data.length) return false;

  if (
    !data.every(
      (p) =>
        p &&
        Number.isInteger(p.id) &&
        typeof p.name === "string" &&
        typeof p.role === "string",
    )
  )
    return false;

  const ids = new Set(data.map((p) => p.id));

  return ids.size === data.length;
}

function validSnapshot(data) {
  if (!data || data.schemaVersion !== 1 || !validRoster(data.roster))
    return false;

  const ids = new Set(data.roster.map((p) => p.id));

  return (
    Array.isArray(data.lineup) &&
    data.lineup.length === 6 &&
    new Set(data.lineup).size === 6 &&
    data.lineup.every((id) => ids.has(id)) &&
    validScore(data.score) &&
    Number.isInteger(data.set) &&
    data.set >= 1 &&
    data.set <= 5 &&
    Number.isInteger(data.rotation) &&
    data.rotation >= 1 &&
    data.rotation <= 6 &&
    typeof data.serving === "boolean" &&
    ["playing", "between"].includes(data.status) &&
    Array.isArray(data.finishedSets) &&
    data.finishedSets.every(
      (s) =>
        s &&
        Number.isInteger(s.set) &&
        s.set >= 1 &&
        s.set <= 5 &&
        validScore(s.score),
    ) &&
    ["rival", "competition", "venue"].every(
      (key) => typeof data[key] === "string",
    )
  );
}

function validMatch(data) {
  return (
    validSnapshot(data) &&
    Array.isArray(data.events) &&
    data.events.every(
      (e) =>
        e &&
        typeof e.label === "string" &&
        typeof e.at === "string" &&
        validScore(e.before) &&
        validScore(e.after),
    ) &&
    Array.isArray(data.undo) &&
    data.undo.length === data.events.length &&
    data.undo.every(validSnapshot)
  );
}

export function loadMatch() {
  let value = localStorage.getItem(MATCH_KEY);
  let legacy = false;

  if (!value) {
    value = localStorage.getItem(LEGACY_MATCH_KEY);
    legacy = Boolean(value);
  }

  if (!value) return null;

  const data = JSON.parse(value);

  if (
    !validMatch(data) ||
    (data.correctionUndo &&
      (!validMatch(data.correctionUndo) || data.correctionUndo.correctionUndo))
  )
    throw Error("Formato local no compatible");

  if (legacy) {
    try {
      localStorage.setItem(MATCH_KEY, value);
    } catch {
      // Keep loading the valid legacy copy if migration cannot be persisted.
    }
  }

  return data;
}

export function saveMatch(match) {
  localStorage.setItem(MATCH_KEY, JSON.stringify(match));
}

export function loadRoster() {
  let value = localStorage.getItem(ROSTER_KEY);
  let legacy = false;

  if (!value) {
    value = localStorage.getItem(LEGACY_ROSTER_KEY);
    legacy = Boolean(value);
  }

  if (!value) return null;

  const data = JSON.parse(value);

  if (!validRoster(data)) throw Error("Formato de plantilla no compatible");

  if (legacy) {
    try {
      localStorage.setItem(ROSTER_KEY, value);
    } catch {
      // Keep loading the valid legacy copy if migration cannot be persisted.
    }
  }

  return data;
}

export function saveRoster(roster) {
  if (!validRoster(roster)) throw Error("Plantilla no válida");

  localStorage.setItem(ROSTER_KEY, JSON.stringify(roster));
}
