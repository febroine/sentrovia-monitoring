import { describe, expect, it } from "vitest";
import { parseLogPresetFilters } from "@/lib/logs/preset-service";

const validFilters = {
  search: "timeout",
  level: "error",
  companyQuery: "",
  monitorQuery: "api",
  from: "2026-07-01",
  to: "2026-07-16",
  statusCode: "500",
};

describe("log preset service", () => {
  it("parses a valid stored filter payload", () => {
    expect(parseLogPresetFilters(JSON.stringify(validFilters))).toEqual(validFilters);
  });

  it("isolates malformed JSON instead of crashing the preset list", () => {
    expect(parseLogPresetFilters("{not-json")).toBeNull();
  });

  it("rejects stored payloads with missing or invalid filter fields", () => {
    expect(parseLogPresetFilters(JSON.stringify({ ...validFilters, search: null }))).toBeNull();
    expect(parseLogPresetFilters(JSON.stringify({ search: "incomplete" }))).toBeNull();
  });
});
