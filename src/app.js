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
  return `<aside class="score-panel"><div class="score-top"><span class="live-dot"></span> ${state.status === "playing" ? "EN DIRECTO" : "SET FINALIZADO"} <span class="set-tag">SET ${state.set}</span></div><div class="score-names"><span>Nosotros</span><span>Rival</span></div><div class="score"><strong>${state.score[0]}</strong><span>:</span><strong>${state.score[1]}</strong></div><div class="serve-indicator" aria-label="${state.serving ? "Sacamos nosotros" : "Saca el rival"}"><span>${state.serving ? "&#x1F3D0;" : ""}</span><span aria-hidden="true"></span><span>${state.serving ? "" : "&#x1F3D0;"}</span></div><div class="set-results">${state.finishedSets.length ? state.finishedSets.map((s) => `<span>Set ${s.set} <b>${s.score.join("–")}</b></span>`).join("") : "Sets ganados <b>0 – 0</b>"}</div><div class="points">${button("<b>+1</b> Nosotros", "ours", "primary", state.status !== "playing")}${button("<b>+1</b> Rival", "theirs", "rival", state.status !== "playing")}</div><div class="separator"><span>PUNTO POR ERROR RIVAL</span></div><div class="errors">${button("Error saque rival <span>↗</span>", "serve-error", "", state.status !== "playing")}${button("Error ataque rival <span>↗</span>", "attack-error", "", state.status !== "playing")}</div><div class="separator"><span>PUNTO POR ERROR NUESTRO</span></div><div class="errors">${button("Errores nuestros NO forzados <span>↗</span>", "unforced-error", "", state.status !== "playing")}</div><div class="panel-note">Los puntos actualizan el saque y la rotación.</div>${button(state.status === "playing" ? "Finalizar set →" : state.set < 5 ? "Preparar siguiente set →" : "Ver resumen del partido", state.status === "playing" ? "finish" : state.set < 5 ? "next" : "stats", "finish")}</aside>`;
}
function court() {
  return `<section class="court-panel"><div class="court-head"><div></div><div class="phase"><b>R${state.rotation}</b><span>${state.serving ? "K2" : "K1"}</span></div></div><div class="court-wrap"><div class="net-label">CAMPO RIVAL</div><div class="net"></div><div class="court"><div class="attack-line"></div>${[
    4, 3, 2, 5, 6, 1,
  ]
    .map((zone, i) => {
      const p = player(state.lineup[zone - 1]);

      return `<button class="player ${p.role === "Líbero" ? "libero" : ""} ${selected === p.id ? "selected" : ""}" style="--col:${i % 3};--row:${Math.floor(i / 3)}" data-cmd="player:${p.id}" aria-label="Dorsal ${p.id}, ${esc(p.name)}, zona ${zone}" ${state.status !== "playing" ? "disabled" : ""}><span class="zone">${zone}</span><span class="jersey">${p.id}</span><span class="player-name">${esc(p.name)} <small>${p.role === "Colocador" ? "C" : ""}</small></span></button>`;
    })
    .join(
      "",
    )}</div><div class="court-caption"><span>◉ ${selected ? "Jugador seleccionado" : "Toca un dorsal para registrar una acción"}</span><span>Zonas 1–6</span></div></div><div class="bench"><div><span class="eyebrow">BANQUILLO</span><span class="bench-note">${state.roster.length - 6} disponibles</span></div><div class="bench-players">${state.roster
    .filter((p) => !state.lineup.includes(p.id))
    .map(
      (p) =>
        `<span class="bench-player ${p.role === "Líbero" ? "libero" : ""}"><b>${p.id}</b><span>${esc(p.name)}${p.role === "Líbero" ? " · L" : ""}</span></span>`,
    )
    .join("")}</div></div></section>`;
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

  const eligible = teamRoster.filter(p => p.role !== "Líbero");
  let archives = [];
  try { archives = loadArchives(); } catch { storageError = true; }
  app.innerHTML = `<header><a class="brand" href="#" data-cmd="nav:match">VolleyStats</a></header>
    <main><section class="wide-card setup-card"><h1>${hasMatch ? "Preparar otro partido" : "Bienvenido a VolleyStats"}</h1>
    <p>Guarda tu plantilla en este dispositivo y elige la alineación inicial de cada partido.</p>
    ${storageError ? '<p role="alert">Hay un problema con el almacenamiento. No borres los datos del navegador.</p>' : ""}
    <h2>1. Tu plantilla</h2>
    <p>${teamRoster.length} ${teamRoster.length === 1 ? "jugador a\u00f1adido" : "jugadores a\u00f1adidos"}.</p>

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
                  </article>
                `,
              )
              .join("")}
          </div>`
        : `<p class="muted">Todav\u00eda no has a\u00f1adido ning\u00fan jugador.</p>`
    }

    <div class="dialog-actions">
      ${button("Gestionar plantilla", "nav:roster")}
      ${button("A\u00f1adir jugador", "add-roster-player", "primary")}
    </div>
    <h2>2. Preparar partido</h2>
    ${eligible.length < 6 ? '<p>Añade al menos seis jugadores que no sean líberos para elegir la alineación.</p>' : `<form id="match-setup">
      <label>Equipo rival<input name="rival" maxlength="80" required placeholder="Nombre del rival"></label>
      <p>Selecciona un jugador distinto en cada zona. Zona 1: zaguero derecho; zonas 2, 3 y 4: delanteros; zonas 5 y 6: zagueros.</p>
      <div class="setup-lineup">${Array.from({length:6}, (_, i) => `<label>Zona ${i + 1}<select name="zone${i + 1}" required><option value="">Seleccionar jugador</option>${eligible.map(p => `<option value="${p.id}">#${p.id} · ${esc(p.name)} · ${esc(p.role)}</option>`).join("")}</select></label>`).join("")}</div>
      <label>Saque inicial<select name="serving" required><option value="">Elige quién saca</option><option value="ours">Sacamos nosotros</option><option value="theirs">Saca el rival</option></select></label>
      ${hasMatch ? '<p>El partido actual se conservará en los partidos guardados de este dispositivo.</p>' : ""}
      <button class="primary full" type="submit">Iniciar partido</button></form>`}
    ${hasMatch ? button("Volver al partido actual", "nav:match", "full") : ""}
    ${archives.length ? `<h2>Partidos guardados</h2>${archives.filter(m => m.id !== state.id).map(m => button(`${esc(m.rival)} · ${esc(m.date)} · ${m.score.join("–")}`, "resume-match:" + m.id, "full")).join("")}` : ""}
    <p class="muted">Los datos se guardan en este navegador. No se sincronizan entre dispositivos.</p></section></main>`;
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
  page = "match";
  statsSet = "all";
  pendingCorrection = null;
  selected = action = null;
  lastTap = 0;
  modal.close();
  render();
}
document.addEventListener("submit", e => {
  if (e.target.id !== "match-setup") return;
  e.preventDefault();
  const data = new FormData(e.target);
  try {
    const serving = data.get("serving");
    if (!["ours", "theirs"].includes(serving)) throw Error("Elige el saque inicial.");
    const nextMatch = createMatch({
      team: teamRoster,
      rival: data.get("rival"),
      lineup: Array.from(
        { length: 6 },
        (_, i) => Number(data.get("zone" + (i + 1))),
      ),
      serving: serving === "ours",
    });

    if (selectedRosterId) {
      nextMatch.rosterId = selectedRosterId;
    }

    activateMatch(nextMatch);
  } catch (error) { toast(error.message); }
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
  show(
    `<span class="mini-number">${p.id}</span> ${esc(p.name)}`,
    `<p>${action ? "Elige la valoración." : "¿Qué acción quieres registrar?"}</p><div class="action-options">${["Saque", "Recepción", "Ataque", "Bloqueo"].map((a) => button(a, "action:" + a, action === a ? "primary" : "")).join("")}</div>${action ? `<div class="grade-options">${(action === "Bloqueo" ? ["#", "="] : action === "Ataque" ? ["#", "+", "-", "=", "Blo"] : ["#", "+", "-", "="]).map((g) => button(`<b>${g === "#" ? "++" : g === "Blo" ? "Blq" : g}</b><span>${g === "#" ? (action === "Recepción" ? "Perfecta" : "Punto") : g === "+" ? "Positiva" : g === "-" ? (action === "Saque" ? "Punto rival" : action === "Ataque" ? "Contraataque" : "Free ball") : g === "Blo" ? "Bloqueado" : "Error"}</span>`, "grade:" + g)).join("")}</div><p class="muted">Los puntos directos y errores actualizan el marcador.</p>` : ""}`,
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
  if (cmd === "new-match") { page = "setup"; render(); return; }
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

  if (cmd === "nav") {
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
      `<p>Elige el motivo. Se sumará un punto al rival.</p><div class="action-options">${button("Falta de rotación", "record-unforced:rotation")}${button("Toque de red", "record-unforced:net")}</div>`,
    );
    return;
  }
  if (cmd === "record-unforced") {
    const reason = { rotation: "Falta de rotación", net: "Toque de red" }[
      value
    ];
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
    action = null;
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
  if (cmd === "next") {
    show(
      "Preparar set " + (state.set + 1),
      `<p>Se mantiene la alineación actual. La edición completa de la formación estará disponible en la siguiente fase.</p><p>¿Quién comienza sacando?</p><div class="dialog-actions">${button("Sacamos", "start:ours", "primary")}${button("Recibimos", "start:theirs")}</div>`,
    );
    return;
  }
  if (cmd === "start")
    commit({
      type: "next",
      serving: value === "ours",
      label: `Comienza el set ${state.set + 1}`,
    });
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
  ["rotation", "Error nuestro no forzado · Falta de rotación"],
  ["net", "Error nuestro no forzado · Toque de red"],
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

      command.team = ["theirs", "rotation", "net"].includes(kind) ? 1 : 0;

      command.label = pointOptions.find((p) => p[0] === kind)[1];

      if (["rotation", "net"].includes(kind)) {
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
