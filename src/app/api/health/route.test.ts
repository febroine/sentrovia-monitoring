import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";
import { sql } from "@/lib/db";
import { getAppEncryptionSecret, getAuthSecret } from "@/lib/env";

vi.mock("@/lib/env", () => ({
  getAppEncryptionSecret: vi.fn(),
  getAuthSecret: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  sql: vi.fn(),
}));

const sqlMock = sql as unknown as ReturnType<typeof vi.fn>;

describe("container readiness route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthSecret).mockReturnValue("a".repeat(48));
    vi.mocked(getAppEncryptionSecret).mockReturnValue("b".repeat(48));
    sqlMock.mockResolvedValue([]);
  });

  it("returns ok only after secrets and the database are usable", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(sqlMock).toHaveBeenCalledOnce();
  });

  it("returns an opaque unavailable response when production configuration is invalid", async () => {
    vi.mocked(getAuthSecret).mockImplementationOnce(() => {
      throw new Error("secret details must not be returned");
    });

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("unavailable");
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("returns unavailable when the database cannot be reached", async () => {
    sqlMock.mockRejectedValueOnce(new Error("database details must not be returned"));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("unavailable");
  });
});
