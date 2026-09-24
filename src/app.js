import { correctEvent, grades } from "./corrections.js";
import { statistics, percent } from "./statistics.js";

import { initial, transition, createMatch } from "./domain.js";
import { loadMatch, saveMatch, loadRoster, saveRoster, loadRosters, saveRosters, loadArchives, replaceMatch } from "./storage.js";
let teamRoster;
let state;
let storageError = false;
let storageBlocked = false;
let hasMatch = false;
let savedRosters = [];
let selectedRosterId = null;
let creatingRoster = false;
let matchDraft = null;
let setupStep = "basics";
let calendarCursor = null;
let timePickerHour = "18";
let timePickerMinute = "00";
let returnToSetupAfterRoster = false;
let setLineupDraft = Array(6).fill(null);
let preparingSetNumber = 1;

try {
  savedRosters = loadRosters();
  teamRoster = [];
  creatingRoster = savedRosters.length === 0;
} catch {
  storageError = true;
  savedRosters = [];
  teamRoster = [];
  creatingRoster = true;
}

try {
  const saved = loadMatch();
  hasMatch = Boolean(saved);
  state = saved || initial();

  if (saved && !saved.demo) {
    let matchingRoster = null;

    if (typeof saved.rosterId === "string" && saved.rosterId) {
      matchingRoster =
        savedRosters.find(
          (roster) => roster.id === saved.rosterId,
        ) || null;
    } else {
      matchingRoster =
        savedRosters.find((roster) => {
          if (roster.players.length !== saved.roster.length) {
            return false;
          }

          return roster.players.every((player) => {
            const savedPlayer = saved.roster.find(
              (item) => item.id === player.id,
            );

            return (
              savedPlayer &&
              savedPlayer.name === player.name &&
              savedPlayer.role === player.role
            );
          });
        }) || null;

      if (matchingRoster) {
        const migratedState = {
          ...saved,
          rosterId: matchingRoster.id,
        };

        state = migratedState;

        try {
          saveMatch(migratedState);
        } catch {
          storageError = true;
        }
      }
    }

    if (matchingRoster) {
      selectedRosterId = matchingRoster.id;
      teamRoster = structuredClone(matchingRoster.players);
      creatingRoster = false;
    } else if (!teamRoster.length) {
      teamRoster = structuredClone(saved.roster);
      creatingRoster = false;
    }
  }
} catch {
  storageError = true;
  storageBlocked = true;
  state = initial();
}
let statsTab = "General",
  statsSet = "all",
  periodOpen = false,
  pendingCorrection = null;
let page = hasMatch && state.demo ? "setup" : "match",
  selected = null,
  action = null,
  lastTap = 0;
const app = document.querySelector("#app"),
  modal = document.querySelector("#modal");
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const player = (id) => state.roster.find((p) => p.id === id);
const isActiveLibero = (id) =>
  id === state.activeLiberoId && player(id)?.role === "Líbero";
const unforcedReasons = [
  ["rotation", "Falta de rotación"],
  ["net", "Toque de red"],
  ["other", "Otros"],
];
const button = (label, cmd, cls = "", disabled = false) =>
  `<button class="${cls}" data-cmd="${cmd}" ${disabled ? "disabled" : ""}>${label}</button>`;
function toast(s) {
  let el = document.querySelector("#toast");

  if (modal.open) {
    el = modal.querySelector(".dialog-toast");

    if (!el) {
      el = document.createElement("div");
      el.className = "dialog-toast";
      el.setAttribute("role", "status");
      modal.append(el);
    }
  }

  el.textContent = s;
  el.classList.add("show");

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    el.classList.remove("show");

    if (el.classList.contains("dialog-toast")) {
      setTimeout(() => el.remove(), 220);
    }
  }, 2600);
}
function persist(next, message) {
  try {
    if (storageBlocked) throw Error();
    saveMatch(next);
    storageError = false;
  } catch {
    storageError = true;
    render();
    toast("No se pudo guardar. La operación no se ha aplicado.");
    return false;
  }
  state = next;
  selected = null;
  action = null;
  modal.close();
  render();
  navigator.vibrate?.(25);
  toast(message);
  return true;
}
function commit(command) {
  if (Date.now() - lastTap < 400) return;
  lastTap = Date.now();
  if (command.type === "undo" && state.correctionUndo) {
    persist(state.correctionUndo, "Corrección deshecha");
    return;
  }
  const base = structuredClone(state);
  delete base.correctionUndo;
  const next = transition(base, command);
  if (next === base) return;
  persist(
    next,
    command.type === "undo" ? "Última operación deshecha" : command.label,
  );
}
function show(title, body) {
  modal.classList.toggle("stats-dialog", title === "Estadísticas");
  modal.innerHTML = `<div class="dialog-head"><div><span class="eyebrow">VOLLEYSTATS</span><h2>${title}</h2></div>${button("✕", "close", "icon")}</div>${body}`;
  if (!modal.open) modal.showModal();
}
function score() {
  const statusLabel =
    state.status === "playing"
      ? "EN DIRECTO"
      : state.status === "between"
        ? "SET FINALIZADO"
        : "PARTIDO FINALIZADO";
  const setAction =
    state.status === "playing"
      ? button("Finalizar set →", "finish", "finish")
      : state.status === "between" && state.set < 5
        ? button("Preparar siguiente set →", "next", "finish")
        : button("Ver estadísticas →", "stats", "finish");
  const finishMatchAction =
    state.status === "finished"
      ? ""
      : button("Finalizar partido", "finish-match", "finish-match");
  return `<aside class="score-panel"><div class="score-top"><span class="live-dot"></span> ${statusLabel} <span class="set-tag">SET ${state.set}</span></div><div class="score-names"><span>Nosotros</span><span>Rival</span></div><div class="score"><strong>${state.score[0]}</strong><span>:</span><strong>${state.score[1]}</strong></div><div class="serve-indicator" aria-label="${state.serving ? "Sacamos nosotros" : "Saca el rival"}"><span>${state.serving ? "&#x1F3D0;" : ""}</span><span aria-hidden="true"></span><span>${state.serving ? "" : "&#x1F3D0;"}</span></div><div class="set-results">${state.finishedSets.length ? state.finishedSets.map((s) => `<span>Set ${s.set} <b>${s.score.join("–")}</b></span>`).join("") : "Sets ganados <b>0 – 0</b>"}</div><div class="points">${button("<b>+1</b> Nosotros", "ours", "primary", state.status !== "playing")}${button("<b>+1</b> Rival", "theirs", "rival", state.status !== "playing")}</div><div class="separator"><span>PUNTO POR ERROR RIVAL</span></div><div class="errors">${button("Error saque rival <span>↗</span>", "serve-error", "", state.status !== "playing")}${button("Error ataque rival <span>↗</span>", "attack-error", "", state.status !== "playing")}</div><div class="separator"><span>PUNTO POR ERROR NUESTRO</span></div><div class="errors">${button("Errores nuestros NO forzados <span>↗</span>", "unforced-error", "", state.status !== "playing")}</div><div class="panel-note">Los puntos actualizan el saque y la rotación.</div><div class="match-end-actions ${finishMatchAction ? "open" : ""}">${setAction}${finishMatchAction}</div></aside>`;
}
function court() {
  const activeLibero = state.activeLiberoId == null
    ? null
    : state.roster.find(
        (p) => p.id === state.activeLiberoId && p.role === "Líbero",
      ) || null;
  const benchPlayers = state.roster.filter(
    (p) => !state.lineup.includes(p.id) && p.id !== activeLibero?.id,
  );
  return `<section class="court-panel"><div class="court-head"><div></div><div class="phase"><b>R${state.rotation}</b><span>${state.serving ? "K2" : "K1"}</span></div></div><div class="court-wrap"><div class="net-label">CAMPO RIVAL</div><div class="net"></div><div class="court"><div class="attack-line"></div>${[
    4, 3, 2, 5, 6, 1,
  ]
    .map((zone, i) => {
      const p = player(state.lineup[zone - 1]);

      return `<button class="player ${p.role === "Líbero" ? "libero" : ""} ${selected === p.id ? "selected" : ""}" style="--col:${i % 3};--row:${Math.floor(i / 3)}" data-cmd="player:${p.id}" aria-label="Dorsal ${p.id}, ${esc(p.name)}, zona ${zone}" ${state.status !== "playing" ? "disabled" : ""}><span class="zone">${zone}</span><span class="jersey">${p.id}</span><span class="player-name">${esc(p.name)} <small>${p.role === "Colocador" ? "C" : ""}</small></span></button>`;
    })
    .join(
      "",
    )}</div><div class="court-caption"><span>◉ ${selected ? "Jugador seleccionado" : "Toca un dorsal para registrar una acción"}</span><span>Zonas 1–6</span></div></div>${activeLibero ? `<div class="active-libero"><span class="eyebrow">LÍBERO ACTIVO</span><button type="button" class="active-libero-control ${selected === activeLibero.id ? "selected" : ""}" data-cmd="player:${activeLibero.id}" aria-label="Líbero activo, dorsal ${activeLibero.id}, ${esc(activeLibero.name)}" ${state.status !== "playing" ? "disabled" : ""}><span class="jersey">${activeLibero.id}</span><span class="active-libero-name">${esc(activeLibero.name)}</span><small>L</small></button></div>` : ""}<div class="bench"><div><span class="eyebrow">BANQUILLO</span><span class="bench-note">${benchPlayers.length} disponibles</span></div><div class="bench-players">${benchPlayers
    .map(
      (p) =>
        `<span class="bench-player ${p.role === "Líbero" ? "libero" : ""}" data-player-id="${p.id}"><b>${p.id}</b><span>${esc(p.name)}${p.role === "Líbero" ? " · L" : ""}</span></span>`,
    )
    .join("")}</div></div></section>`;
}
function sanitizeSetLineupDraft() {
  const eligibleIds = new Set(
    teamRoster
      .filter((player) => player.role !== "Líbero")
      .map((player) => player.id),
  );

  const used = new Set();

  setLineupDraft = setLineupDraft.map((playerId) => {
    if (
      playerId === null ||
      !eligibleIds.has(playerId) ||
      used.has(playerId)
    ) {
      return null;
    }

    used.add(playerId);
    return playerId;
  });
}

function rotateSetLineupDraft(direction) {
  sanitizeSetLineupDraft();
  if (
    setLineupDraft.some((playerId) => playerId === null) ||
    new Set(setLineupDraft).size !== 6
  ) return false;
  if (direction === "forward") {
    setLineupDraft = [...setLineupDraft.slice(1), setLineupDraft[0]];
  } else if (direction === "back") {
    setLineupDraft = [setLineupDraft.at(-1), ...setLineupDraft.slice(0, -1)];
  } else return false;
  return true;
}

function setupPlayerById(playerId) {
  return (
    teamRoster.find(
      (player) => player.id === playerId,
    ) || null
  );
}

function lineupPlayerPickerBody(zone, setNumber = preparingSetNumber) {
  sanitizeSetLineupDraft();

  const currentPlayerId =
    setLineupDraft[zone - 1];

  const usedByOtherZones = new Set(
    setLineupDraft.filter(
      (playerId, index) =>
        playerId !== null &&
        index !== zone - 1,
    ),
  );

  const available = [...teamRoster]
    .filter(
      (player) =>
        player.role !== "Líbero" &&
        !usedByOtherZones.has(player.id),
    )
    .sort((a, b) => a.id - b.id);

  return `
    <div class="lineup-picker">
      <p>
        Elige el jugador que empieza el Set ${setNumber}
        en la zona ${zone}.
      </p>

      <div class="lineup-player-options">
        ${available
          .map(
            (player) => `
              <button
                type="button"
                class="lineup-player-option ${
                  player.id === currentPlayerId
                    ? "selected"
                    : ""
                }"
                data-cmd="choose-lineup-player:${zone},${player.id}"
              >
                <span class="lineup-option-number">
                  ${player.id}
                </span>

                <span class="lineup-option-info">
                  <b>${esc(player.name)}</b>
                  <small>${esc(player.role)}</small>
                </span>
              </button>
            `,
          )
          .join("")}
      </div>

      ${
        currentPlayerId !== null
          ? `<div class="dialog-actions">
              ${button(
                "Vaciar zona",
                `clear-lineup-zone:${zone}`,
              )}
            </div>`
          : ""
      }
    </div>
  `;
}

function setLineupContent(setNumber = preparingSetNumber) {
  sanitizeSetLineupDraft();

  const visualZones = [4, 3, 2, 5, 6, 1];

  const completed = setLineupDraft.filter(
    (playerId) => playerId !== null,
  ).length;

  return `
    <section class="setup-section set-lineup-section">
      <div class="set-lineup-heading">
        <div>
          <span class="eyebrow">ALINEACIÓN INICIAL</span>
          <h2>Preparar Set ${setNumber}</h2>

          <p>
            Toca una zona de la pista y elige el jugador
            que comenzará en esa posición.
          </p>
        </div>

        <span class="lineup-progress">
          ${completed} / 6
        </span>
      </div>

      <div class="setup-court-layout">
        <button type="button" class="lineup-rotation-control lineup-rotation-back" data-cmd="rotate-lineup:back" aria-label="Retroceder rotación" title="Retroceder rotación" ${completed !== 6 ? "disabled" : ""}>
          <span aria-hidden="true">←</span><small>Retroceder</small>
        </button>
        <div class="setup-court-wrap">
        <div class="net-label">
          CAMPO RIVAL
        </div>

        <div class="net"></div>

        <div class="court setup-court">
          <div class="attack-line"></div>

          ${visualZones
            .map((zone, index) => {
              const playerId =
                setLineupDraft[zone - 1];

              const player =
                playerId !== null
                  ? setupPlayerById(playerId)
                  : null;

              return `
                <button
                  type="button"
                  class="player setup-lineup-player ${
                    player ? "filled" : "empty"
                  }"
                  style="
                    --col:${index % 3};
                    --row:${Math.floor(index / 3)};
                  "
                  data-cmd="set-zone:${zone}"
                  data-setup-zone="${zone}"
                  aria-label="${
                    player
                      ? `Zona ${zone}, dorsal ${player.id}, ${esc(player.name)}`
                      : `Zona ${zone}, sin jugador`
                  }"
                >
                  <span class="zone">
                    Zona ${zone}
                  </span>

                  <span class="jersey">
                    ${player ? player.id : "+"}
                  </span>

                  <span class="player-name">
                    ${
                      player
                        ? esc(player.name)
                        : "Elegir jugador"
                    }
                  </span>
                </button>
              `;
            })
            .join("")}
        </div>

        <div class="court-caption">
          <span>
            ${
              completed === 6
                ? "Sexteto inicial completo"
                : `Faltan ${6 - completed} ${
                    6 - completed === 1
                      ? "posición"
                      : "posiciones"
                  }`
            }
          </span>

          <span>Zonas 1–6</span>
        </div>
        </div>
        <button type="button" class="lineup-rotation-control lineup-rotation-forward" data-cmd="rotate-lineup:forward" aria-label="Avanzar rotación" title="Avanzar rotación" ${completed !== 6 ? "disabled" : ""}>
          <span aria-hidden="true">→</span><small>Avanzar</small>
        </button>
      </div>

      <div class="dialog-actions">
        ${button("Continuar", "continue-lineup", "primary", completed !== 6)}
        ${button(
          setNumber === 1 ? "Volver al resumen" : `Volver al resultado del Set ${setNumber - 1}`,
          setNumber === 1 ? "back-to-match-summary" : "cancel-set-preparation",
        )}
      </div>
    </section>
  `;
}

function liberoSetupContent() {
  const liberos = teamRoster.filter((player) => player.role === "Líbero");
  const selected = matchDraft.activeLiberoId;
  return `<section class="setup-section"><h2>Elegir líbero</h2><p>Selecciona el líbero activo o confirma que jugaremos sin líbero.</p><div class="setup-choice-grid">${liberos.map((p) => button(`<b>#${p.id}</b> ${esc(p.name)} <small>${esc(p.role)}</small>`, `set-libero:${p.id}`, selected === p.id ? "choice selected" : "choice")).join("")}${button("Sin líbero", "set-libero:none", selected === null ? "choice selected" : "choice")}</div><div class="dialog-actions">${button("Volver a preparar el sexteto", "back-to-lineup")}${button("Continuar", "continue-libero", "primary", selected === undefined)}</div></section>`;
}

function finalSetupContent(setNumber = preparingSetNumber) {
  const names = setLineupDraft.map((id) => setupPlayerById(id));
  const libero = matchDraft.activeLiberoId === null ? "Sin líbero" : `#${setupPlayerById(matchDraft.activeLiberoId)?.id} ${esc(setupPlayerById(matchDraft.activeLiberoId)?.name || "")}`;
  const startLabel = setNumber === 1 ? "Empezar partido" : `Empezar Set ${setNumber}`;
  return `<section class="setup-section setup-final"><h2>Confirmar titular y saque</h2><div class="setup-summary"><p><b>Sexteto titular:</b> ${names.map((p, i) => `Zona ${i + 1}: #${p.id} ${esc(p.name)}`).join(" · ")}</p><p><b>Líbero activo:</b> ${libero}</p></div><h3>¿Quién empieza sacando?</h3><div class="setup-choice-grid">${button("Nosotros", "set-serving:ours", matchDraft.serving === true ? "choice selected" : "choice")}${button("Rival", "set-serving:theirs", matchDraft.serving === false ? "choice selected" : "choice")}</div><div class="dialog-actions">${button("Modificar alineación", "back-to-lineup")}${button("Volver al líbero", "back-to-libero")}${button(startLabel, "start-match", "primary", typeof matchDraft.serving !== "boolean")}</div></section>`;
}

function matchSummaryContent(rosterName) {
  return `
      <section class="setup-section setup-summary-view">
        <h2>2. Resumen del partido</h2>

        <div class="setup-summary">
        <p><b>Plantilla:</b> ${esc(rosterName)}</p>
        <p><b>Rival:</b> ${esc(matchDraft.rival)}</p>
        <p><b>Fecha:</b> ${esc(matchDraft.date)}</p>
        <p><b>Hora:</b> ${esc(matchDraft.time)}</p>
        <p>
          <b>Condici\u00f3n:</b>
          ${matchDraft.venue === "home" ? "Local" : "Visitante"}
        </p>
      </div>

      <div class="dialog-actions">
        ${button("Modificar datos", "edit-match-basics")}
        ${button(
          "Preparar Set 1",
          "prepare-set-1",
          "primary",
          teamRoster.filter(
            (player) => player.role !== "Líbero",
          ).length < 6,
        )}
      </div>

        <p class="muted">
          Siguiente paso: preparar el Set 1.
        </p>
      </section>
    `;
}

function matchBasicsContent(rosterName) {
  const rival = matchDraft?.rival || "";
  const date = matchDraft?.date || "";
  const time = matchDraft?.time || "";
  const venue = matchDraft?.venue || "";

  return `
    <section class="setup-section setup-basics-view">
      <h2>2. Datos del partido</h2>
      <div class="setup-roster-reference">
        <span>Plantilla: <b>${esc(rosterName)}</b></span>
        ${button("Gestionar plantilla", "manage-roster")}
      </div>

      <form id="match-basics-form">
      <div class="setup-lineup">
        <label class="setup-field">
          <span class="setup-field-label">Equipo rival</span>
          <input
            class="setup-control"
            name="rival"
            maxlength="80"
            required
            placeholder="Nombre del rival"
            value="${esc(rival)}"
          />
        </label>

        <input
          type="hidden"
          name="date"
          value="${esc(date)}"
        />

        <button
          type="button"
          class="setup-field setup-picker-trigger"
          data-cmd="open-date-picker"
        >
          <span class="setup-field-label">Fecha</span>
          <span
            class="setup-picker-value ${date ? "" : "is-placeholder"}"
            data-picker-value="date"
          >
            ${date ? esc(formatDateLabel(date)) : "Seleccionar fecha"}
          </span>
          <span class="setup-picker-icon" aria-hidden="true">&#9638;</span>
        </button>

        <input
          type="hidden"
          name="time"
          value="${esc(time)}"
        />

        <button
          type="button"
          class="setup-field setup-picker-trigger"
          data-cmd="open-time-picker"
        >
          <span class="setup-field-label">Hora</span>
          <span
            class="setup-picker-value ${time ? "" : "is-placeholder"}"
            data-picker-value="time"
          >
            ${time ? esc(time) : "Seleccionar hora"}
          </span>
          <span class="setup-picker-icon" aria-hidden="true">&#9716;</span>
        </button>

        <div class="setup-field venue-field">
          <span class="setup-field-label">Local / visitante</span>

          <input
            type="hidden"
            name="venue"
            value="${esc(venue)}"
          />

          <div class="venue-options">
            <button
              type="button"
              class="venue-option ${venue === "home" ? "selected" : ""}"
              data-cmd="set-venue:home"
              data-venue="home"
              aria-pressed="${venue === "home"}"
            >
              Local
            </button>

            <button
              type="button"
              class="venue-option ${venue === "away" ? "selected" : ""}"
              data-cmd="set-venue:away"
              data-venue="away"
              aria-pressed="${venue === "away"}"
            >
              Visitante
            </button>
          </div>
        </div>
      </div>

        <button class="primary full" type="submit">
          Continuar
        </button>
      </form>
    </section>
  `;
}

function matchSetupContent() {
  const selectedRoster =
    savedRosters.find((roster) => roster.id === selectedRosterId) || null;
  const rosterName = selectedRoster?.name || "Plantilla seleccionada";

  if (setupStep === "summary" && matchDraft)
    return matchSummaryContent(rosterName);
  if (setupStep === "lineup" && matchDraft) return setLineupContent();
  if (setupStep === "libero" && matchDraft) return liberoSetupContent();
  if (setupStep === "confirm" && matchDraft) return finalSetupContent();
  return matchBasicsContent(rosterName);
}

function formatDateLabel(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const [year, month, day] = value.split("-").map(Number);

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function dateValue(year, month, day) {
  return [
    year,
    String(month + 1).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function calendarPickerBody() {
  const cursor = calendarCursor || new Date();

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const firstWeekday =
    (new Date(year, month, 1).getDay() + 6) % 7;

  const daysInMonth =
    new Date(year, month + 1, 0).getDate();

  const selected =
    document.querySelector(
      '#match-basics-form [name="date"]',
    )?.value || "";

  const now = new Date();

  const today = dateValue(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );

  const monthTitle =
    new Intl.DateTimeFormat("es-ES", {
      month: "long",
      year: "numeric",
    }).format(new Date(year, month, 1));

  const blanks =
    Array.from(
      { length: firstWeekday },
      () => '<span class="calendar-empty"></span>',
    ).join("");

  const days =
    Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const value = dateValue(year, month, day);

      const classes = [
        "calendar-day",
        value === today ? "is-today" : "",
        value === selected ? "selected" : "",
      ].filter(Boolean).join(" ");

      return `
        <button
          type="button"
          class="${classes}"
          data-cmd="pick-date:${value}"
          aria-label="${value}"
        >
          ${day}
        </button>
      `;
    }).join("");

  return `
    <div class="picker-shell">
      <div class="calendar-head">
        ${button("&#8249;", "calendar-prev", "picker-nav")}
        <strong>${esc(monthTitle)}</strong>
        ${button("&#8250;", "calendar-next", "picker-nav")}
      </div>

      <div class="calendar-weekdays">
        <span>L</span>
        <span>M</span>
        <span>X</span>
        <span>J</span>
        <span>V</span>
        <span>S</span>
        <span>D</span>
      </div>

      <div class="calendar-grid">
        ${blanks}
        ${days}
      </div>
    </div>
  `;
}

function timePickerBody() {
  const hours =
    Array.from({ length: 24 }, (_, index) => {
      const value = String(index).padStart(2, "0");

      return button(
        value,
        `pick-hour:${value}`,
        `time-option ${value === timePickerHour ? "selected" : ""}`,
      );
    }).join("");

  const minutes =
    Array.from({ length: 12 }, (_, index) => {
      const value = String(index * 5).padStart(2, "0");

      return button(
        value,
        `pick-minute:${value}`,
        `time-option ${value === timePickerMinute ? "selected" : ""}`,
      );
    }).join("");

  return `
    <div class="picker-shell time-picker">
      <div class="time-preview">
        ${timePickerHour}:${timePickerMinute}
      </div>

      <span class="picker-label">Hora</span>
      <div class="time-grid time-hours">
        ${hours}
      </div>

      <span class="picker-label">Minutos</span>
      <div class="time-grid time-minutes">
        ${minutes}
      </div>

      <div class="dialog-actions">
        ${button("Cancelar", "close")}
        ${button("Confirmar hora", "confirm-time", "primary")}
      </div>
    </div>
  `;
}

function captureMatchBasicsDraft() {
  const form = document.querySelector("#match-basics-form");

  if (!form) return;

  const data = new FormData(form);

  matchDraft = {
    ...matchDraft,
    rival: String(data.get("rival") || ""),
    date: String(data.get("date") || ""),
    time: String(data.get("time") || ""),
    venue: String(data.get("venue") || ""),
  };
}

function renderSetup() {
  if (creatingRoster) {
    app.innerHTML = `
      <header>
        <a class="brand" href="#">
          <span class="brand-mark">V</span>Volley<span>Stats</span>
        </a>

        <div class="save-state">
          <i></i>
          ${storageError ? "Guardado no disponible" : "Plantilla sin guardar"}
        </div>
      </header>

      <main>
        <section class="wide-card setup-card roster-builder">
          <div class="card-title">
            <div>
              <span class="eyebrow">NUEVA PLANTILLA</span>
              <h1>Configura tu equipo</h1>
              <p>
                A\u00f1ade los jugadores que quieras incluir.
                La plantilla no se guardar\u00e1 en el dispositivo hasta que pulses
                <b>Guardar plantilla</b>.
              </p>
            </div>
          </div>

          <div class="card-title">
            <div>
              <h2>Jugadores</h2>
              <span>
                ${teamRoster.length}
                ${teamRoster.length === 1 ? "jugador a\u00f1adido" : "jugadores a\u00f1adidos"}
              </span>
            </div>

            ${button("+ A\u00f1adir jugador", "add-roster-player", "primary")}
          </div>

          ${
            teamRoster.length
              ? `<div class="roster-grid">
                  ${[...teamRoster]
                    .sort((a, b) => a.id - b.id)
                    .map(
                      (p) => `
                        <article class="${p.role === "Líbero" ? "libero-player" : ""}">
                          <b>${p.id}</b>

                          <div>
                            <h3>${esc(p.name)}</h3>
                            <p>${esc(p.role)}</p>
                          </div>

                          ${button("Editar", `edit-roster-player:${p.id}`)}
                        </article>
                      `,
                    )
                    .join("")}
                </div>`
              : `<p class="muted">
                  Todav\u00eda no has a\u00f1adido ning\u00fan jugador.
                </p>`
          }

          <div class="dialog-actions">
            ${button(
              "Guardar plantilla",
              "save-new-roster",
              "primary",
              !teamRoster.length,
            )}

            ${
              savedRosters.length
                ? button("Volver a plantillas", "cancel-new-roster")
                : ""
            }
          </div>

          <p class="muted">
            Los datos se guardar\u00e1n solamente en este dispositivo.
          </p>
        </section>
      </main>
    `;

    return;
  }

  app.innerHTML = `
    <header>
      <a class="brand" href="#" data-cmd="nav:match">
        <span class="brand-mark">V</span>Volley<span>Stats</span>
      </a>
      <div class="save-state"><i></i>${storageError ? "Guardado no disponible" : "Borrador local"}</div>
    </header>
    <main class="setup-stage setup-stage-${setupStep}">
      <section class="wide-card setup-card">
        ${storageError ? '<p role="alert">Hay un problema con el almacenamiento. No borres los datos del navegador.</p>' : ""}
        ${matchSetupContent()}
      </section>
    </main>`;
}

function prepareNextSet() {
  if (state.status !== "between" || state.set >= 5) return;
  teamRoster = structuredClone(state.roster);
  const previousStart = state.setStarts?.find((start) => start.set === state.set);
  setLineupDraft = [...(previousStart?.lineup || state.lineup)];
  matchDraft = {
    ...(matchDraft || {}),
    activeLiberoId: previousStart
      ? previousStart.activeLiberoId
      : (state.activeLiberoId ?? null),
    serving: undefined,
  };
  preparingSetNumber = state.set + 1;
  setupStep = "lineup";
  page = "setup";
  render();
}

function activateMatch(next) {
  try {
    if (storageBlocked) throw Error("El partido guardado no se puede leer. No se sobrescribirá.");
    replaceMatch(next);
  } catch (error) { toast(error.message || "No se pudo guardar el partido."); return; }
  state = next;

  const sourceRoster =
    typeof next.rosterId === "string"
      ? savedRosters.find(
          (roster) => roster.id === next.rosterId,
        ) || null
      : null;

  if (sourceRoster) {
    selectedRosterId = sourceRoster.id;
    teamRoster = structuredClone(sourceRoster.players);
  } else {
    selectedRosterId = null;
    teamRoster = structuredClone(next.roster);
  }

  creatingRoster = false;
  hasMatch = true;
  preparingSetNumber = 1;
  page = "match";
  statsSet = "all";
  pendingCorrection = null;
  selected = action = null;
  lastTap = 0;
  modal.close();
  render();
}
document.addEventListener("submit", e => {
  if (e.target.id !== "match-basics-form") return;

  e.preventDefault();

  const data = new FormData(e.target);

  const rival = String(data.get("rival") || "").trim();
  const date = String(data.get("date") || "");
  const time = String(data.get("time") || "");
  const venue = String(data.get("venue") || "");

  if (!rival) {
    toast("Introduce el nombre del rival.");
    return;
  }

  if (!date) {
    toast("Selecciona la fecha del partido.");
    return;
  }

  if (!time) {
    toast("Selecciona la hora del partido.");
    return;
  }

  if (!["home", "away"].includes(venue)) {
    toast("Indica si jugamos como local o visitante.");
    return;
  }

  matchDraft = {
    ...matchDraft,
    rival,
    date,
    time,
    venue,
  };

  setupStep = "summary";
  render();
});

function renderRosterSelector() {
  app.innerHTML = `
    <header>
      <a class="brand" href="#">
        <span class="brand-mark">V</span>Volley<span>Stats</span>
      </a>

      <div class="save-state">
        <i></i>
        ${storageError ? "Guardado no disponible" : "Guardado en este dispositivo"}
      </div>
    </header>

    <main>
      <section class="wide-card setup-card">
        <div class="card-title">
          <div>
            <span class="eyebrow">VOLLEYSTATS</span>
            <h1>Selecciona una plantilla</h1>
            <p>Elige el equipo que vas a utilizar para preparar el partido.</p>
          </div>

          ${button("+ Nueva plantilla", "new-roster", "primary")}
        </div>

        ${
          storageError
            ? '<p role="alert">Hay un problema con el almacenamiento. No se sobrescribiran datos hasta resolverlo.</p>'
            : ""
        }

        <div class="roster-grid saved-rosters-grid">
          ${[...savedRosters]
            .sort((a, b) => a.name.localeCompare(b.name, "es"))
            .map(
              (roster) => `
                <article>
                  <div>
                    <h3>${esc(roster.name)}</h3>
                    <p>${roster.players.length} ${roster.players.length === 1 ? "jugador" : "jugadores"}</p>
                  </div>

                  <div class="dialog-actions">
                    ${button("Usar plantilla", `use-roster:${roster.id}`, "primary")}
                    ${button("Renombrar", `rename-roster:${roster.id}`)}
                    ${button("Eliminar", `delete-roster:${roster.id}`)}
                  </div>
                </article>
              `,
            )
            .join("")}
        </div>

        <p class="muted">
          Las plantillas se guardan solamente en este dispositivo.
        </p>
      </section>
    </main>
  `;
}

function render() {
  if (
    !hasMatch &&
    savedRosters.length &&
    !selectedRosterId &&
    !creatingRoster
  ) {
    renderRosterSelector();
    return;
  }

  if ((!hasMatch && page !== "roster") || page === "setup") {
    renderSetup();
    return;
  }
  app.innerHTML = `
    <header>
      <a class="brand" href="#" data-cmd="nav:match">
        <span class="brand-mark">V</span>Volley<span>Stats</span>
      </a>

      <nav>
        ${button("Partido", "nav:match", page === "match" ? "active" : "")}
        ${button("Historial", "nav:history", page === "history" ? "active" : "")}
        ${button("Plantilla", "nav:roster", page === "roster" ? "active" : "")}
      </nav>

      <div class="save-state">
        <i></i>
        ${storageError ? "Guardado no disponible" : "Guardado en este dispositivo"}
      </div>
    </header>

    <main>
      <div class="page-heading">
        <div>
          <div class="eyebrow">
            ${esc(state.competition)}
            <span> / </span>
            ${esc(state.venue)}
          </div>

          <h1>
            ${
              page === "match"
                ? `Nosotros <span>vs.</span> ${esc(state.rival)}`
                : page === "roster"
                  ? "Nuestra plantilla"
                  : "Historial de partido"
            }
          </h1>
        </div>

        ${button(hasMatch ? "Nuevo partido" : "Preparar partido", "new-match")}
      </div>

      ${
        page === "match"
          ? `
            <div class="match-grid">
              ${court()}
              ${score()}
            </div>

            <div class="toolbar">
              ${button("⇄ <span>Sustitución</span>", "sub", "", state.status !== "playing")}
              ${button("▥ <span>Estadísticas</span>", "stats")}
              ${button("↶ <span>Deshacer</span>", "undo", "", !state.undo.length && !state.correctionUndo)}
              ${button("◷ <span>Corrección / Historial</span>", "history")}
              <span>Un toque. Una acción. Todo registrado.</span>
            </div>

            <div class="latest">
              <span class="eyebrow">ÚLTIMA OPERACIÓN</span>
              <span>
                ${
                  state.events.length
                    ? esc(state.events.at(-1).label)
                    : "Listos para el primer punto."
                }
              </span>
              <span>
                ${
                  state.events.length
                    ? state.events.at(-1).after.join(" – ")
                    : "0 – 0"
                }
              </span>
            </div>
          `
          : page === "roster"
            ? `
              <section class="wide-card">
                <div class="card-title">
                  <div>
                    <h2>Jugadores</h2>
                    <span>${teamRoster.length} jugadores en la plantilla.</span>
                  </div>

                  ${button("+ Añadir jugador", "add-roster-player", "primary")}
                </div>

                <div class="roster-grid">
                  ${[...teamRoster]
                    .sort((a, b) => a.id - b.id)
                    .map(
                      (p) => `
                        <article class="${p.role === "Líbero" ? "libero-player" : ""}">
                          <b>${p.id}</b>

                          <div>
                            <h3>${esc(p.name)}</h3>
                            <p>${esc(p.role)}</p>
                          </div>

                          ${button("Editar", `edit-roster-player:${p.id}`)}

                        </article>
                      `,
                    )
                    .join("")}
                </div>

                ${
                  returnToSetupAfterRoster
                    ? `<div class="dialog-actions">
                        ${button(
                          "Confirmar plantilla",
                          "confirm-roster",
                          "primary",
                        )}
                      </div>`
                    : ""
                }
              </section>
            `
            : `
              <section class="wide-card">
                <h2>${state.demo ? "Partido de ejemplo guardado" : "Partido actual"}</h2>
                <p>
                  Edita o elimina registros. Los marcadores y las estadísticas
                  se recalculan al guardar.
                </p>

                ${historyRows(true)}
              </section>
            `
      }

      <footer>
        <span>
          VOLLEYSTATS <b> / </b> Tu equipo, punto a punto.
        </span>

        <span>
          ${navigator.onLine ? "Modo local" : "Sin conexión"} · Versión inicial 0.1
        </span>
      </footer>
    </main>
  `;
}
function historyRows(all = false) {
  const events = all ? state.events : state.events.slice(-5);
  return (
    `${state.correctionUndo ? button("Deshacer última corrección", "undo-correction", "full") : ""}` +
    (events.length
      ? `<div class="history-list">${[...events]
          .reverse()
          .map(
            (e) =>
              `<article><strong>${e.after.join(" – ")}</strong><div>${esc(e.label)}<small>Set ${e.set} · ${e.phase} · R${e.rotation} · ${new Date(e.at).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}</small></div>${["point", "action", "sub", "next"].includes(e.type) ? button("Editar", "edit-event:" + state.events.indexOf(e), "edit-event") : "<small>Resultado recalculado</small>"}</article>`,
          )
          .join("")}</div>`
      : `<div class="empty">Todavía no hay operaciones.<p>Los puntos y las acciones que registres aparecerán aquí.</p></div>`)
  );
}
function actionDialog() {
  const p = player(selected);
  const activeLiberoSelected = isActiveLibero(selected);
  show(
    `<span class="mini-number">${p.id}</span> ${esc(p.name)}`,
    `<p>${action ? "Elige la valoración." : "¿Qué acción quieres registrar?"}</p>${activeLiberoSelected ? "" : `<div class="action-options">${["Saque", "Recepción", "Ataque", "Bloqueo"].map((a) => button(a, "action:" + a, action === a ? "primary" : "")).join("")}</div>`}${action ? `<div class="grade-options">${(action === "Bloqueo" ? ["#", "="] : action === "Ataque" ? ["#", "+", "-", "=", "Blo"] : ["#", "+", "-", "="]).map((g) => button(`<b>${g === "#" ? "++" : g === "Blo" ? "Blq" : g}</b><span>${g === "#" ? (action === "Recepción" ? "Perfecta" : "Punto") : g === "+" ? "Positiva" : g === "-" ? (action === "Saque" ? "Punto rival" : action === "Ataque" ? "Contraataque" : "Free ball") : g === "Blo" ? "Bloqueado" : "Error"}</span>`, "grade:" + g)).join("")}</div><p class="muted">Los puntos directos y errores actualizan el marcador.</p>` : ""}`,
  );
}
function saveRosterPlayer(form, originalId = null) {
  const data = new FormData(form);

  const id = Number(data.get("id"));
  const name = String(data.get("name")).trim();
  const role = String(data.get("role"));

  const validRoles = ["Colocador", "Opuesto", "Receptor", "Central", "L\u00edbero"];

  if (!Number.isInteger(id) || id < 1 || id > 99) {
    toast("Introduce un dorsal v\u00e1lido entre 1 y 99.");
    return;
  }

  if (!name) {
    toast("Introduce el nombre del jugador.");
    return;
  }

  if (!validRoles.includes(role)) {
    toast("Selecciona una posici\u00f3n v\u00e1lida.");
    return;
  }

  const isEditing = originalId !== null;

  if (isEditing && !teamRoster.some((p) => p.id === originalId)) {
    toast("No se encontr\u00f3 el jugador que quieres editar.");
    return;
  }

  if (teamRoster.some((p) => p.id === id && p.id !== originalId)) {
    toast(`El dorsal ${id} ya est\u00e1 utilizado.`);
    return;
  }

  const playerData = { id, name, role };

  const nextRoster = isEditing
    ? teamRoster.map((p) => (p.id === originalId ? playerData : p))
    : [...teamRoster, playerData];

  try {
    if (creatingRoster) {
      teamRoster = nextRoster;
    } else if (selectedRosterId) {
      if (!savedRosters.some((roster) => roster.id === selectedRosterId))
        throw Error("La plantilla seleccionada ya no existe.");

      const nextSavedRosters = savedRosters.map((roster) =>
        roster.id === selectedRosterId
          ? { ...roster, players: structuredClone(nextRoster) }
          : roster,
      );

      saveRosters(nextSavedRosters);
      savedRosters = nextSavedRosters;
      teamRoster = nextRoster;
    } else {
      saveRoster(nextRoster);
      teamRoster = nextRoster;
    }

    storageError = false;
  } catch {
    storageError = true;
    render();
    toast(
      isEditing
        ? "No se pudieron guardar los cambios."
        : "No se pudo guardar el jugador.",
    );
    return;
  }

  modal.close();
  render();

  toast(
    isEditing
      ? `#${id} ${name} actualizado.`
      : `#${id} ${name} a\u00f1adido a la plantilla.`,
  );
}

document.addEventListener("click", (e) => {
  const target = e.target.closest("[data-cmd]");
  if (!target) return;
  e.preventDefault();
  const [cmd, value] = target.dataset.cmd.split(":");
  if (cmd === "new-match") {
    returnToSetupAfterRoster = false;
    matchDraft = null;
    setLineupDraft = Array(6).fill(null);
    preparingSetNumber = 1;
    setupStep = "basics";
    page = "setup";
    render();
    return;
  }
  if (cmd === "open-date-picker") {
    const current =
      document.querySelector(
        '#match-basics-form [name="date"]',
      )?.value || "";

    if (/^\d{4}-\d{2}-\d{2}$/.test(current)) {
      const [year, month] = current.split("-").map(Number);
      calendarCursor = new Date(year, month - 1, 1);
    } else {
      const now = new Date();
      calendarCursor =
        new Date(now.getFullYear(), now.getMonth(), 1);
    }

    show("Seleccionar fecha", calendarPickerBody());
    return;
  }

  if (cmd === "calendar-prev") {
    if (!calendarCursor) return;

    calendarCursor = new Date(
      calendarCursor.getFullYear(),
      calendarCursor.getMonth() - 1,
      1,
    );

    show("Seleccionar fecha", calendarPickerBody());
    return;
  }

  if (cmd === "calendar-next") {
    if (!calendarCursor) return;

    calendarCursor = new Date(
      calendarCursor.getFullYear(),
      calendarCursor.getMonth() + 1,
      1,
    );

    show("Seleccionar fecha", calendarPickerBody());
    return;
  }

  if (cmd === "pick-date") {
    const input =
      document.querySelector(
        '#match-basics-form [name="date"]',
      );

    const display =
      document.querySelector(
        '[data-picker-value="date"]',
      );

    if (!input || !value) return;

    input.value = value;

    if (display) {
      display.textContent = formatDateLabel(value);
      display.classList.remove("is-placeholder");
    }

    modal.close();
    return;
  }

  if (cmd === "open-time-picker") {
    const current =
      document.querySelector(
        '#match-basics-form [name="time"]',
      )?.value || "";

    if (/^\d{2}:\d{2}$/.test(current)) {
      [timePickerHour, timePickerMinute] =
        current.split(":");
    } else {
      const now = new Date();

      timePickerHour =
        String(now.getHours()).padStart(2, "0");

      timePickerMinute =
        String(
          Math.min(
            55,
            Math.round(now.getMinutes() / 5) * 5,
          ),
        ).padStart(2, "0");
    }

    show("Seleccionar hora", timePickerBody());
    return;
  }

  if (cmd === "pick-hour") {
    timePickerHour = value;
    show("Seleccionar hora", timePickerBody());
    return;
  }

  if (cmd === "pick-minute") {
    timePickerMinute = value;
    show("Seleccionar hora", timePickerBody());
    return;
  }

  if (cmd === "confirm-time") {
    const input =
      document.querySelector(
        '#match-basics-form [name="time"]',
      );

    const display =
      document.querySelector(
        '[data-picker-value="time"]',
      );

    if (!input) return;

    const nextTime =
      `${timePickerHour}:${timePickerMinute}`;

    input.value = nextTime;

    if (display) {
      display.textContent = nextTime;
      display.classList.remove("is-placeholder");
    }

    modal.close();
    return;
  }

  if (cmd === "set-venue") {
    if (!["home", "away"].includes(value)) return;

    const input =
      document.querySelector(
        '#match-basics-form [name="venue"]',
      );

    if (!input) return;

    input.value = value;

    document
      .querySelectorAll("[data-venue]")
      .forEach((option) => {
        const selected =
          option.dataset.venue === value;

        option.classList.toggle(
          "selected",
          selected,
        );

        option.setAttribute(
          "aria-pressed",
          String(selected),
        );
      });

    return;
  }

  if (cmd === "prepare-set-1") {
    const eligible = teamRoster.filter(
      (player) => player.role !== "Líbero",
    );

    if (eligible.length < 6) {
      toast(
        "Necesitas al menos seis jugadores que no sean líberos.",
      );
      return;
    }

    sanitizeSetLineupDraft();
    preparingSetNumber = 1;
    setupStep = "lineup";
    render();
    return;
  }

  if (cmd === "continue-lineup") {
    sanitizeSetLineupDraft();
    if (setLineupDraft.some((id) => id === null)) return;
    if (
      matchDraft.activeLiberoId !== null &&
      matchDraft.activeLiberoId !== undefined &&
      !teamRoster.some((player) => player.id === matchDraft.activeLiberoId && player.role === "Líbero")
    ) matchDraft.activeLiberoId = undefined;
    setupStep = "libero";
    if (!teamRoster.some((player) => player.role === "Líbero")) matchDraft.activeLiberoId = null;
    render();
    return;
  }

  if (cmd === "back-to-lineup") {
    setupStep = "lineup";
    render();
    return;
  }

  if (cmd === "back-to-libero") {
    setupStep = "libero";
    render();
    return;
  }

  if (cmd === "set-libero") {
    if (value === "none") matchDraft.activeLiberoId = null;
    else {
      const id = Number(value);
      if (!teamRoster.some((player) => player.id === id && player.role === "Líbero")) return;
      matchDraft.activeLiberoId = id;
    }
    render();
    return;
  }

  if (cmd === "continue-libero") {
    if (matchDraft.activeLiberoId === undefined) return;
    setupStep = "confirm";
    render();
    return;
  }

  if (cmd === "set-serving") {
    matchDraft.serving = value === "ours";
    render();
    return;
  }

  if (cmd === "start-match") {
    if (setLineupDraft.some((id) => id === null) || typeof matchDraft.serving !== "boolean" || matchDraft.activeLiberoId === undefined) return;
    if (preparingSetNumber > 1) {
      const next = transition(state, {
        type: "next",
        lineup: [...setLineupDraft],
        serving: matchDraft.serving,
        activeLiberoId: matchDraft.activeLiberoId,
        label: `Comienza el Set ${preparingSetNumber}`,
      });
      if (next === state) return;
      page = "match";
      if (!persist(next, `Set ${preparingSetNumber} preparado`)) {
        page = "setup";
        render();
        return;
      }
      preparingSetNumber = 1;
      return;
    }
    let next;
    try {
      next = createMatch({ team: teamRoster, rival: matchDraft.rival, lineup: setLineupDraft, serving: matchDraft.serving, activeLiberoId: matchDraft.activeLiberoId });
    } catch (error) { toast(error.message); return; }
    next.date = matchDraft.date;
    next.time = matchDraft.time;
    next.venue = matchDraft.venue === "home" ? "Local" : "Visitante";
    next.rosterId = selectedRosterId;
    activateMatch(next);
    return;
  }

  if (cmd === "back-to-match-summary") {
    setupStep = "summary";
    render();
    return;
  }

  if (cmd === "cancel-set-preparation") {
    page = "match";
    render();
    return;
  }

  if (cmd === "rotate-lineup") {
    if (rotateSetLineupDraft(value)) render();
    return;
  }

  if (cmd === "set-zone") {
    const zone = Number(value);

    if (
      !Number.isInteger(zone) ||
      zone < 1 ||
      zone > 6
    ) {
      return;
    }

    show(
      `Zona ${zone}`,
      lineupPlayerPickerBody(zone),
    );

    return;
  }

  if (cmd === "choose-lineup-player") {
    const parts =
      String(value || "").split(",");

    const zone = Number(parts[0]);
    const playerId = Number(parts[1]);

    if (
      !Number.isInteger(zone) ||
      zone < 1 ||
      zone > 6
    ) {
      return;
    }

    const player = teamRoster.find(
      (item) =>
        item.id === playerId &&
        item.role !== "Líbero",
    );

    if (!player) {
      toast(
        "El jugador seleccionado no est? disponible.",
      );
      return;
    }

    const duplicated =
      setLineupDraft.some(
        (selectedId, index) =>
          selectedId === playerId &&
          index !== zone - 1,
      );

    if (duplicated) {
      toast(
        "Ese jugador ya est? colocado en otra zona.",
      );
      return;
    }

    setLineupDraft[zone - 1] = playerId;

    modal.close();
    render();
    return;
  }

  if (cmd === "clear-lineup-zone") {
    const zone = Number(value);

    if (
      !Number.isInteger(zone) ||
      zone < 1 ||
      zone > 6
    ) {
      return;
    }

    setLineupDraft[zone - 1] = null;

    modal.close();
    render();
    return;
  }

  if (cmd === "edit-match-basics") {
    setupStep = "basics";
    render();
    return;
  }

  if (cmd === "resume-match") {
    try { const saved = loadArchives().find(m => m.id === value); if (saved) activateMatch(saved); }
    catch (error) { toast(error.message); }
    return;
  }
  if (cmd === "close") {
    modal.close();
    return;
  }
  if (cmd === "save-new-roster") {
    if (!creatingRoster) return;

    if (!teamRoster.length) {
      toast("A\u00f1ade al menos un jugador antes de guardar la plantilla.");
      return;
    }

    show(
      "Guardar plantilla",
      `<form id="save-roster-form" onsubmit="return false">
        <label>
          Nombre de la plantilla
          <input
            type="text"
            name="name"
            maxlength="60"
            required
            autofocus
            placeholder="Ej. CV Ciutadella"
          />
        </label>

        <div class="dialog-actions">
          <button
            class="primary"
            type="button"
            data-cmd="confirm-save-new-roster"
          >
            Guardar plantilla
          </button>

          <button type="button" data-cmd="close">
            Cancelar
          </button>
        </div>
      </form>`,
    );

    return;
  }

  if (cmd === "confirm-save-new-roster") {
    if (!creatingRoster) return;

    const form = document.querySelector("#save-roster-form");
    const name = String(new FormData(form).get("name") || "").trim();

    if (!name) {
      toast("Introduce un nombre para la plantilla.");
      return;
    }

    if (
      savedRosters.some(
        (roster) => roster.name.trim().toLowerCase() === name.toLowerCase(),
      )
    ) {
      toast("Ya existe una plantilla con ese nombre.");
      return;
    }

    if (!teamRoster.length) {
      toast("La plantilla no tiene jugadores.");
      return;
    }

    const id =
      globalThis.crypto?.randomUUID?.() ??
      `roster-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const newRoster = {
      id,
      name,
      players: structuredClone(teamRoster),
    };

    const nextSavedRosters = [...savedRosters, newRoster];

    try {
      saveRosters(nextSavedRosters);
      savedRosters = nextSavedRosters;
      storageError = false;
    } catch {
      storageError = true;
      toast("No se pudo guardar la plantilla.");
      return;
    }

    modal.close();

    teamRoster = [];
    selectedRosterId = null;
    creatingRoster = false;

    render();
    toast(`Plantilla "${name}" guardada.`);
    return;
  }

  if (cmd === "cancel-new-roster") {
    teamRoster = [];
    selectedRosterId = null;
    creatingRoster = false;
    render();
    return;
  }

  if (cmd === "rename-roster") {
    const roster = savedRosters.find((item) => item.id === value);

    if (!roster) {
      toast("No se encontr\u00f3 la plantilla.");
      return;
    }

    show(
      "Renombrar plantilla",
      `<form id="rename-roster-form" onsubmit="return false">
        <label>
          Nombre de la plantilla
          <input
            type="text"
            name="name"
            maxlength="60"
            required
            autofocus
            value="${esc(roster.name)}"
          />
        </label>

        <div class="dialog-actions">
          <button
            class="primary"
            type="button"
            data-cmd="confirm-rename-roster:${roster.id}"
          >
            Guardar nombre
          </button>

          <button type="button" data-cmd="close">
            Cancelar
          </button>
        </div>
      </form>`,
    );

    return;
  }

  if (cmd === "confirm-rename-roster") {
    const roster = savedRosters.find((item) => item.id === value);

    if (!roster) {
      modal.close();
      toast("La plantilla ya no existe.");
      return;
    }

    const form = document.querySelector("#rename-roster-form");
    const name = String(new FormData(form).get("name") || "").trim();

    if (!name) {
      toast("Introduce un nombre para la plantilla.");
      return;
    }

    if (
      savedRosters.some(
        (item) =>
          item.id !== roster.id &&
          item.name.trim().toLowerCase() === name.toLowerCase(),
      )
    ) {
      toast("Ya existe una plantilla con ese nombre.");
      return;
    }

    if (name === roster.name) {
      modal.close();
      return;
    }

    const nextSavedRosters = savedRosters.map((item) =>
      item.id === roster.id
        ? { ...item, name }
        : item,
    );

    try {
      saveRosters(nextSavedRosters);
      savedRosters = nextSavedRosters;
      storageError = false;
    } catch {
      storageError = true;
      toast("No se pudo cambiar el nombre de la plantilla.");
      return;
    }

    modal.close();
    render();
    toast(`Plantilla renombrada a "${name}".`);
    return;
  }

  if (cmd === "delete-roster") {
    const roster = savedRosters.find((item) => item.id === value);

    if (!roster) {
      toast("No se encontr\u00f3 la plantilla.");
      return;
    }

    show(
      "Eliminar plantilla",
      `<p>
        \u00bfSeguro que quieres eliminar <b>${esc(roster.name)}</b>?
      </p>
      <p class="muted">
        Esta acci\u00f3n elimina la plantilla de este dispositivo,
        pero no modifica los partidos que ya tengan una copia de sus jugadores.
      </p>
      <div class="dialog-actions">
        <button
          type="button"
          data-cmd="confirm-delete-roster:${roster.id}"
        >
          Eliminar plantilla
        </button>

        <button
          class="primary"
          type="button"
          data-cmd="close"
        >
          Cancelar
        </button>
      </div>`,
    );

    return;
  }

  if (cmd === "confirm-delete-roster") {
    const roster = savedRosters.find((item) => item.id === value);

    if (!roster) {
      modal.close();
      toast("La plantilla ya no existe.");
      return;
    }

    const nextSavedRosters = savedRosters.filter(
      (item) => item.id !== roster.id,
    );

    try {
      saveRosters(nextSavedRosters);
      savedRosters = nextSavedRosters;
      storageError = false;
    } catch {
      storageError = true;
      toast("No se pudo eliminar la plantilla.");
      return;
    }

    if (selectedRosterId === roster.id) {
      selectedRosterId = null;
      teamRoster = [];
    }

    modal.close();

    if (!savedRosters.length) {
      selectedRosterId = null;
      teamRoster = [];
      creatingRoster = true;
      page = "setup";
    }

    render();
    toast(`Plantilla "${roster.name}" eliminada.`);
    return;
  }

  if (cmd === "use-roster") {
    const roster = savedRosters.find((item) => item.id === value);

    if (!roster) {
      toast("No se encontr\u00f3 la plantilla.");
      return;
    }

    selectedRosterId = roster.id;
    teamRoster = structuredClone(roster.players);
    creatingRoster = false;
    returnToSetupAfterRoster = false;
    matchDraft = null;
    setLineupDraft = Array(6).fill(null);
    setupStep = "basics";
    page = "setup";
    render();
    return;
  }

  if (cmd === "new-roster") {
    selectedRosterId = null;
    teamRoster = [];
    creatingRoster = true;
    page = "setup";
    render();
    return;
  }

  if (cmd === "manage-roster") {
    captureMatchBasicsDraft();
    returnToSetupAfterRoster = true;
    page = "roster";
    render();
    return;
  }

  if (cmd === "confirm-roster") {
    if (!returnToSetupAfterRoster) return;

    returnToSetupAfterRoster = false;
    sanitizeSetLineupDraft();
    page = "setup";
    render();
    return;
  }

  if (cmd === "nav") {
    if (value !== "roster") {
      returnToSetupAfterRoster = false;
    }

    page = value;
    render();
    return;
  }
  if (cmd === "add-roster-player") {
    show(
      "Añadir jugador",
      `<form id="roster-form" onsubmit="return false">
        <label>
          Dorsal
          <input
            type="number"
            name="id"
            min="1"
            max="99"
            required
            autofocus
          />
        </label>

        <label>
          Nombre
          <input
            type="text"
            name="name"
            maxlength="40"
            required
          />
        </label>

        <label>
          Posición
          <select name="role" required>
            <option value="Colocador">Colocador</option>
            <option value="Opuesto">Opuesto</option>
            <option value="Receptor">Receptor</option>
            <option value="Central">Central</option>
            <option value="Líbero">Líbero</option>
          </select>
        </label>

        <div class="dialog-actions">
          ${button("Cancelar", "close")}
          <button
            class="primary"
            type="button"
            data-cmd="save-roster-player"
          >
            Guardar jugador
          </button>
        </div>
      </form>`,
    );
    return;
  }

  if (cmd === "edit-roster-player") {
    const id = Number(value);
    const rosterPlayer = teamRoster.find((p) => p.id === id);

    if (!rosterPlayer) {
      toast("No se encontró el jugador.");
      return;
    }

    show(
      "Editar jugador",
      `<form id="roster-form" onsubmit="return false">
        <label>
          Dorsal
          <input
            type="number"
            name="id"
            min="1"
            max="99"
            value="${rosterPlayer.id}"
            required
          />
        </label>

        <label>
          Nombre
          <input
            type="text"
            name="name"
            maxlength="40"
            value="${esc(rosterPlayer.name)}"
            required
          />
        </label>

        <label>
          Posición
          <select name="role" required>
            <option value="Colocador" ${rosterPlayer.role === "Colocador" ? "selected" : ""}>Colocador</option>
            <option value="Opuesto" ${rosterPlayer.role === "Opuesto" ? "selected" : ""}>Opuesto</option>
            <option value="Receptor" ${rosterPlayer.role === "Receptor" ? "selected" : ""}>Receptor</option>
            <option value="Central" ${rosterPlayer.role === "Central" ? "selected" : ""}>Central</option>
            <option value="Líbero" ${rosterPlayer.role === "Líbero" ? "selected" : ""}>Líbero</option>
          </select>
        </label>

        <div class="dialog-actions">
          ${button("Cancelar", "close")}
          <button
            class="primary"
            type="button"
            data-cmd="save-roster-edit:${rosterPlayer.id}"
          >
            Guardar cambios
          </button>
        </div>
      </form>`,
    );

    return;
  }

  if (cmd === "save-roster-player") {
    saveRosterPlayer(document.querySelector("#roster-form"));
    return;
  }

  if (cmd === "save-roster-edit") {
    saveRosterPlayer(
      document.querySelector("#roster-form"),
      Number(value),
    );
    return;
  }

  if (["ours", "theirs", "serve-error", "attack-error"].includes(cmd)) {
    commit({
      type: "point",
      team: cmd === "theirs" ? 1 : 0,
      label:
        cmd === "ours"
          ? "Punto para nosotros"
          : cmd === "theirs"
            ? "Punto para el rival"
            : cmd === "serve-error"
              ? "Error de saque rival"
              : "Error de ataque rival",
    });
    return;
  }
  if (cmd === "unforced-error") {
    if (state.status !== "playing") return;
    show(
      "Errores nuestros NO forzados",
      `<p>Elige el motivo. Se sumará un punto al rival.</p><div class="action-options">${unforcedReasons.map(([value, label]) => button(label, `record-unforced:${value}`)).join("")}</div>`,
    );
    return;
  }
  if (cmd === "record-unforced") {
    const reason = unforcedReasons.find(([reason]) => reason === value)?.[1];
    if (!reason) return;
    commit({
      type: "point",
      team: 1,
      category: "unforced-error",
      reason: value,
      label: `Error nuestro no forzado · ${reason}`,
    });
    return;
  }
  if (cmd === "player") {
    selected = Number(value);
    action = isActiveLibero(selected) ? "Recepción" : null;
    actionDialog();
    return;
  }
  if (cmd === "action") {
    action = value;
    actionDialog();
    return;
  }
  if (cmd === "grade") {
    commit({
      type: "action",
      player: selected,
      action,
      grade: value,
      label: `#${selected} · ${action} ${value}`,
    });
    return;
  }
  if (cmd === "history") {
    show(
      "Corrección / Historial",
      `<p>Últimas 5 operaciones. Edita un registro para corregirlo o eliminarlo.</p>${historyRows()}${button("Ver todas las operaciones", "all-history", "full")}`,
    );
    return;
  }
  if (cmd === "all-history") {
    show("Todas las operaciones", historyRows(true));
    return;
  }
  if (cmd === "undo") {
    show(
      "Deshacer última operación",
      `<p>${state.correctionUndo ? "Se restaurará el partido anterior a la última corrección." : esc(state.events.at(-1)?.label || "")}</p><div class="dialog-actions">${button("Cancelar", "close")}${button("Confirmar deshacer", "confirm-undo", "primary")}</div>`,
    );
    return;
  }
  if (cmd === "confirm-undo") {
    commit({ type: "undo", label: "Deshacer" });
    return;
  }
  if (cmd === "sub") {
    show(
      "Sustitución",
      `<p>Elige quién sale y quién entra. Los cambios de rol y la gestión automática del líbero se añadirán después.</p><form id="sub-form"><label>Sale<select name="out">${state.lineup.map((id) => `<option value="${id}">#${id} · ${esc(player(id).name)}</option>`).join("")}</select></label><label>Entra<select name="in">${state.roster
        .filter((p) => !state.lineup.includes(p.id) && p.role !== "Líbero")
        .map(
          (p) => `<option value="${p.id}">#${p.id} · ${esc(p.name)}</option>`,
        )
        .join(
          "",
        )}</select></label><button class="primary full" type="submit">Revisar cambio →</button></form>`,
    );
    return;
  }
  if (cmd === "confirm-sub") {
    const [out, incoming] = value.split(",").map(Number);
    commit({
      type: "sub",
      out,
      in: incoming,
      label: `Sustitución · Sale #${out} → Entra #${incoming}`,
    });
    return;
  }
  if (cmd === "stats") {
    statsTab = "General";
    statsSet = "all";
    statsDialog();
    return;
  }
  if (cmd === "stat-tab") {
    statsTab = value;
    statsDialog();
    return;
  }
  if (cmd === "period-toggle") {
    periodOpen = !periodOpen;
    statsDialog();
    return;
  }
  if (cmd === "period-set") {
    statsSet = value;
    periodOpen = false;
    statsDialog();
    return;
  }
  if (cmd === "edit-event") {
    editEvent(Number(value));
    return;
  }
  if (cmd === "delete-event") {
    previewCorrection(Number(value), null);
    return;
  }
  if (cmd === "confirm-correction") {
    if (pendingCorrection && persist(pendingCorrection, "Historial corregido"))
      pendingCorrection = null;
    return;
  }
  if (cmd === "undo-correction") {
    if (state.correctionUndo)
      persist(state.correctionUndo, "Corrección deshecha");
    return;
  }
  if (cmd === "finish") {
    if (state.status !== "playing") return;
    show(
      "Finalizar set " + state.set,
      `<div class="finish-score">${state.score.join(" – ")}</div><p>Se guardará este resultado. Puedes cerrar el set de prueba con cualquier marcador y deshacer el cierre después.</p><div class="dialog-actions">${button("Seguir jugando", "close")}${button("Confirmar cierre", "confirm-finish", "primary")}</div>`,
    );
    return;
  }
  if (cmd === "confirm-finish") {
    commit({
      type: "finish",
      label: `Set ${state.set} finalizado · ${state.score.join("–")}`,
    });
    return;
  }
  if (cmd === "finish-match") {
    if (!["playing", "between"].includes(state.status)) return;
    const message =
      state.status === "playing"
        ? `<div class="finish-score">${state.score.join(" – ")}</div><p>El partido quedará cerrado. El Set ${state.set} está en curso y no se marcará como set finalizado.</p>`
        : `<p>El partido quedará cerrado y no se preparará otro set. Los resultados de los sets ya finalizados se conservarán.</p>`;
    show(
      "Finalizar partido",
      `${message}<div class="dialog-actions">${button("Cancelar", "close")}${button("Finalizar partido", "confirm-finish-match", "danger")}</div>`,
    );
    return;
  }
  if (cmd === "confirm-finish-match") {
    commit({ type: "finish-match", label: "Partido finalizado" });
    return;
  }
  if (cmd === "next") {
    prepareNextSet();
    return;
  }
});
function statsDialog() {
  const periods = [
    ["all", "Partido completo"],
    ...Array.from({ length: state.set }, (_, i) => [
      String(i + 1),
      `Set ${i + 1}`,
    ]),
  ];
  const selectedPeriod =
    periods.find(([value]) => value === statsSet)?.[1] || "Partido completo";
  show(
    "Estadísticas",
    `<div class="stats-filter"><span class="period-label">Periodo</span><div class="period-picker"><button class="period-trigger" type="button" data-cmd="period-toggle" aria-haspopup="listbox" aria-expanded="${periodOpen}">${selectedPeriod}<span class="period-chevron" aria-hidden="true">⌄</span></button>${periodOpen ? `<div class="period-options" role="listbox" aria-label="Periodo">${periods.map(([value, label]) => `<button type="button" role="option" aria-selected="${value === statsSet}" class="period-option ${value === statsSet ? "selected" : ""}" data-cmd="period-set:${value}">${label}${value === statsSet ? '<span aria-hidden="true">✓</span>' : ""}</button>`).join("")}</div>` : ""}</div></div><div class="stats-tabs">${["General", "K1/K2", "Rotaciones", "Errores"].map((t) => button(t, "stat-tab:" + t, statsTab === t ? "primary" : "")).join("")}</div><div id="stat-body">${statsBody(statsTab)}</div>`,
  );
}
function statsBody(tab) {
  const s = statistics(state, statsSet);
  const table = (headers, rows, total) =>
    `<div class="table-scroll"><table><thead><tr>${headers.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}</tbody>${total ? `<tfoot><tr>${total.map((v) => `<td>${v}</td>`).join("")}</tr></tfoot>` : ""}</table></div>`;
  if (tab === "Errores")
    return `<div class="stat-cards"><div><b>${s.total.won} – ${s.total.lost}</b><span>Puntos registrados</span></div><div><b>${s.total.actions}</b><span>Acciones de jugadores</span></div></div>${table(
      ["Concepto", "Total"],
      [
        ["Errores nuestros no forzados", s.unforced],
        ["Faltas de rotación", s.rotationErrors],
        ["Toques de red", s.netErrors],
        ["Otros", s.otherErrors],
      ],
      ["Total", s.unforced],
    )}<p class="muted">Solo se cuentan los registros del periodo seleccionado. Los puntos manuales no se atribuyen a un jugador.</p>`;
  if (tab === "General") {
    const groups = [
      ["Puntos", ["Tot", "BP", "G-P"]],
      ["Saque", ["Tot", "Err", "Punto directo"]],
      ["Recepción", ["Tot", "Err", "Pos %", "Exc. %"]],
      ["Ataque", ["Tot", "Err", "Blq", "Exc", "Exc. %"]],
      ["Bloqueo", ["Puntos"]],
    ];
    const empty = (n) => n || "·";
    const pointTotals = s.players.reduce((total, p) => {
      for (const key of [
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
        "blockPoints",
      ])
        total[key] = (total[key] || 0) + p[key];
      return total;
    }, {});
    const renderValues = (p) => [
      [p.points, p.breakPoints, p.gp],
      [p.serve, p.serveErrors, p.aces],
      [
        p.reception,
        p.receptionErrors,
        percent(p.positiveReception, p.reception),
        percent(p.excellentReception, p.reception),
      ],
      [
        p.attack,
        p.attackErrors,
        p.blocked,
        p.kills,
        percent(p.kills, p.attack),
      ],
      [p.blockPoints],
    ];
    return `<div class="player-stats"><table><thead><tr><th rowspan="2" scope="col">Jugador</th>${groups.map(([name, headers]) => `<th class="stat-boundary" colspan="${headers.length}" scope="colgroup">${name}</th>`).join("")}</tr><tr>${groups.map(([, headers]) => headers.map((label, i) => `<th class="${i === 0 ? "stat-boundary" : ""}" scope="col">${label}</th>`).join("")).join("")}</tr></thead><tbody>${s.players
      .map((p) => {
        const values = renderValues(p).map((group) =>
          group.map((n, i) => (i >= 2 && typeof n === "string" ? n : empty(n))),
        );
        return `<tr><th scope="row">#${p.id} ${esc(p.name)}</th>${values.map((group) => group.map((value, i) => `<td class="${i === 0 ? "stat-boundary" : ""}">${value}</td>`).join("")).join("")}</tr>`;
      })
      .join("")}</tbody><tfoot><tr><th scope="row">Total</th>${renderValues(
      pointTotals,
    )
      .map((group) =>
        group
          .map(
            (n, i) => `<td class="${i === 0 ? "stat-boundary" : ""}">${n}</td>`,
          )
          .join(""),
      )
      .join(
        "",
      )}</tr></tfoot></table></div><p class="muted">BP: puntos anotados en K2 · G-P: acciones positivas (# y +) menos negativas (−, =, Blq) · Pos: recepciones # y + · Exc: puntos directos · El Total suma los registros de jugadores; no incluye puntos manuales ni errores del rival.</p>`;
  }
  if (tab === "K1/K2") {
    const card = (phase, title, description) => {
      const played = phase.won + phase.lost,
        rate = played ? Math.round((phase.won / played) * 100) : 0;
      return `<section class="phase-card ${phase.name.toLowerCase()}"><div class="phase-card-head"><span class="phase-tag">${phase.name}</span><div><h3>${title}</h3><p>${description}</p></div></div><div class="phase-rate"><strong>${played ? rate + " %" : "—"}</strong><span>Puntos ganados</span></div><div class="phase-meter" role="img" aria-label="${phase.won} puntos ganados de ${played} disputados"><span style="width:${rate}%"></span></div><div class="phase-counts"><div><b>${phase.won}</b><span>A favor</span></div><div><b>${phase.lost}</b><span>En contra</span></div></div></section>`;
    };
    return `<div class="phase-dashboard">${card(s.phases[0], "Recepción", "Cuando recibimos el saque")}${card(s.phases[1], "Saque", "Cuando sacamos nosotros")}</div><div class="phase-summary"><span>Total de fases</span><strong>${s.total.won} a favor · ${s.total.lost} en contra</strong><span>${percent(s.total.won, s.total.won + s.total.lost)} ganados</span></div><p class="muted">Porcentaje = puntos a favor / puntos disputados en cada fase. K1: recibimos; K2: sacamos. Se usa la fase anterior a cada punto registrado, incluidos los puntos por error rival.</p>`;
  }
  const groups = s.rotations;
  const won = groups.reduce((n, g) => n + g.won, 0),
    lost = groups.reduce((n, g) => n + g.lost, 0);
  return (
    table(
      ["Rotación", "A favor", "En contra", "Balance", "% ganados"],
      groups.map((g) => [
        g.name,
        g.won,
        g.lost,
        g.won - g.lost,
        percent(g.won, g.won + g.lost),
      ]),
      ["Total", won, lost, won - lost, percent(won, won + lost)],
    ) +
    `<p class="muted">Porcentaje = puntos a favor / puntos disputados registrados. Se usa la rotación anterior al punto. R1–R6 siguen el contador de rotación del partido.</p>`
  );
}
const pointOptions = [
  ["ours", "Punto para nosotros"],
  ["theirs", "Punto para el rival"],
  ["serve", "Error de saque rival"],
  ["attack", "Error de ataque rival"],
  ...unforcedReasons.map(([value, label]) => [
    value,
    `Error nuestro no forzado · ${label}`,
  ]),
];
function editEvent(index) {
  const e = state.events[index];
  if (!e) return;
  const before = state.undo[index];
  const options = (list, current) =>
    list
      .map(
        ([value, label]) =>
          `<option value="${esc(value)}" ${String(value) === String(current) ? "selected" : ""}>${esc(label)}</option>`,
      )
      .join("");
  const players = (ids) => ids.map((id) => [id, `#${id} · ${player(id).name}`]);
  let fields = "";
  if (e.type === "point") {
    const kind =
      e.category === "unforced-error"
        ? e.reason
        : e.label === "Error de saque rival"
          ? "serve"
          : e.label === "Error de ataque rival"
            ? "attack"
            : e.team === 0
              ? "ours"
              : "theirs";
    fields = `<label>Resultado<select name="kind">${options(pointOptions, kind)}</select></label>`;
  }
  if (e.type === "action")
    fields = `<label>Jugador<select name="player">${options(players(before.lineup), e.player)}</select></label><label>Acción<select name="action" id="edit-action">${options(
      Object.keys(grades).map((a) => [a, a]),
      e.action,
    )}</select></label><label>Valoración<select name="grade" id="edit-grade">${options(
      grades[e.action].map((g) => [g, e.action === "Ataque" && g === "Blo" ? "Blq" : g]),
      e.grade,
    )}</select></label>`;
  if (e.type === "sub")
    fields = `<label>Sale<select name="out">${options(players(before.lineup), e.out)}</select></label><label>Entra<select name="in">${options(players(state.roster.filter((p) => !before.lineup.includes(p.id) && p.role !== "Líbero").map((p) => p.id)), e.in)}</select></label>`;
  if (e.type === "next")
    fields = `<label>Saque inicial<select name="serving">${options(
      [
        ["ours", "Sacamos nosotros"],
        ["theirs", "Saca el rival"],
      ],
      e.serving ? "ours" : "theirs",
    )}</select></label>`;
  show(
    "Corregir registro",
    `<p>Set ${e.set} · ${esc(e.label)}</p><form id="edit-form" data-index="${index}">${fields}<button class="primary full" type="submit">Revisar corrección</button></form>${e.type !== "next" ? button("Eliminar este registro", "delete-event:" + index, "full") : ""}`,
  );
}
function previewCorrection(index, command) {
  try {
    pendingCorrection = correctEvent(state, index, command);
  } catch (error) {
    pendingCorrection = null;
    toast(error.message);
    return;
  }
  show(
    "Revisar corrección",
    `<p>${command ? "Se modificará" : "Se eliminará"}: ${esc(state.events[index].label)}</p>${command ? `<p>Nuevo registro: <b>${esc(command.label)}</b></p>` : ""}<p>Marcador actual: <b>${state.score.join(" – ")}</b> → <b>${pendingCorrection.score.join(" – ")}</b><br>Rotación: R${state.rotation} → R${pendingCorrection.rotation}<br>Saque: ${pendingCorrection.serving ? "nosotros" : "rival"}</p><p>Sets cerrados: ${pendingCorrection.finishedSets.map((s) => `Set ${s.set}: ${s.score.join("–")}`).join(" · ") || "ninguno"}.</p><p>Se recalcularán las operaciones posteriores y las estadísticas. Puedes deshacer esta corrección hasta registrar otra operación.</p><div class="dialog-actions">${button("Cancelar", "close")}${button("Guardar corrección", "confirm-correction", "primary")}</div>`,
  );
}
document.addEventListener("change", (e) => {
  if (e.target.id === "edit-action") {
    document.querySelector("#edit-grade").innerHTML = grades[e.target.value]
      .map((g) => `<option value="${g}">${e.target.value === "Ataque" && g === "#" ? "++" : g === "Blo" ? "Blq" : g}</option>`)
      .join("");
  }
});
document.addEventListener(
  "submit",
  (e) => {
    const form = e.target.closest?.("form") || e.target;

    if (form.id === "roster-form") {
      e.preventDefault();
      saveRosterPlayer(form);
      return;
    }

    if (form.id !== "edit-form") return;

    e.preventDefault();

    const data = new FormData(form),
      index = Number(form.dataset.index),
      original = state.events[index];

    let command = { type: original.type };

    if (original.type === "point") {
      const kind = data.get("kind");
      const isUnforced = unforcedReasons.some(([reason]) => reason === kind);

      command.team = kind === "theirs" || isUnforced ? 1 : 0;

      command.label = pointOptions.find((p) => p[0] === kind)[1];

      if (isUnforced) {
        command.category = "unforced-error";
        command.reason = kind;
      }
    }

    if (original.type === "action") {
      Object.assign(command, {
        player: Number(data.get("player")),
        action: data.get("action"),
        grade: data.get("grade"),
      });

      command.label = `#${command.player} · ${command.action} ${command.grade}`;
    }

    if (original.type === "sub") {
      Object.assign(command, {
        out: Number(data.get("out")),
        in: Number(data.get("in")),
      });

      command.label = `Sustitución · Sale #${command.out} → Entra #${command.in}`;
    }

    if (original.type === "next") {
      command.serving = data.get("serving") === "ours";
      command.lineup = original.lineup ? [...original.lineup] : undefined;
      command.activeLiberoId = original.activeLiberoId;
      command.label = `Comienza el set ${original.set + 1}`;
    }

    previewCorrection(index, command);
  },
  true,
);
document.addEventListener("submit", (e) => {
  if (e.target.id !== "sub-form") return;
  e.preventDefault();
  const data = new FormData(e.target),
    out = Number(data.get("out")),
    incoming = Number(data.get("in"));
  show(
    "Confirmar sustitución",
    `<p class="sub-summary">Sale <b>#${out}</b> → Entra <b>#${incoming}</b></p><div class="dialog-actions">${button("Cancelar", "close")}${button("Confirmar cambio", `confirm-sub:${out},${incoming}`, "primary")}</div>`,
  );
});
window.addEventListener("online", render);
window.addEventListener("offline", render);
render();
if ("serviceWorker" in navigator)
  navigator.serviceWorker
    .register("./sw.js")
    .catch(() => toast("La caché sin conexión no está disponible."));
