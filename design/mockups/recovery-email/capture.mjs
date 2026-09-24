import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const directory = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ headless: true });

try {
  for (const [name, width, height] of [["desktop", 760, 600], ["mobile", 390, 720]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: "dark" });
    await page.goto(pathToFileURL(join(directory, "recovery-dark.html")).href);
    await page.screenshot({ path: join(directory, `${name}-dark.png`), fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    const actionHref = await page.locator("a").first().getAttribute("href");
    console.log(`${name}: horizontal overflow ${overflow}px; action ${actionHref}`);
    await page.close();
  }
} finally {
  await browser.close();
}
