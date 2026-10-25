import { describe, expect, it } from "vitest";
import { getShowroomGridTemplate } from "../lib/showroom-layout";

describe("getShowroomGridTemplate", () => {
  it("gives the desktop showroom most of the width to the functional panel", () => {
    expect(getShowroomGridTemplate("desktop")).toBe(
      "11% minmax(0,72%) minmax(0,17%)"
    );
  });

  it("collapses to one column on mobile", () => {
    expect(getShowroomGridTemplate("mobile")).toBe("1fr");
  });
});
