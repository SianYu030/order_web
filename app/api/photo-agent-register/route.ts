import { NextResponse } from "next/server";
import { corsHeaders, photoStore, sha256 } from "../../../lib/photo-temp-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  try {
    const body = await request.json();
    const secret = String(body?.secret || "").trim();
    if (secret.length < 32) {
      return NextResponse.json(
        { ok: false, error: "secret 太短" },
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    const store = photoStore();
    const existing = await store.get("agent/config", { type: "json" });
    if (existing) {
      return NextResponse.json(
        { ok: false, error: "Photo Agent 已完成註冊" },
        { status: 409, headers: corsHeaders(origin) }
      );
    }

    const result = await store.setJSON(
      "agent/config",
      { secretHash: await sha256(secret), createdAt: new Date().toISOString() },
      { onlyIfNew: true }
    );

    if (!result.modified) {
      return NextResponse.json(
        { ok: false, error: "Photo Agent 已完成註冊" },
        { status: 409, headers: corsHeaders(origin) }
      );
    }

    return NextResponse.json(
      { ok: true, registered: true },
      { status: 200, headers: corsHeaders(origin) }
    );
  } catch (error) {
    console.error("[photo-agent-register]", error);
    return NextResponse.json(
      { ok: false, error: "Photo Agent 註冊失敗" },
      { status: 500, headers: corsHeaders(origin) }
    );
  }
}
