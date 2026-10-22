import { getStore } from "@netlify/blobs";

export const PHOTO_STORE_NAME = "repair-photo-temp-v1";
export const ALLOWED_ORIGINS = new Set([
  "https://sianyu030.github.io",
  "https://order-web-sianyu.netlify.app",
]);

export type PhotoQueueItem = {
  id: string;
  orderNo: string;
  photoType: "報修照片" | "維修照片";
  fileName: string;
  contentType: string;
  createdAt: string;
  publicToken: string;
};

export function photoStore() {
  return getStore({ name: PHOTO_STORE_NAME, consistency: "strong" });
}

export function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Photo-Agent-Key",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function isAllowedOrigin(origin: string | null) {
  return !!origin && ALLOWED_ORIGINS.has(origin);
}

export async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function agentAuthorized(request: Request) {
  const secret = request.headers.get("x-photo-agent-key") || "";
  if (!secret) return false;

  const store = photoStore();
  const config = await store.get("agent/config", { type: "json" }) as
    | { secretHash?: string }
    | null;

  if (!config?.secretHash) return false;
  return (await sha256(secret)) === config.secretHash;
}
