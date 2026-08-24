import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMetricsAuthToken } from "@/lib/env";
import { collectPrometheusSnapshot, isMetricsRequestAuthorized } from "@/lib/metrics/prometheus";
import { GET } from "@/app/api/metrics/route";

vi.mock("@/lib/env", () => ({ getMetricsAuthToken: vi.fn() }));
vi.mock("@/lib/metrics/prometheus", () => ({
  collectPrometheusSnapshot: vi.fn(),
  isMetricsRequestAuthorized: vi.fn(),
  renderPrometheusMetrics: vi.fn(() => "sentrovia_worker_up 1\n"),
}));

describe("metrics route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMetricsAuthToken).mockReturnValue("a".repeat(32));
    vi.mocked(isMetricsRequestAuthorized).mockReturnValue(true);
    vi.mocked(collectPrometheusSnapshot).mockResolvedValue({} as never);
  });

  it("is undiscoverable until a strong token is configured", async () => {
    vi.mocked(getMetricsAuthToken).mockReturnValue(null);
    const response = await GET(new Request("http://localhost/api/metrics"));
    expect(response.status).toBe(404);
    expect(collectPrometheusSnapshot).not.toHaveBeenCalled();
  });

  it("rejects invalid bearer credentials before querying metrics", async () => {
    vi.mocked(isMetricsRequestAuthorized).mockReturnValue(false);
    const response = await GET(new Request("http://localhost/api/metrics"));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(collectPrometheusSnapshot).not.toHaveBeenCalled();
  });

  it("returns the Prometheus text exposition format", async () => {
    const response = await GET(new Request("http://localhost/api/metrics", {
      headers: { authorization: `Bearer ${"a".repeat(32)}` },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toContain("sentrovia_worker_up");
  });
});
