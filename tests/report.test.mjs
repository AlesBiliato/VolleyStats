import test from "node:test";
import assert from "node:assert/strict";
import { initial, transition } from "../src/domain.js";
import { renderMatchPdf } from "../src/pdf-report.js";
import { buildMatchReport, generalGroups } from "../src/report.js";
import { statistics } from "../src/statistics.js";

const action = (player, name, grade) => ({
  type: "action",
  player,
  action: name,
  grade,
  label: `${name} ${grade}`,
});
const point = (team, label, extra = {}) => ({
  type: "point",
  team,
  label,
  ...extra,
});
const run = (state, commands) => commands.reduce(transition, state);

function finishedSample() {
  const base = initial();
  Object.assign(base, {
    demo: false,
    id: "report-match",
    rosterName: "Vóley Ciutadella",
    rival: "Peña Übeda",
    competition: "Liga sénior",
    date: "2026-10-11",
    time: "18:30",
    venue: "Local",
  });
  return run(base, [
    action(7, "Recepción", "#"),
    action(7, "Recepción", "+"),
    action(7, "Ataque", "#"),
    action(7, "Ataque", "Blo"),
    point(0, "Error de saque rival"),
    point(0, "Error de ataque rival"),
    point(1, "Error nuestro no forzado · Falta de rotación", {
      category: "unforced-error",
      reason: "rotation",
    }),
    point(1, "Error nuestro no forzado · Toque de red", {
      category: "unforced-error",
      reason: "net",
    }),
    point(0, "Punto para nosotros"),
    { type: "finish", label: "Set 1 finalizado" },
    { type: "next", serving: true, label: "Comienza el Set 2" },
    action(8, "Saque", "#"),
    action(8, "Ataque", "="),
    { type: "finish-match", label: "Partido finalizado" },
  ]);
}

function renderProbe(report) {
  const calls = [];
  let options;
  class PdfProbe {
    constructor(receivedOptions) {
      options = receivedOptions;
      this.page = 1;
      this.lastAutoTable = { finalY: 20 };
      this.internal = {
        pageSize: {
          getWidth: () => 297,
          getHeight: () => 210,
        },
      };
    }
    setProperties() {}
    setLanguage() {}
    setTextColor() {}
    setFont() {}
    setFontSize() {}
    setDrawColor(...color) { calls.push({ type: "draw-color", color }); }
    setLineWidth(width) { calls.push({ type: "line-width", width }); }
    line(...coordinates) { calls.push({ type: "line", coordinates }); }
    text() {}
    addPage(...pageOptions) {
      this.page += 1;
      calls.push({ type: "add-page", page: this.page, pageOptions });
    }
    getNumberOfPages() { return this.page; }
    setPage(page) { this.page = page; }
  }
  const tables = [];
  const autoTable = (doc, tableOptions) => {
    tables.push({ page: doc.page, options: tableOptions });
    calls.push({ type: "table", page: doc.page, options: tableOptions });
    doc.lastAutoTable = { finalY: 60 };
  };
  const document = renderMatchPdf(report, { jsPDF: PdfProbe, autoTable });
  return { calls, document, options, tables };
}

test("cabecera local conserva plantilla, rival, sede y metadatos", () => {
  const report = buildMatchReport(finishedSample());
  assert.deepEqual(report.header, {
    rosterName: "Vóley Ciutadella",
    rival: "Peña Übeda",
    venue: "Local",
    competition: "Liga sénior",
    date: "2026-10-11",
    time: "18:30",
    homeTeam: "Vóley Ciutadella",
    awayTeam: "Peña Übeda",
    matchup: "Vóley Ciutadella vs Peña Übeda",
  });
  assert.match(report.filename, /^VolleyStats_Vóley_Ciutadella_vs_Peña_Übeda_2026-10-11\.pdf$/);
});

test("cabecera visitante respeta el orden local contra visitante", () => {
  const state = finishedSample();
  state.venue = "Visitante";
  const report = buildMatchReport(state);
  assert.equal(report.header.matchup, "Peña Übeda vs Vóley Ciutadella");
  assert.equal(report.header.homeTeam, "Peña Übeda");
  assert.equal(report.header.awayTeam, "Vóley Ciutadella");
  assert.equal(report.result.label, "0 - 1");
});

test("resultado usa exclusivamente finishedSets", () => {
  const report = buildMatchReport(finishedSample());
  assert.deepEqual(report.result, {
    ourSets: 1,
    rivalSets: 0,
    label: "1 - 0",
    finishedSets: [{ set: 1, score: [4, 3] }],
  });
});

test("General conserva la salida canónica de statistics.js", () => {
  const state = finishedSample();
  const report = buildMatchReport(state);
  assert.deepEqual(report.periods[0].statistics, statistics(state));
  const source = statistics(state).players.find((player) => player.id === 7);
  const row = report.periods[0].general.rows.find((player) => player.id === 7);
  assert.equal(row.metrics.points, source.points);
  assert.equal(row.metrics.gp, source.gp);
  assert.equal(row.metrics.attack, source.attack);
});

test("PDF conserva A4 landscape y General muestra dorsal y nombre sin rol", () => {
  const report = buildMatchReport(finishedSample());
  const rendered = renderProbe(report);
  assert.deepEqual(rendered.options, {
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  for (const { pageOptions } of rendered.calls.filter(
    ({ type }) => type === "add-page",
  )) {
    assert.deepEqual(pageOptions, ["a4", "landscape"]);
  }
  const generalTable = rendered.tables.find(
    ({ options }) => options.head?.[0]?.[0]?.content === "JUGADOR",
  ).options;
  const labels = new Map(
    generalTable.body.map(([label]) => [Number(label.match(/^#(\d+)/)?.[1]), label]),
  );
  for (const player of report.periods[0].general.rows) {
    assert.equal(labels.get(player.id), `#${player.id} ${player.name}`);
  }
});

test("General conserva grupos, métricas y separadores semánticos", () => {
  const report = buildMatchReport(finishedSample());
  const { calls, tables } = renderProbe(report);
  const generalTable = tables.find(
    ({ options }) => options.head?.[0]?.[0]?.content === "JUGADOR",
  ).options;
  assert.deepEqual(
    generalTable.head[0].slice(1).map(({ content }) => content),
    ["PUNTOS", "SAQUE", "RECEPCIÓN", "ATAQUE", "BLOQUEO"],
  );
  assert.deepEqual(generalTable.head[1], generalGroups.flatMap(({ columns }) => columns));
  assert.equal(generalTable.head[1].length, 17);
  assert.equal(generalTable.body[0].length, 18);
  assert.equal(generalTable.foot[0].length, 18);

  const linesBeforeHooks = calls.filter(({ type }) => type === "line").length;
  let columnIndex = 1;
  for (const group of generalGroups) {
    generalTable.didDrawCell({
      cell: { x: columnIndex * 10, y: 20, height: 6 },
      column: { index: columnIndex },
      section: "body",
    });
    columnIndex += group.columns.length;
  }
  for (const section of ["head", "foot"]) {
    generalTable.didDrawCell({
      cell: { x: 10, y: 20, height: 6 },
      column: { index: 1 },
      section,
    });
  }
  assert.equal(
    calls.filter(({ type }) => type === "line").length - linesBeforeHooks,
    7,
  );
});

test("K1/K2 general comienza en página nueva después de General", () => {
  const { calls } = renderProbe(buildMatchReport(finishedSample()));
  const generalIndex = calls.findIndex(
    ({ type, options }) =>
      type === "table" && options.head?.[0]?.[0]?.content === "JUGADOR",
  );
  const phaseIndex = calls.findIndex(
    ({ type, options }) => type === "table" && options.head?.[0]?.[0] === "Fase",
  );
  const pageBreaks = calls
    .slice(generalIndex + 1, phaseIndex)
    .filter(({ type }) => type === "add-page");
  assert.equal(pageBreaks.length, 1);
  assert.equal(calls[generalIndex].page + 1, calls[phaseIndex].page);
});

test("G-P mantiene puntos terminales menos pérdidas atribuibles", () => {
  const row = buildMatchReport(finishedSample()).periods[0].general.rows.find(
    (player) => player.id === 7,
  );
  assert.equal(row.metrics.points, 1);
  assert.equal(row.metrics.gp, 0);
});

test("recepción presenta Pos.% y Exc.% desde sus numeradores", () => {
  const row = buildMatchReport(finishedSample()).periods[0].general.rows.find(
    (player) => player.id === 7,
  );
  assert.equal(row.metrics.reception, 2);
  assert.equal(row.metrics.positiveReceptionPercent, "100 %");
  assert.equal(row.metrics.excellentReceptionPercent, "50 %");
});

test("ataque bloqueado suma Blq, no Err de ataque y resta en G-P", () => {
  const row = buildMatchReport(finishedSample()).periods[0].general.rows.find(
    (player) => player.id === 7,
  );
  assert.equal(row.metrics.blocked, 1);
  assert.equal(row.metrics.attackErrors, 0);
  assert.equal(row.metrics.gp, 0);
});

test("General distingue los errores de bloqueo que no penalizan G-P", () => {
  const state = run(initial(), [
    action(9, "Saque", "="),
    action(9, "Bloqueo", "="),
    action(9, "Bloqueo", "="),
    { type: "finish-match", label: "Partido finalizado" },
  ]);
  const report = buildMatchReport(state);
  const general = report.periods[0].general;
  const source = statistics(state).players.find((player) => player.id === 9);
  const row = general.rows.find((player) => player.id === 9);
  const blockGroup = general.groups.find((group) => group.label === "BLOQUEO");
  assert.deepEqual(blockGroup.columns, ["Err", "Puntos"]);
  assert.equal(source.blockErrors, 2);
  assert.equal(row.metrics.blockErrors, source.blockErrors);
  assert.equal(row.metrics.serveErrors, 1);
  assert.equal(row.metrics.attackErrors, 0);
  assert.equal(row.metrics.blocked, 0);
  assert.equal(row.metrics.points, 0);
  assert.equal(row.metrics.gp, -1);
  assert.equal(general.total.metrics.blockErrors, 2);
});

test("errores del rival proceden de los puntos registrados", () => {
  const errors = buildMatchReport(finishedSample()).periods[0].errors.rival;
  assert.equal(errors.find(({ key }) => key === "serve").count, 1);
  assert.equal(errors.find(({ key }) => key === "attack").count, 1);
});

test("errores no forzados conservan el catálogo y sus totales", () => {
  const errors = buildMatchReport(finishedSample()).periods[0].errors;
  assert.equal(errors.unforcedTotal, 2);
  assert.equal(errors.unforced.find(({ reason }) => reason === "rotation").count, 1);
  assert.equal(errors.unforced.find(({ reason }) => reason === "net").count, 1);
  assert.equal(errors.unforced.find(({ reason }) => reason === "other").count, 0);
});

test("K1 y K2 coinciden con statistics.js", () => {
  const state = finishedSample();
  const report = buildMatchReport(state);
  const expected = statistics(state).phases;
  for (const phase of report.periods[0].phases) {
    const source = expected.find(({ name }) => name === phase.name);
    assert.equal(phase.won, source.won);
    assert.equal(phase.lost, source.lost);
    assert.equal(phase.played, source.won + source.lost);
  }
});

test("report transporta las 12 rotaciones por fase canónicas en partido y sets", () => {
  const state = finishedSample();
  const report = buildMatchReport(state);
  for (const period of report.periods) {
    const canonical = statistics(state, period.key).rotationPhases;
    assert.equal(period.rotationPhases.length, 12);
    assert.deepEqual(period.rotationPhases, canonical);
    for (const rotation of period.rotations) {
      const split = period.rotationPhases.filter(
        (group) => group.name === rotation.name,
      );
      assert.equal(
        split.reduce((sum, group) => sum + group.played, 0),
        rotation.won + rotation.lost,
      );
      assert.equal(
        split.reduce((sum, group) => sum + group.won, 0),
        rotation.won,
      );
      assert.equal(
        split.reduce((sum, group) => sum + group.lost, 0),
        rotation.lost,
      );
    }
    for (const phase of period.phases) {
      const split = period.rotationPhases.filter(
        (group) => group.phase === phase.name,
      );
      assert.equal(
        split.reduce((sum, group) => sum + group.played, 0),
        phase.played,
      );
      assert.equal(split.reduce((sum, group) => sum + group.won, 0), phase.won);
      assert.equal(split.reduce((sum, group) => sum + group.lost, 0), phase.lost);
    }
  }
});

test("PDF recibe el desglose R1-K1 a R6-K2 sin recalcularlo", () => {
  const report = buildMatchReport(finishedSample());
  const { tables } = renderProbe(report);
  const rotationPhaseTable = tables.find(
    ({ options }) =>
      options.head?.[0]?.join("|") ===
      "Rotación|Fase|Puntos disputados|A favor|En contra|Balance|% ganados",
  ).options;
  assert.equal(rotationPhaseTable.body.length, 12);
  assert.deepEqual(
    rotationPhaseTable.body,
    report.periods[0].rotationPhases.map((group) => [
      group.name,
      group.phase,
      group.played,
      group.won,
      group.lost,
      group.balance,
      group.wonPercent === "—" ? "-" : group.wonPercent,
    ]),
  );
});

test("incluye R1-R6 aunque una rotación no tenga eventos", () => {
  const rotations = buildMatchReport(finishedSample()).periods[0].rotations;
  assert.deepEqual(rotations.map(({ name }) => name), ["R1", "R2", "R3", "R4", "R5", "R6"]);
  assert.equal(rotations.find(({ name }) => name === "R6").wonPercent, "—");
});

test("cada periodo de set reutiliza el filtro de statistics.js", () => {
  const state = finishedSample();
  const report = buildMatchReport(state);
  assert.deepEqual(report.periods.find(({ key }) => key === "1").statistics, statistics(state, "1"));
  assert.deepEqual(report.periods.find(({ key }) => key === "2").statistics, statistics(state, "2"));
});

test("finalización manual no inventa el set actual en finishedSets", () => {
  const report = buildMatchReport(finishedSample());
  const current = report.periods.find(({ key }) => key === "2");
  assert.equal(current.closedScore, null);
  assert.deepEqual(report.result.finishedSets, [{ set: 1, score: [4, 3] }]);
  assert.equal(report.result.finishedSets.some(({ set }) => set === 2), false);
});

test("rechaza de forma controlada estados playing y between", () => {
  const playing = initial();
  assert.throws(() => buildMatchReport(playing), /partidos finalizados/);
  playing.status = "between";
  assert.throws(() => buildMatchReport(playing), /partidos finalizados/);
});
