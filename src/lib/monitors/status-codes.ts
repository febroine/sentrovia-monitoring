export function isExpectedHttpStatusCode(expectedStatusCodes: string | null, statusCode: number) {
  const expected = parseExpectedStatusCodes(expectedStatusCodes);
  return expected.size > 0 ? expected.has(statusCode) : statusCode >= 200 && statusCode < 400;
}

export function hasExpectedStatusCodeOverride(expectedStatusCodes: string | null) {
  return parseExpectedStatusCodes(expectedStatusCodes).size > 0;
}

export function isCustomExpectedStatusCode(expectedStatusCodes: string | null, statusCode: number) {
  const expected = parseExpectedStatusCodes(expectedStatusCodes);
  return expected.size > 0 && expected.has(statusCode);
}

function parseExpectedStatusCodes(value: string | null) {
  return new Set(
    (value ?? "")
      .split(/[,\s;]+/)
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item) && item >= 100 && item <= 599)
  );
}
