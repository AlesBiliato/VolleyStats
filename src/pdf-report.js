import { buildMatchReport } from "./report.js";

const COLORS = {
  ink: [31, 49, 43],
  green: [11, 83, 67],
  greenSoft: [230, 238, 232],
  greenPale: [246, 249, 246],
  line: [202, 216, 207],
  muted: [101, 119, 110],
  white: [255, 255, 255],
};

let dependencyPromise;

function loadScript(source) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-pdf-source="${source}"]`);
    if (existing?.dataset.loaded === "true") return resolve();
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = source;
    script.dataset.pdfSource = source;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true },
    );
    script.addEventListener("error", reject, { once: true });
    document.head.append(script);
  });
}

async function loadPdfDependencies() {
  if (!dependencyPromise) {
    dependencyPromise = (async () => {
      await loadScript(
        new URL(
          "../node_modules/jspdf/dist/jspdf.umd.min.js",
          import.meta.url,
        ).href,
      );
      await loadScript(
        new URL(
          "../node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.min.js",
          import.meta.url,
        ).href,
      );
      const jsPDF = globalThis.jspdf?.jsPDF;
      const autoTable = globalThis.autoTable;
      if (!jsPDF || !autoTable) throw Error("No se pudieron cargar las librerías PDF.");
      return { jsPDF, autoTable };
    })().catch((error) => {
      dependencyPromise = null;
      throw error;
    });
  }
  return dependencyPromise;
}

function formatDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || "Sin fecha";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function generalValues(metrics) {
  return [
    metrics.points,
    metrics.breakPoints,
    metrics.gp,
    metrics.serve,
    metrics.serveErrors,
    metrics.aces,
    metrics.reception,
    metrics.receptionErrors,
    metrics.positiveReceptionPercent,
    metrics.excellentReceptionPercent,
    metrics.attack,
    metrics.attackErrors,
    metrics.blocked,
    metrics.kills,
    metrics.attackEfficiency,
    metrics.blockErrors,
    metrics.blockPoints,
  ].map((value) => (value === "—" ? "-" : value));
}

export function renderMatchPdf(report, dependencies) {
  const { jsPDF, autoTable } = dependencies;
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  doc.setProperties({
    title: `VolleyStats - ${report.header.matchup}`,
    subject: "Informe estadístico del partido",
    author: "VolleyStats",
  });
  doc.setLanguage?.("es-ES");

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentBottom = pageHeight - 13;
  let y = 17;

  const addPage = () => {
    doc.addPage("a4", "landscape");
    y = 17;
  };
  const ensureSpace = (height) => {
    if (y + height > contentBottom) addPage();
  };
  const sectionTitle = (title, subtitle = "") => {
    ensureSpace(subtitle ? 17 : 12);
    doc.setTextColor(...COLORS.green);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(title, margin, y);
    y += 5;
    if (subtitle) {
      doc.setTextColor(...COLORS.muted);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(subtitle, margin, y);
      y += 5;
    }
  };
  const table = (options) => {
    autoTable(doc, {
      startY: y,
      margin: { top: 16, right: margin, bottom: 14, left: margin },
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 7.2,
        cellPadding: 1.8,
        textColor: COLORS.ink,
        lineColor: COLORS.line,
        lineWidth: 0.15,
        valign: "middle",
      },
      headStyles: {
        fillColor: COLORS.green,
        textColor: COLORS.white,
        fontStyle: "bold",
        halign: "center",
      },
      alternateRowStyles: { fillColor: COLORS.greenPale },
      ...options,
    });
    y = doc.lastAutoTable.finalY + 7;
  };
  const drawGeneral = (period) => {
    sectionTitle("General");
    const groupHead = [
      { content: "JUGADOR", rowSpan: 2, styles: { halign: "left" } },
      ...period.general.groups.map((group) => ({
        content: group.label,
        colSpan: group.columns.length,
      })),
    ];
    const columnHead = period.general.groups.flatMap((group) => group.columns);
    const body = period.general.rows.map((player) => [
      `#${player.id} ${player.name} · ${player.role}`,
      ...generalValues(player.metrics),
    ]);
    const foot = [[
      period.general.total.label,
      ...generalValues(period.general.total.metrics),
    ]];

    table({
      head: [groupHead, columnHead],
      body,
      foot,
      showHead: "everyPage",
      showFoot: "lastPage",
      styles: { fontSize: 6.6, cellPadding: 1.45, halign: "center" },
      headStyles: { fillColor: COLORS.green, textColor: COLORS.white },
      footStyles: {
        fillColor: COLORS.greenSoft,
        textColor: COLORS.ink,
        fontStyle: "bold",
      },
      columnStyles: { 0: { halign: "left", cellWidth: 34 } },
    });
  };
  const drawPhaseAndRotation = (period) => {
    sectionTitle("K1 / K2");
    table({
      head: [["Fase", "Contexto", "Puntos disputados", "A favor", "En contra", "% ganados"]],
      body: period.phases.map((phase) => [
        phase.name,
        phase.title,
        phase.played,
        phase.won,
        phase.lost,
        phase.wonPercent === "—" ? "-" : phase.wonPercent,
      ]),
      columnStyles: { 0: { fontStyle: "bold", halign: "center" } },
    });

    sectionTitle("Rotaciones R1 - R6");
    table({
      head: [["Rotación", "A favor", "En contra", "Balance", "% ganados"]],
      body: period.rotations.map((rotation) => [
        rotation.name,
        rotation.won,
        rotation.lost,
        rotation.balance,
        rotation.wonPercent === "—" ? "-" : rotation.wonPercent,
      ]),
      columnStyles: { 0: { fontStyle: "bold", halign: "center" } },
    });
  };
  const drawErrors = (period) => {
    sectionTitle("Errores");
    table({
      head: [["Origen", "Concepto", "Total"]],
      body: [
        ...period.errors.rival.map((item) => ["Rival", item.label, item.count]),
        ...period.errors.unforced.map((item) => [
          "Nuestros no forzados",
          item.label,
          item.count,
        ]),
      ],
      foot: [["", "Total nuestros no forzados", period.errors.unforcedTotal]],
      footStyles: {
        fillColor: COLORS.greenSoft,
        textColor: COLORS.ink,
        fontStyle: "bold",
      },
      columnStyles: { 2: { halign: "center", cellWidth: 25 } },
    });
  };

  doc.setTextColor(...COLORS.green);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("INFORME DE PARTIDO", margin, y);
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);
  doc.text("VOLLEYSTATS", pageWidth - margin, y, { align: "right" });
  y += 10;
  doc.setTextColor(...COLORS.ink);
  doc.setFontSize(17);
  doc.text(report.header.matchup, margin, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const details = [
    report.header.competition || "Sin competición",
    report.header.venue || "Sede no indicada",
    formatDate(report.header.date),
    report.header.time ? `${report.header.time} h` : "Hora no indicada",
  ];
  doc.setTextColor(...COLORS.muted);
  doc.text(details.join("  ·  "), margin, y);
  y += 10;

  table({
    head: [["RESULTADO FINAL", "SETS FINALIZADOS"]],
    body: [[
      report.result.label,
      report.result.finishedSets.length
        ? report.result.finishedSets
            .map((set) => {
              const score =
                report.header.venue === "Visitante"
                  ? [...set.score].reverse()
                  : set.score;
              return `Set ${set.set}: ${score[0]}-${score[1]}`;
            })
            .join("  ·  ")
        : "Ningún set cerrado",
    ]],
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: "bold", halign: "center", cellWidth: 52 } },
  });

  report.periods.forEach((period, index) => {
    if (index > 0) addPage();
    const setScore =
      period.closedScore && report.header.venue === "Visitante"
        ? [...period.closedScore].reverse()
        : period.closedScore;
    const subtitle = period.setNumber
      ? setScore
        ? `Resultado: ${setScore[0]}-${setScore[1]}`
        : "Set registrado sin cierre - no forma parte del resultado final"
      : "Estadísticas agregadas de todos los registros del encuentro";
    sectionTitle(period.label, subtitle);
    drawGeneral(period);
    drawPhaseAndRotation(period);
    drawErrors(period);
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor(...COLORS.line);
    doc.setLineWidth(0.2);
    doc.line(margin, 11, pageWidth - margin, 11);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.green);
    doc.text("VolleyStats", margin, 8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.muted);
    doc.text(report.header.matchup, pageWidth / 2, 8, { align: "center" });
    doc.text(`Página ${page}`, pageWidth - margin, pageHeight - 7, {
      align: "right",
    });
  }

  return doc;
}

export async function generateMatchPdf(match, options = {}) {
  const report = buildMatchReport(match, options);
  const dependencies = await loadPdfDependencies();
  const document = renderMatchPdf(report, dependencies);
  document.save(report.filename);
  return report;
}
