export type TextImportProtocol = "https" | "http";

export type TextImportTarget = {
  name: string;
  url: string;
  lineNumber: number;
};

export function parseMonitorText(input: string, defaultProtocol: TextImportProtocol) {
  const targets: TextImportTarget[] = [];
  const seenUrls = new Set<string>();
  const lines = input.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      return;
    }

    const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(line)
      ? line
      : `${defaultProtocol}://${line.replace(/^\/\//, "")}`;

    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      throw new Error(`Line ${index + 1}: Enter a valid domain or HTTP(S) URL.`);
    }

    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname) {
      throw new Error(`Line ${index + 1}: Only HTTP and HTTPS domains are supported.`);
    }

    if (parsed.username || parsed.password) {
      throw new Error(`Line ${index + 1}: URLs with embedded credentials are not supported.`);
    }

    parsed.hash = "";

    const url = parsed.toString();
    if (seenUrls.has(url)) {
      return;
    }

    seenUrls.add(url);
    const hostname = parsed.hostname.replace(/^www\./i, "");
    const port = parsed.port ? `:${parsed.port}` : "";
    const pathname = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
    targets.push({
      name: `${hostname}${port}${pathname}`.slice(0, 120),
      url,
      lineNumber: index + 1,
    });
  });

  return targets;
}

export function parseTextImportTags(input: string) {
  return Array.from(
    new Set(
      input
        .split(/[,;\n]/)
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );
}
