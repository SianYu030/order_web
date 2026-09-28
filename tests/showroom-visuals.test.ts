import { describe, expect, it } from "vitest";
import { getShowroomVisualKey } from "../lib/showroom-visuals";

describe("getShowroomVisualKey", () => {
  it("maps each main operation to the intended showroom object", () => {
    expect(getShowroomVisualKey("每日板材領用（裁板機）")).toBe("board-stack");
    expect(getShowroomVisualKey("每日板材領用（Nesting）")).toBe("nesting-stack");
    expect(getShowroomVisualKey("系統櫃線上報修")).toBe("tools");
    expect(getShowroomVisualKey("廠內廢料紀錄")).toBe("waste-bin");
    expect(getShowroomVisualKey("每日首件紀錄")).toBe("clipboard");
    expect(getShowroomVisualKey("不良品重工")).toBe("warning");
    expect(getShowroomVisualKey("現場五金領料")).toBe("hardware");
    expect(getShowroomVisualKey("每日封邊條領用")).toBe("edge-roll");
  });
});
