import { describe, expect, it } from "vitest";
import {
  hasExpectedStatusCodeOverride,
  isCustomExpectedStatusCode,
  isExpectedHttpStatusCode,
} from "@/lib/monitors/status-codes";

describe("HTTP status expectations", () => {
  it("accepts 2xx and 3xx responses by default", () => {
    expect(isExpectedHttpStatusCode(null, 200)).toBe(true);
    expect(isExpectedHttpStatusCode(null, 302)).toBe(true);
    expect(isExpectedHttpStatusCode(null, 500)).toBe(false);
  });

  it("uses the custom list instead of the default range", () => {
    expect(hasExpectedStatusCodeOverride("401, 500")).toBe(true);
    expect(isExpectedHttpStatusCode("401, 500", 500)).toBe(true);
    expect(isExpectedHttpStatusCode("401, 500", 200)).toBe(false);
    expect(isCustomExpectedStatusCode("401, 500", 401)).toBe(true);
  });
});
