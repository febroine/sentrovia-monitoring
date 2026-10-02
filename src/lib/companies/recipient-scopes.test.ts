import { describe, expect, it } from "vitest";
import {
  companyRecipientsForMonitor,
  normalizeRecipientScopes,
  parseRecipientAddresses,
  removeMonitorsFromScopes,
} from "@/lib/companies/recipient-scopes";

const recipients = ["ops@abc.test", "manager@abc.test"];

describe("company recipient scopes", () => {
  it("sends every monitor's alerts to an address without a limit", () => {
    expect(companyRecipientsForMonitor(recipients, {}, "monitor-1")).toEqual(recipients);
  });

  it("sends a limited address only the alerts of its selected monitors", () => {
    const scopes = { "manager@abc.test": ["monitor-2"] };

    expect(companyRecipientsForMonitor(recipients, scopes, "monitor-1")).toEqual(["ops@abc.test"]);
    expect(companyRecipientsForMonitor(recipients, scopes, "monitor-2")).toEqual(recipients);
  });

  it("gives a monitor being created only the addresses that cover every monitor", () => {
    expect(companyRecipientsForMonitor(recipients, { "manager@abc.test": ["monitor-2"] }, null)).toEqual(["ops@abc.test"]);
  });

  it("treats an empty selection as no monitors", () => {
    expect(companyRecipientsForMonitor(recipients, { "ops@abc.test": [] }, "monitor-1")).toEqual(["manager@abc.test"]);
  });

  it("keeps limits only for current addresses, matched case-insensitively", () => {
    expect(normalizeRecipientScopes(
      { "MANAGER@abc.test": ["m1", "m1", 3], "removed@abc.test": ["m2"], "ops@abc.test": "bad" },
      recipients
    )).toEqual({ "manager@abc.test": ["m1"] });
    expect(normalizeRecipientScopes(null, recipients)).toEqual({});
  });

  it("removes monitors that left the company and reports whether anything changed", () => {
    expect(removeMonitorsFromScopes({ "a@x.test": ["m1", "m2"], "b@x.test": ["m3"] }, new Set(["m2"]))).toEqual({
      scopes: { "a@x.test": ["m1"], "b@x.test": ["m3"] },
      changed: true,
    });
    expect(removeMonitorsFromScopes({ "a@x.test": ["m1"] }, new Set(["m9"])).changed).toBe(false);
  });

  it("parses addresses the way the company form saves them", () => {
    expect(parseRecipientAddresses(" Ops@abc.test; manager@abc.test\nops@abc.test ,")).toEqual(recipients);
  });
});
