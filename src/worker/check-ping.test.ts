import { describe, expect, it } from "vitest";
import { parsePingLatency } from "@/worker/check-ping";

describe("ping output parsing", () => {
  it("parses English ping latency", () => {
    expect(parsePingLatency("Reply from 127.0.0.1: bytes=32 time=12ms TTL=64")).toBe(12);
  });

  it("parses Turkish Windows ping latency", () => {
    expect(parsePingLatency("En az = 10ms, En çok = 20ms, Ortalama = 15ms")).toBe(15);
  });

  it("returns null when latency is unavailable", () => {
    expect(parsePingLatency("Ping command completed without latency details.")).toBeNull();
  });
});
