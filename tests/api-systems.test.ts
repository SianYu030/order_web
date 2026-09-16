import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/google-sheets", () => {
  class GoogleSheetsConfigError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "GoogleSheetsConfigError";
    }
  }

  return {
    GoogleSheetsConfigError,
    getSystemListFromGoogleSheets: vi.fn()
  };
});

import { GET } from "../app/api/systems/route";
import { getSystemListFromGoogleSheets, GoogleSheetsConfigError } from "../lib/google-sheets";

const mockedGetSystemList = vi.mocked(getSystemListFromGoogleSheets);

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

  it("returns 500 when Google Sheets configuration is missing", async () => {
    mockedGetSystemList.mockRejectedValue(new GoogleSheetsConfigError("missing"));

    const response = await GET();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      message: "系統尚未完成 Google Sheets 連線設定。"
    });
  });

  it("returns 502 when Google Sheets cannot be read", async () => {
    mockedGetSystemList.mockRejectedValue(new Error("upstream failed"));

    const response = await GET();
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      success: false,
      message: "Google Sheets 資料讀取失敗，請稍後再試。"
    });
  });
});
