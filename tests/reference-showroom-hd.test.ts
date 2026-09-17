import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HD_SHOWROOM_ASSET_PATH,
  HD_SHOWROOM_CARD_RECTS,
  HD_SHOWROOM_FILL_TAB,
  HD_SHOWROOM_RECORD_TAB,
  getHdShowroomSlot
} from "../lib/reference-showroom-hd";

describe("high-resolution showroom desktop layout", () => {
  it("uses a real static WebP asset instead of a generated route or data URI", () => {
    expect(HD_SHOWROOM_ASSET_PATH).toBe("/showroom-v2.webp");

    const assetPath = join(process.cwd(), "public", "showroom-v2.webp");
    expect(existsSync(assetPath)).toBe(true);
    expect(statSync(assetPath).size).toBeGreaterThan(50000);
  });

  it("maps the eight primary systems to the eight visual card slots", () => {
    expect(getHdShowroomSlot("每日板材領用（裁板機）")).toBe(0);
    expect(getHdShowroomSlot("每日板材領用（Nesting）")).toBe(1);
    expect(getHdShowroomSlot("系統櫃線上報修")).toBe(2);
    expect(getHdShowroomSlot("廠內廢料紀錄")).toBe(3);
    expect(getHdShowroomSlot("每日首件紀錄")).toBe(4);
    expect(getHdShowroomSlot("不良品重工")).toBe(5);
    expect(getHdShowroomSlot("現場五金領料")).toBe(6);
    expect(getHdShowroomSlot("每日封邊條領用")).toBe(7);
    expect(HD_SHOWROOM_CARD_RECTS).toHaveLength(8);
  });

  it("keeps both fill and record tab hotspots inside the reference canvas", () => {
    for (const rect of [HD_SHOWROOM_FILL_TAB, HD_SHOWROOM_RECORD_TAB]) {
      expect(rect.left).toBeGreaterThanOrEqual(0);
      expect(rect.top).toBeGreaterThanOrEqual(0);
      expect(rect.left + rect.width).toBeLessThanOrEqual(100);
      expect(rect.top + rect.height).toBeLessThanOrEqual(100);
    }
  });
});
