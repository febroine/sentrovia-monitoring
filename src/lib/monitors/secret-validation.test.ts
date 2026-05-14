import { describe, expect, it } from "vitest";
import { monitorInputSchema } from "@/lib/monitors/schemas";
import { assertRestorablePostgresMonitorPasswords } from "@/lib/monitors/secret-validation";
import { DEFAULT_MONITOR_FORM } from "@/lib/monitors/types";

describe("monitor secret validation", () => {
  it("rejects exported PostgreSQL monitors with missing passwords", () => {
    const monitor = monitorInputSchema.parse({
      ...DEFAULT_MONITOR_FORM,
      name: "Main database",
      monitorType: "postgres",
      databaseHost: "db.example.com",
      databaseName: "app",
      databaseUsername: "monitor",
      databasePassword: "",
      databasePasswordConfigured: true,
    });

    expect(() => assertRestorablePostgresMonitorPasswords([monitor])).toThrow(
      "PostgreSQL monitor passwords are not included"
    );
  });
});
