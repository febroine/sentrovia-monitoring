import { describe, expect, it } from "vitest";
import { evaluateDnsAnswers, findInvalidDnsExpectedValue, isDnsHostname, parseDnsExpectedValues } from "@/lib/monitors/dns";

describe("parseDnsExpectedValues", () => {
  it("splits addresses and names on lines, commas and spaces", () => {
    expect(parseDnsExpectedValues("A", "1.1.1.1, 1.0.0.1\n1.1.1.1  8.8.8.8")).toEqual(["1.1.1.1", "1.0.0.1", "8.8.8.8"]);
    expect(parseDnsExpectedValues("CNAME", "Edge.CDN.example.net.")).toEqual(["edge.cdn.example.net"]);
  });

  it("keeps the priority of an MX value and the spaces of a TXT value", () => {
    expect(parseDnsExpectedValues("MX", "10  Mail.example.com., 20 backup.example.com")).toEqual(["10 mail.example.com", "20 backup.example.com"]);
    expect(parseDnsExpectedValues("TXT", "\"v=spf1 include:_spf.example.com ~all\"\ngoogle-site-verification=abc,def")).toEqual([
      "v=spf1 include:_spf.example.com ~all",
      "google-site-verification=abc,def",
    ]);
  });

  it("writes IPv6 addresses in their short form", () => {
    expect(parseDnsExpectedValues("AAAA", "2001:0DB8:0000:0000:0000:0000:0000:0001")).toEqual(["2001:db8::1"]);
  });
});

describe("findInvalidDnsExpectedValue", () => {
  it("checks each value against the record type", () => {
    expect(findInvalidDnsExpectedValue("A", ["1.1.1.1"])).toBeNull();
    expect(findInvalidDnsExpectedValue("A", ["2001:db8::1"])).toBe("2001:db8::1");
    expect(findInvalidDnsExpectedValue("AAAA", ["1.1.1.1"])).toBe("1.1.1.1");
    expect(findInvalidDnsExpectedValue("MX", ["10 mail.example.com", "mail2.example.com"])).toBeNull();
    expect(findInvalidDnsExpectedValue("MX", ["high mail.example.com"])).toBe("high mail.example.com");
    expect(findInvalidDnsExpectedValue("NS", ["not a host"])).toBe("not a host");
    expect(findInvalidDnsExpectedValue("TXT", ["anything goes"])).toBeNull();
  });
});

describe("isDnsHostname", () => {
  it("accepts names with underscores and rejects addresses and URLs", () => {
    expect(isDnsHostname("_dmarc.example.com")).toBe(true);
    expect(isDnsHostname("example.com.")).toBe(true);
    expect(isDnsHostname("1.1.1.1")).toBe(false);
    expect(isDnsHostname("https://example.com")).toBe(false);
    expect(isDnsHostname("-bad.example.com")).toBe(false);
  });
});

describe("evaluateDnsAnswers", () => {
  it("passes any record when no value is expected", () => {
    expect(evaluateDnsAnswers("A", "example.com", ["1.2.3.4"], [], "includes")).toEqual({ ok: true });
    expect(evaluateDnsAnswers("A", "example.com", [], [], "includes").ok).toBe(false);
  });

  it("requires every expected value with includes", () => {
    expect(evaluateDnsAnswers("A", "example.com", ["1.2.3.4", "5.6.7.8"], ["1.2.3.4"], "includes")).toEqual({ ok: true });
    expect(evaluateDnsAnswers("A", "example.com", ["1.2.3.4"], ["1.2.3.4", "9.9.9.9"], "includes")).toEqual({
      ok: false,
      message: "A records for example.com do not include 9.9.9.9. Found: 1.2.3.4.",
    });
  });

  it("reports added records with exact", () => {
    expect(evaluateDnsAnswers("A", "example.com", ["1.2.3.4", "5.6.7.8"], ["1.2.3.4"], "exact")).toEqual({
      ok: false,
      message: "A records for example.com include unexpected 5.6.7.8. Found: 1.2.3.4, 5.6.7.8.",
    });
    expect(evaluateDnsAnswers("A", "example.com", ["1.2.3.4", "5.6.7.8"], ["5.6.7.8", "1.2.3.4"], "exact")).toEqual({ ok: true });
  });

  it("matches an MX host at any priority when no priority is given", () => {
    expect(evaluateDnsAnswers("MX", "example.com", ["10 mail.example.com"], ["mail.example.com"], "exact")).toEqual({ ok: true });
    expect(evaluateDnsAnswers("MX", "example.com", ["10 mail.example.com"], ["20 mail.example.com"], "includes").ok).toBe(false);
  });

  it("finds a TXT value inside a longer record with includes, but not with exact", () => {
    const answers = ["v=spf1 include:_spf.example.com ~all"];
    expect(evaluateDnsAnswers("TXT", "example.com", answers, ["include:_spf.example.com"], "includes")).toEqual({ ok: true });
    expect(evaluateDnsAnswers("TXT", "example.com", answers, ["include:_spf.example.com"], "exact").ok).toBe(false);
  });
});
