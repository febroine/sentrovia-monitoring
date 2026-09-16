import type { GeneratedReport } from "@/lib/reports/types";
import { buildPrintableReportHtml } from "@/lib/reports/export";
import { AuthError } from "@/lib/auth/errors";

const MAX_CONCURRENT_PDF_EXPORTS = 2;
let activePdfExports = 0;

export async function renderReportPdf(report: GeneratedReport): Promise<Buffer> {
  if (activePdfExports >= MAX_CONCURRENT_PDF_EXPORTS) {
    throw new AuthError("PDF generation is busy. Try again shortly.", 429);
  }
  activePdfExports += 1;
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true, args: ["--headless=new", "--disable-gpu"], timeout: 15_000 });
    try {
      const page = await browser.newPage({ viewport: { width: 1120, height: 900 }, colorScheme: "light" });
      await page.setContent(buildPrintableReportHtml(report, { output: "pdf" }), { waitUntil: "domcontentloaded", timeout: 15_000 });
      return await page.pdf({ format: "A4", printBackground: true, margin: { top: "12mm", right: "10mm", bottom: "12mm", left: "10mm" } });
    } finally {
      await browser.close();
    }
  } finally {
    activePdfExports -= 1;
  }
}
