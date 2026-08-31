import { describe, expect, it } from "vitest";
import { encryptValue } from "@/lib/security/encryption";
import { serializeMonitorRecord } from "@/lib/monitors/utils";

describe("serializeMonitorRecord", () => {
  it("omits monitor secrets when the caller cannot manage monitors", () => {
    const serialized = serializeMonitorRecord(
      {
        heartbeatToken: encryptValue("heartbeat-secret"),
        heartbeatTokenHash: "heartbeat-hash",
        telegramBotToken: encryptValue("telegram-secret"),
        databasePasswordEncrypted: encryptValue("database-secret"),
      },
      false
    );

    expect(serialized.heartbeatToken).toBeNull();
    expect(serialized.telegramBotToken).toBeNull();
    expect(serialized).not.toHaveProperty("heartbeatTokenHash");
    expect(serialized).not.toHaveProperty("databasePasswordEncrypted");
    expect(serialized.databasePasswordConfigured).toBe(true);
  });
});
