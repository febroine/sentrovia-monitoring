import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

import { buttonVariants } from "./button";

describe("buttonVariants", () => {
  it.each(["default", "xs", "sm", "lg", "icon", "icon-xs", "icon-sm", "icon-lg"] as const)(
    "keeps %s button content optically centered",
    (size) => {
      const className = buttonVariants({ size });

      expect(className).toContain("items-center");
      expect(className).toContain("justify-center");
      expect(className).toContain("pb-px");
      expect(className).toContain("leading-none");
      expect(className).toContain("[&_svg]:block");
    }
  );

  it("lets an explicit padding override opt out of the shared optical correction", () => {
    expect(cn(buttonVariants({ className: "p-0" }))).not.toContain("pb-px");
  });
});
