import { describe, expect, it } from "vitest";
import { extractCellLinkOrText, mapSheetRow, sortSystemItems, type SystemItem } from "../lib/systems";

describe("systems", () => {
  it("prefers cell hyperlink, then run link, then text", () => {
    expect(extractCellLinkOrText({ text: "顯示字", hyperlink: "https://example.com", runLinks: ["https://run.example"] })).toBe("https://example.com");
    expect(extractCellLinkOrText({ text: "顯示字", runLinks: ["https://run.example"] })).toBe("https://run.example");
    expect(extractCellLinkOrText({ text: "純文字" })).toBe("純文字");
  });

  it("maps A:I rows and filters blank rows", () => {
    const item = mapSheetRow([
      { text: "001" }, { text: "設備" }, { text: "系統櫃線上報修" }, { text: "表單" }, { text: "E3" }, { text: "現場" },
      { text: "填寫", hyperlink: "https://form.example" }, { text: "紀錄", hyperlink: "https://record.example" }, { text: "備註" }
    ]);
    expect(item?.formUrl).toBe("https://form.example");
    expect(item?.recordUrl).toBe("https://record.example");
    expect(mapSheetRow(Array.from({ length: 9 }, () => ({ text: "" })))).toBeNull();
  });

  it("sorts by the current management-platform order", () => {
    const names = ["每日首件紀錄", "停工時間紀錄", "每日板材領用（裁板機）", "系統櫃線上報修"];
    const items = names.map((name, index) => ({ id: String(index), module: "", name, type: "", department: "", user: "", formUrl: "x", recordUrl: "x", note: "" })) as SystemItem[];
    expect(sortSystemItems(items).map((item) => item.name)).toEqual(["每日板材領用（裁板機）", "系統櫃線上報修", "停工時間紀錄", "每日首件紀錄"]);
  });
});
