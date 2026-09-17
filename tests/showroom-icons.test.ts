import { describe, expect, it } from "vitest";
import { getShowroomIconKey } from "../lib/showroom-icons";

describe("getShowroomIconKey", () => {
  it("maps cabinet workflow names to the showroom icon sprite", () => {
    expect(getShowroomIconKey("每日板材領用（裁板機）")).toBe("board-cut");
    expect(getShowroomIconKey("每日板材領用（Nesting）")).toBe("board-nesting");
    expect(getShowroomIconKey("系統櫃線上報修")).toBe("repair");
    expect(getShowroomIconKey("廠內廢料紀錄")).toBe("waste");
    expect(getShowroomIconKey("每日首件紀錄")).toBe("first-piece");
    expect(getShowroomIconKey("不良品重工")).toBe("rework");
    expect(getShowroomIconKey("現場五金領料")).toBe("hardware");
    expect(getShowroomIconKey("每日封邊條領用")).toBe("edgeband");
  });
});
