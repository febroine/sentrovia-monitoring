const CSV_DELIMITERS = [",", ";", "\t"] as const;

const STRING_FIELDS = [
  "name",
  "monitorType",
  "url",
  "portHost",
  "databaseHost",
  "databaseName",
  "databaseUsername",
  "databasePassword",
  "heartbeatToken",
  "keywordQuery",
  "jsonPath",
  "jsonExpectedValue",
  "jsonMatchMode",
  "companyId",
  "company",
  "notificationPref",
  "notificationLanguage",
  "notifEmail",
  "telegramBotToken",
  "telegramChatId",
  "intervalUnit",
  "expectedStatusCodes",
  "method",
  "ipFamily",
  "telegramTemplate",
  "emailSubject",
  "emailHeadline",
  "emailBody",
  "slowResponseEmailSubject",
  "slowResponseEmailHeadline",
  "slowResponseEmailBody",
  "slowResponseTelegramTemplate",
  "recoveryEmailSubject",
  "recoveryEmailHeadline",
  "recoveryEmailBody",
  "recoveryTelegramTemplate",
  "prolongedDowntimeEmailSubject",
  "prolongedDowntimeEmailHeadline",
  "prolongedDowntimeEmailBody",
  "prolongedDowntimeTelegramTemplate",
  "sslExpiryEmailSubject",
  "sslExpiryEmailHeadline",
  "sslExpiryEmailBody",
  "sslExpiryTelegramTemplate",
] as const;

const BOOLEAN_FIELDS = [
  "databasePasswordConfigured",
  "databaseSsl",
  "databaseTlsVerify",
  "keywordInvert",
  "slowResponseAlertsEnabled",
  "checkSslExpiry",
  "ignoreSslErrors",
  "cacheBuster",
  "saveErrorPages",
  "saveSuccessPages",
  "sendOutageScreenshot",
  "isActive",
  "publishOnStatusPage",
] as const;

const NUMBER_FIELDS = [
  "portNumber",
  "databasePort",
  "intervalValue",
  "timeout",
  "retries",
  "maxRedirects",
  "responseMaxLength",
] as const;

const NULLABLE_NUMBER_FIELDS = ["slowResponseThresholdMs", "renotifyCount"] as const;

export function parseMonitorCsv(input: string) {
  const normalizedInput = input.replace(/^\uFEFF/, "");
  const delimiter = detectCsvDelimiter(normalizedInput);
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < normalizedInput.length; index += 1) {
    const char = normalizedInput[index];
    const next = normalizedInput[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (inQuotes) {
    throw new Error("CSV contains an unclosed quoted field.");
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  return rows;
}

export function toMonitorImportRecord(
  headers: string[],
  row: string[],
  mapping: Map<string, string>
) {
  const values = new Map(
    headers.map((header, index) => [normalizeHeader(header), row[index] ?? ""])
  );
  const record: Record<string, unknown> = {};
  const read = (target: string) => {
    const value = values.get(normalizeHeader(mapping.get(target) ?? target)) ?? "";
    return target === "databasePassword" ? value : value.trim();
  };

  for (const field of STRING_FIELDS) {
    const value = read(field);
    if (value.length > 0) {
      record[field] = field === "monitorType" ? value.toLowerCase() : value;
    }
  }

  for (const field of BOOLEAN_FIELDS) {
    const value = read(field);
    if (value.length > 0) {
      record[field] = parseBoolean(value);
    }
  }

  for (const field of NUMBER_FIELDS) {
    const value = read(field);
    if (value.length > 0) {
      record[field] = parseNumber(value);
    }
  }

  for (const field of NULLABLE_NUMBER_FIELDS) {
    const value = read(field);
    if (value.length > 0) {
      record[field] = parseNumber(value);
    }
  }

  const tags = read("tags");
  if (tags.length > 0) {
    record.tags = tags.split("|").map((tag) => tag.trim()).filter(Boolean);
  }

  const legacyScreenshotValue = read("sendIncidentScreenshot");
  if (record.sendOutageScreenshot === undefined && legacyScreenshotValue.length > 0) {
    record.sendOutageScreenshot = parseBoolean(legacyScreenshotValue);
  }

  return record;
}

export function replaceMonitorCsvCell(rows: string[][], lineNumber: number, columnIndex: number, value: string) {
  const rowIndex = lineNumber - 1;
  if (rowIndex < 1 || rowIndex >= rows.length || columnIndex < 0) return rows;
  return rows.map((row, index) => {
    if (index !== rowIndex) return row;
    const width = Math.max(rows[0]?.length ?? 0, row.length, columnIndex + 1);
    const next = Array.from({ length: width }, (_, cellIndex) => row[cellIndex] ?? "");
    next[columnIndex] = value;
    return next;
  });
}

function detectCsvDelimiter(input: string) {
  const counts = new Map<(typeof CSV_DELIMITERS)[number], number>(
    CSV_DELIMITERS.map((delimiter) => [delimiter, 0])
  );
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && (char === "\n" || char === "\r")) {
      break;
    }
    if (!inQuotes && CSV_DELIMITERS.includes(char as (typeof CSV_DELIMITERS)[number])) {
      const delimiter = char as (typeof CSV_DELIMITERS)[number];
      counts.set(delimiter, (counts.get(delimiter) ?? 0) + 1);
    }
  }

  return CSV_DELIMITERS.reduce((best, candidate) =>
    (counts.get(candidate) ?? 0) > (counts.get(best) ?? 0) ? candidate : best
  , ",");
}

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase();
}

function parseBoolean(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return value;
}

function parseNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}
