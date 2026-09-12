import { describe, expect, it } from "vitest";
import { forceEmailTheme } from "@/components/settings/notification-template-preview";

const emailHtml = `<!doctype html>
<html>
  <head>
    <meta name="color-scheme" content="light dark">
    <style>@media (prefers-color-scheme:dark){.email-surface{background:#111}}</style>
  </head>
  <body><main class="email-surface">Preview</main></body>
</html>`;

describe("forceEmailTheme", () => {
  it("forces dark preview styling without changing the email source", () => {
    const result = forceEmailTheme(emailHtml, "dark");

    expect(result).toContain('<body data-ogsc="true">');
    expect(emailHtml).not.toContain("data-ogsc");
  });

  it("keeps the light preview light when the host prefers dark mode", () => {
    const result = forceEmailTheme(emailHtml, "light");

    expect(result).toContain('content="light"');
    expect(result).toContain("@media (prefers-color-scheme: dark) and (max-width: 0px)");
    expect(result).not.toContain("data-ogsc");
  });
});
