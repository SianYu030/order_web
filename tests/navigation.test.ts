import { describe, expect, it } from "vitest";
import { getSidebarItems } from "../lib/navigation";

describe("getSidebarItems", () => {
  it("shows record navigation only to roles that can view records", () => {
    expect(getSidebarItems("staff").map((item) => item.id)).toEqual([
      "home",
      "fill"
    ]);

    expect(getSidebarItems("supervisor").map((item) => item.id)).toEqual([
      "home",
      "fill",
      "record"
    ]);

    expect(getSidebarItems("admin").map((item) => item.id)).toEqual([
      "home",
      "fill",
      "record"
    ]);
  });
});
