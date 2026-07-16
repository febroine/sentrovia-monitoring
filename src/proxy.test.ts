import { describe, expect, it } from "vitest";
import { config } from "@/proxy";

describe("authenticated route matcher", () => {
  it("protects the system health page", () => {
    expect(config.matcher).toContain("/system-health/:path*");
  });
});
