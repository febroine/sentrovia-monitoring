import { describe, expect, it } from "vitest";
import { filterSelfMemberIds } from "@/lib/members/service";

describe("member deletion scope", () => {
  it("keeps deletion limited to the current user", () => {
    expect(filterSelfMemberIds("user-1", ["user-2", "user-1", "user-1"])).toEqual(["user-1"]);
  });

  it("returns no deletable ids when the current user is not selected", () => {
    expect(filterSelfMemberIds("user-1", ["user-2", "user-3"])).toEqual([]);
  });
});
