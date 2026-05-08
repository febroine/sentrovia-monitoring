import PDFDocument from "pdfkit";
import type { GeneratedReport } from "@/lib/reports/types";

const PAGE_MARGIN = 48;
const TEXT_COLOR = "#0f172a";
const MUTED_COLOR = "#64748b";
const BORDER_COLOR = "#e2e8f0";
const ACCENT_COLOR = "#2563eb";

export async function buildReportPdf(report: GeneratedReport) {
  const document = new PDFDocument({
    size: "A4",
    margin: PAGE_MARGIN,
    info: {
      Title: report.title,
      Author: "Sentrovia",
      Subject: report.templateLabel,
    },
  });
  const chunks: Buffer[] = [];

  document.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  renderReport(document, report);
  document.end();

  return finished;
}

function renderReport(document: PDFKit.PDFDocument, report: GeneratedReport) {
  renderHeader(document, report);
  renderMetricGrid(document, report);
  renderListSection(document, "Recommended actions", report.recommendations);
  renderFailureSection(document, report);
  renderMonitorBreakdown(document, report);
}

function renderHeader(document: PDFKit.PDFDocument, report: GeneratedReport) {
  document
    .fillColor(ACCENT_COLOR)
    .fontSize(9)
    .text(report.templateLabel.toUpperCase(), { characterSpacing: 1.2 });
  document.moveDown(0.4);
  document.fillColor(TEXT_COLOR).fontSize(22).text(report.title, { lineGap: 3 });
  document.moveDown(0.4);
  document
    .fillColor(MUTED_COLOR)
    .fontSize(10)
    .text(`${report.workspaceName} / ${report.periodLabel} / Generated ${new Date(report.generatedAt).toLocaleString()}`);
  document.moveDown(1.2);
}

function renderMetricGrid(document: PDFKit.PDFDocument, report: GeneratedReport) {
  const metrics = [
    ["Health", `${report.summary.healthScore}/100`, report.summary.healthStatus],
    ["Uptime", `${report.summary.uptimePct.toFixed(2)}%`, `${report.summary.upChecks}/${report.summary.totalChecks} up`],
    ["P95 latency", `${report.summary.p95LatencyMs}ms`, `${report.summary.averageLatencyMs}ms avg`],
    ["Failures", String(report.summary.failureEvents), `${report.summary.impactedMonitors} impacted`],
    ["Down now", String(report.summary.currentlyDown), `${report.summary.currentlyUp} up`],
    ["Failure rate", `${report.summary.failureRatePct.toFixed(2)}%`, `${report.summary.downChecks} down checks`],
  ];
  const cardWidth = (document.page.width - PAGE_MARGIN * 2 - 16) / 3;
  const cardHeight = 58;

  metrics.forEach(([label, value, detail], index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = PAGE_MARGIN + column * (cardWidth + 8);
    const y = document.y + row * (cardHeight + 8);

    document.roundedRect(x, y, cardWidth, cardHeight, 8).strokeColor(BORDER_COLOR).stroke();
    document.fillColor(MUTED_COLOR).fontSize(8).text(label, x + 10, y + 9, { width: cardWidth - 20 });
    document.fillColor(TEXT_COLOR).fontSize(16).text(value, x + 10, y + 23, { width: cardWidth - 20 });
    document.fillColor(MUTED_COLOR).fontSize(8).text(detail, x + 10, y + 43, { width: cardWidth - 20 });
  });

  document.y += cardHeight * 2 + 22;
}

function renderListSection(document: PDFKit.PDFDocument, title: string, items: string[]) {
  renderSectionTitle(document, title);
  const safeItems = items.length > 0 ? items : ["No data in this period."];

  for (const item of safeItems) {
    ensureSpace(document, 32);
    document.fillColor(ACCENT_COLOR).fontSize(10).text("•", PAGE_MARGIN, document.y, { continued: true });
    document.fillColor(TEXT_COLOR).fontSize(10).text(` ${item}`, { width: document.page.width - PAGE_MARGIN * 2 - 10 });
    document.moveDown(0.45);
  }

  document.moveDown(0.8);
}

function renderFailureSection(document: PDFKit.PDFDocument, report: GeneratedReport) {
  renderSectionTitle(document, "Recent failure events");
  const rows = report.recentFailures.length > 0 ? report.recentFailures : [];

  if (rows.length === 0) {
    document.fillColor(MUTED_COLOR).fontSize(10).text("No failure events in this period.");
    document.moveDown(1);
    return;
  }

  for (const event of rows.slice(0, 8)) {
    ensureSpace(document, 54);
    document.fillColor(TEXT_COLOR).fontSize(10).text(event.name, { continued: true });
    document.fillColor(MUTED_COLOR).text(` / HTTP ${event.statusCode ?? "N/A"} / ${new Date(event.createdAt).toLocaleString()}`);
    document
      .fillColor(MUTED_COLOR)
      .fontSize(9)
      .text(event.rcaSummary ?? event.message ?? "No detail recorded.", { width: document.page.width - PAGE_MARGIN * 2 });
    document.moveDown(0.7);
  }
}

function renderMonitorBreakdown(document: PDFKit.PDFDocument, report: GeneratedReport) {
  renderSectionTitle(document, "Monitor breakdown");
  const rows = report.monitorBreakdown.slice(0, 24);

  if (rows.length === 0) {
    document.fillColor(MUTED_COLOR).fontSize(10).text("No monitors in this report.");
    return;
  }

  for (const monitor of rows) {
    ensureSpace(document, 44);
    document.fillColor(TEXT_COLOR).fontSize(10).text(monitor.name, { continued: true });
    document.fillColor(MUTED_COLOR).text(` / ${monitor.status.toUpperCase()} / ${monitor.uptimePct.toFixed(2)}% uptime`);
    document
      .fontSize(9)
      .text(`${monitor.url} / avg ${monitor.averageLatencyMs}ms / p95 ${monitor.p95LatencyMs}ms / failures ${monitor.failures}`);
    document.moveDown(0.55);
  }
}

function renderSectionTitle(document: PDFKit.PDFDocument, title: string) {
  ensureSpace(document, 64);
  document.moveDown(0.5);
  document.fillColor(TEXT_COLOR).fontSize(14).text(title);
  document.moveTo(PAGE_MARGIN, document.y + 4).lineTo(document.page.width - PAGE_MARGIN, document.y + 4).strokeColor(BORDER_COLOR).stroke();
  document.moveDown(0.8);
}

function ensureSpace(document: PDFKit.PDFDocument, neededHeight: number) {
  if (document.y + neededHeight <= document.page.height - PAGE_MARGIN) {
    return;
  }

  document.addPage();
}
