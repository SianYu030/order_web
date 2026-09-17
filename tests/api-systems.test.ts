import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/apps-script-bridge", () => ({
  fetchSystemListFromAppsScript: vi.fn()
}));

import { GET } from "../app/api/systems/route";
import { fetchSystemListFromAppsScript } from "../lib/apps-script-bridge";

const mockedGetSystemList = vi.mocked(fetchSystemListFromAppsScript);

describe("GET /api/systems", () => {
  beforeEach(() => {
    mockedGetSystemList.mockReset();
  });

  it("returns system data on success", async () => {
    mockedGetSystemList.mockResolvedValue([
      {
        id: "001",
        module: "設備",
        name: "系統櫃線上報修",
        type: "表單",
        department: "E3",
        user: "現場",
        formUrl: "https://form.example",
        recordUrl: "https://record.example",
        note: ""
      }
    ]);

    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: [{ id: "001", name: "系統櫃線上報修" }]
    });
  });

  it("returns 502 when the Apps Script bridge cannot be read", async () => {
    mockedGetSystemList.mockRejectedValue(new Error("upstream failed"));

    const response = await GET();
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      success: false,
      message: "Apps Script 資料橋接失敗，請稍後再試。"
    });
  });
});
