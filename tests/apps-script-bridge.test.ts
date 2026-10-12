import { describe, expect, it, vi } from "vitest";
import { fetchSystemListFromAppsScript } from "../lib/apps-script-bridge";

describe("fetchSystemListFromAppsScript", () => {
  it("returns system items from the Apps Script bridge", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: [
            {
              id: "6",
              module: "設備管理",
              name: "系統櫃線上報修",
              type: "表單/紀錄",
              department: "E3/E4/W8",
              user: "現場人員",
              formUrl: "https://forms.gle/example",
              recordUrl: "https://docs.google.com/spreadsheets/d/example/edit",
              note: ""
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const result = await fetchSystemListFromAppsScript(fetcher);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "6", name: "系統櫃線上報修" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("throws a readable error when the bridge reports failure", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false, message: "找不到系統清單" }), {
        status: 500,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(fetchSystemListFromAppsScript(fetcher)).rejects.toThrow("找不到系統清單");
  });

  it("rejects malformed bridge responses", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response("<html>not json</html>", {
        status: 200,
        headers: { "content-type": "text/html" }
      })
    );

    await expect(fetchSystemListFromAppsScript(fetcher)).rejects.toThrow("Apps Script 回傳格式錯誤");
  });
});
