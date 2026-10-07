import { buildMatchReport } from "./report.js";

export const PDF_COLORS = {
  primary: [3, 110, 237],
  primaryDark: [4, 31, 77],
  secondary: [4, 53, 139],
  accent: [52, 166, 243],
  soft: [234, 244, 255],
  pale: [247, 251, 255],
  border: [203, 220, 240],
  text: [23, 43, 70],
  muted: [96, 114, 138],
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
          "../vendor/jspdf.umd.min.js",
          import.meta.url,
        ).href,
      );
      await loadScript(
        new URL(
          "../vendor/jspdf.plugin.autotable.min.js",
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

async function loadPdfLogo() {
  try {
    const response = await fetch(
      new URL("./assets/pdf-logo.png", import.meta.url),
      { cache: "no-store" },
    );
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(reader.result), {
        once: true,
      });
      reader.addEventListener("error", () => resolve(null), { once: true });
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
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
    metrics.individualErrors,
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
  const { jsPDF, autoTable, logoData = null } = dependencies;
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
    doc.setTextColor(...PDF_COLORS.primaryDark);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(title, margin, y);
    y += 5;
    if (subtitle) {
      doc.setTextColor(...PDF_COLORS.muted);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(subtitle, margin, y);
      y += 5;
    }
  };
  const table = (options) => {
    const {
      styles = {},
      headStyles = {},
      alternateRowStyles = {},
      ...tableOptions
    } = options;
    autoTable(doc, {
      startY: y,
      margin: { top: 16, right: margin, bottom: 14, left: margin },
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 7.2,
        cellPadding: 1.8,
        textColor: PDF_COLORS.text,
        lineColor: PDF_COLORS.border,
        lineWidth: 0.15,
        valign: "middle",
        ...styles,
      },
      headStyles: {
        fillColor: PDF_COLORS.primaryDark,
        textColor: PDF_COLORS.white,
        fontStyle: "bold",
        halign: "center",
        ...headStyles,
      },
      alternateRowStyles: {
        fillColor: PDF_COLORS.pale,
        ...alternateRowStyles,
      },
      ...tableOptions,
    });
    y = doc.lastAutoTable.finalY + 7;
  };
  const drawGeneral = (period) => {
    sectionTitle("General");
    let nextGroupColumn = 1;
    const groupStartColumns = new Set(
      period.general.groups.map((group) => {
        const start = nextGroupColumn;
        nextGroupColumn += group.columns.length;
        return start;
      }),
    );
    const groupHead = [
      { content: "JUGADOR", rowSpan: 2, styles: { halign: "left" } },
      ...period.general.groups.map((group) => ({
        content: group.label,
        colSpan: group.columns.length,
      })),
    ];
    const columnHead = period.general.groups.flatMap((group) => group.columns);
    const body = [...period.general.rows]
      .sort((left, right) => Number(left.id) - Number(right.id))
      .map((player) => [
        `#${player.id} ${player.name}`,
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
      headStyles: {
        fillColor: PDF_COLORS.primaryDark,
        textColor: PDF_COLORS.white,
      },
      footStyles: {
        fillColor: PDF_COLORS.soft,
        textColor: PDF_COLORS.text,
        fontStyle: "bold",
      },
      columnStyles: { 0: { halign: "left", cellWidth: 34 } },
      didDrawCell: ({ cell, column, section }) => {
        if (!groupStartColumns.has(column.index)) return;
        doc.setDrawColor(
          ...(section === "head" ? PDF_COLORS.white : PDF_COLORS.secondary),
        );
        doc.setLineWidth(section === "head" ? 0.6 : 0.45);
        doc.line(cell.x, cell.y, cell.x, cell.y + cell.height);
      },
    });
  };
  const drawPhaseAndRotation = (period, startOnNewPage = false) => {
    if (startOnNewPage) addPage();
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

    sectionTitle("Rotaciones por fase K1 / K2");
    table({
      head: [[
        "Rotación",
        "Fase",
        "Puntos disputados",
        "A favor",
        "En contra",
        "Balance",
        "% ganados",
      ]],
      body: period.rotationPhases.map((group) => [
        group.name,
        group.phase,
        group.played,
        group.won,
        group.lost,
        group.balance,
        group.wonPercent === "—" ? "-" : group.wonPercent,
      ]),
      columnStyles: {
        0: { fontStyle: "bold", halign: "center" },
        1: { fontStyle: "bold", halign: "center" },
      },
      didParseCell: ({ cell, row, section }) => {
        if (section !== "body") return;
        cell.styles.fillColor =
          Math.floor(row.index / 2) % 2 === 0
            ? PDF_COLORS.pale
            : PDF_COLORS.white;
      },
      didDrawCell: ({ cell, row, section }) => {
        if (section !== "body" || row.index === 0 || row.index % 2 !== 0)
          return;
        doc.setDrawColor(...PDF_COLORS.secondary);
        doc.setLineWidth(0.35);
        doc.line(cell.x, cell.y, cell.x + cell.width, cell.y);
      },
    });
  };
  const drawOwnErrorsSummary = (period) => {
    const metrics = period.general.total.metrics;
    const rivalServeErrors =
      period.errors.rival.find(({ key }) => key === "serve")?.count || 0;
    const rivalAttackErrors =
      period.errors.rival.find(({ key }) => key === "attack")?.count || 0;
    const ourTotal =
      metrics.serveErrors + metrics.attackErrors + metrics.receptionErrors;
    const rivalTotal = rivalServeErrors + rivalAttackErrors + metrics.aces;
    const summaryColumnWidth = (pageWidth - margin * 2) / 2;
    table({
      head: [[
        `Errores ${report.header.rosterName}: ${ourTotal}`,
        `Errores ${report.header.rival}: ${rivalTotal}`,
      ]],
      body: [[
        `Saques ${metrics.serveErrors} · Ataques ${metrics.attackErrors} · Recepciones ${metrics.receptionErrors}`,
        `Saques ${rivalServeErrors} · Ataques ${rivalAttackErrors} · Recepciones ${metrics.aces}`,
      ]],
      styles: { fontSize: 9, cellPadding: 2, halign: "center" },
      headStyles: {
        fillColor: PDF_COLORS.primaryDark,
        textColor: PDF_COLORS.white,
        fontStyle: "bold",
        overflow: "ellipsize",
      },
      bodyStyles: {
        fillColor: PDF_COLORS.soft,
        textColor: PDF_COLORS.text,
        fontStyle: "bold",
        fontSize: 12,
      },
      columnStyles: {
        0: { cellWidth: summaryColumnWidth },
        1: { cellWidth: summaryColumnWidth },
      },
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
        fillColor: PDF_COLORS.soft,
        textColor: PDF_COLORS.text,
        fontStyle: "bold",
      },
      columnStyles: { 2: { halign: "center", cellWidth: 25 } },
    });
  };

  const logoWidth = 20;
  const logoHeight = (logoWidth * 941) / 1109;
  if (logoData) {
    doc.addImage(logoData, "PNG", margin, 13.5, logoWidth, logoHeight);
  }
  const headerTextX = logoData ? margin + logoWidth + 4 : margin;
  doc.setTextColor(...PDF_COLORS.primary);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("INFORME DE ESTADÍSTICAS", headerTextX, 16.5);
  doc.setTextColor(...PDF_COLORS.text);
  doc.setFontSize(14);
  doc.text(report.header.matchup, headerTextX, 23);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const details = [
    report.header.competition || "Sin competición",
    report.header.venue || "Sede no indicada",
    formatDate(report.header.date),
    report.header.time ? `${report.header.time} h` : "Hora no indicada",
  ];
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text(details.join("  ·  "), headerTextX, 29);
  y = 35;

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
    if (index === 0) drawOwnErrorsSummary(period);
    drawPhaseAndRotation(period, index === 0);
    drawErrors(period);
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    if (page > 1) {
      doc.setDrawColor(...PDF_COLORS.border);
      doc.setLineWidth(0.2);
      doc.line(margin, 11, pageWidth - margin, 11);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...PDF_COLORS.muted);
      doc.text(report.header.matchup, pageWidth / 2, 8, { align: "center" });
    }
    doc.text(`Página ${page}`, pageWidth - margin, pageHeight - 7, {
      align: "right",
    });
  }

  return doc;
}

export async function generateMatchPdf(match, options = {}) {
  const report = buildMatchReport(match, options);
  const [dependencies, logoData] = await Promise.all([
    loadPdfDependencies(),
    loadPdfLogo(),
  ]);
  const document = renderMatchPdf(report, { ...dependencies, logoData });
  document.save(report.filename);
  return report;
}
