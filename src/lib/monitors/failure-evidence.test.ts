import { describe, expect, it } from "vitest";
import {
  buildBodyExcerpt,
  parseFailureEvidence,
  pickRecordedHeaders,
  redactSecrets,
  redactUrl,
  summarizeFailureEvidence,
  type FailureEvidence,
} from "@/lib/monitors/failure-evidence";

describe("failure evidence", () => {
  it("keeps only headers that explain who answered", () => {
    expect(pickRecordedHeaders({
      server: "cloudflare",
      "set-cookie": ["session=secret"],
      authorization: "Bearer x",
      "cf-ray": "abc-IST",
      "x-powered-by": "PHP",
      location: "https://user:pass@example.com/next?token=t&lang=tr",
    })).toEqual({
      server: "cloudflare",
      "cf-ray": "abc-IST",
      location: "https://example.com/next?token=%5Bredacted%5D&lang=tr",
    });
  });

  it("removes credentials, the cache buster and secret parameters from URLs", () => {
    expect(redactUrl("https://admin:pw@example.com/a?_monitor_ts=1&api_key=k&page=2#frag"))
      .toBe("https://example.com/a?api_key=%5Bredacted%5D&page=2");
    expect(redactUrl("/login?session=abc&next=%2F")).toBe("/login?session=%5Bredacted%5D&next=%2F");
  });

  it("redacts secrets but keeps error details readable", () => {
    const text = redactSecrets(
      '{"error_code":"RATE_LIMITED","access_token":"tok","detail":"slow down"} password=hunter2 '
      + "Authorization: Bearer abc.def.ghi eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl "
      + "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
    );

    expect(text).toContain('"error_code":"RATE_LIMITED"');
    expect(text).toContain('"detail":"slow down"');
    expect(text).not.toMatch(/tok"|hunter2|abc\.def\.ghi|eyJhbGci|a1b2c3d4e5f6a1b2/);
  });

  it("turns an HTML error page into the text a visitor would read", () => {
    const excerpt = buildBodyExcerpt(
      "<html><head><title>x</title><script>secret()</script></head><body><h1>503</h1><p>Service&nbsp;Unavailable &#8212; retry</p></body></html>",
      "text/html"
    );

    expect(excerpt).toEqual({ contentType: "text/html", excerpt: "503\nService Unavailable — retry", truncated: false });
  });

  it("leaves binary bodies out and cuts long ones", () => {
    expect(buildBodyExcerpt("\u0000PNG", "image/png")).toBeNull();
    const long = buildBodyExcerpt("x ".repeat(3_000), "text/plain");
    expect(long?.excerpt).toHaveLength(2_000);
    expect(long?.truncated).toBe(true);
  });

  it("summarizes the evidence in one line without the body", () => {
    const evidence: FailureEvidence = {
      version: 1,
      phase: "first-byte",
      hops: [
        hop({ statusCode: 301 }),
        hop({
          remoteAddress: "2001:db8::1",
          remotePort: 443,
          timings: { dnsMs: 12, connectMs: 30, tlsMs: 45, firstByteMs: null, totalMs: null },
          headers: { server: "nginx", "cf-ray": "8a1b-IST", "content-type": "text/html" },
        }),
      ],
      certificate: null,
      body: { contentType: "text/plain", excerpt: "secret-free but long body", truncated: false },
      error: "Service did not complete within the 30s hard timeout.",
    };

    expect(summarizeFailureEvidence(evidence, "en"))
      .toBe("[2001:db8::1]:443 · DNS 12 ms · connect 30 ms · TLS 45 ms · stopped while waiting for the first byte · 1 redirect · server: nginx · cf-ray: 8a1b-IST");
    expect(summarizeFailureEvidence(evidence, "tr"))
      .toBe("[2001:db8::1]:443 · DNS 12 ms · bağlantı 30 ms · TLS 45 ms · ilk bayt beklenirken durdu · 1 yönlendirme · server: nginx · cf-ray: 8a1b-IST");
  });

  it("accepts only well-formed stored evidence", () => {
    expect(parseFailureEvidence({ version: 1, phase: "connect", hops: [] })).not.toBeNull();
    expect(parseFailureEvidence({ version: 2, phase: "connect", hops: [] })).toBeNull();
    expect(parseFailureEvidence("broken")).toBeNull();
  });
});

function hop(overrides: Partial<FailureEvidence["hops"][number]> = {}): FailureEvidence["hops"][number] {
  return {
    url: "https://example.com/",
    method: "GET",
    statusCode: null,
    remoteAddress: "203.0.113.10",
    remotePort: 443,
    reusedConnection: false,
    timings: { dnsMs: 1, connectMs: 2, tlsMs: 3, firstByteMs: 4, totalMs: 10 },
    headers: {},
    ...overrides,
  };
}
