import { describe, expect, it } from "vitest";
import { getSidebarItems } from "../lib/navigation";

describe("getSidebarItems", () => {
  it("matches the showroom sidebar while hiding record navigation from staff", () => {
    expect(getSidebarItems("staff").map((item) => item.id)).toEqual([
      "home",
      "fill",
      "announcement",
      "help"
    ]);

    expect(getSidebarItems("supervisor").map((item) => item.id)).toEqual([
      "home",
      "fill",
      "record",
      "announcement",
      "help"
    ]);

    expect(getSidebarItems("admin").map((item) => item.id)).toEqual([
      "home",
      "fill",
      "record",
      "announcement",
      "help"
    ]);
  });
});
