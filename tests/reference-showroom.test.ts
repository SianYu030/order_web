import { describe, expect, it } from "vitest";
import { getReferenceSlot } from "../lib/reference-showroom";

describe("getReferenceSlot", () => {
  it("maps the eight desktop showroom functions to the reference card slots", () => {
    expect(getReferenceSlot("每日板材領用（裁板機）")).toBe(0);
    expect(getReferenceSlot("每日板材領用（Nesting）")).toBe(1);
    expect(getReferenceSlot("系統櫃線上報修")).toBe(2);
    expect(getReferenceSlot("廠內廢料紀錄")).toBe(3);
    expect(getReferenceSlot("每日首件紀錄")).toBe(4);
    expect(getReferenceSlot("不良品重工")).toBe(5);
    expect(getReferenceSlot("現場五金領料")).toBe(6);
    expect(getReferenceSlot("每日封邊條領用")).toBe(7);
  });
});
