import type { SystemItem } from "./systems";

export const APPS_SCRIPT_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbw4-R3NzwtR_24rraYOdtHLaxd3Y6y3v6MePSlxtpLCt1envWKTt0_2WBIVUjLWYH9YXA/exec";

type BridgeResponse = {
  success?: boolean;
  data?: unknown;
  message?: string;
};

function isSystemItem(value: unknown): value is SystemItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.name === "string";
}

export async function fetchSystemListFromAppsScript(
  fetcher: typeof fetch = fetch
): Promise<SystemItem[]> {
  const url = new URL(APPS_SCRIPT_WEB_APP_URL);
  url.searchParams.set("api", "systems");

  const response = await fetcher(url, {
    method: "GET",
    redirect: "follow",
    cache: "no-store"
  });

  const text = await response.text();
  let body: BridgeResponse;

  try {
    body = JSON.parse(text) as BridgeResponse;
  } catch {
    throw new Error("Apps Script 回傳格式錯誤");
  }

  if (!response.ok || body.success !== true) {
    throw new Error(String(body.message || `Apps Script 橋接失敗 (${response.status})`));
  }

  if (!Array.isArray(body.data) || !body.data.every(isSystemItem)) {
    throw new Error("Apps Script 回傳格式錯誤");
  }

  return body.data;
}
