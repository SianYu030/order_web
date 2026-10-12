import { NextResponse } from "next/server";
import { agentAuthorized, corsHeaders, photoStore } from "../../../lib/photo-temp-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));
  if (!(await agentAuthorized(request))) {
    return NextResponse.json(
      { ok: false, error: "Photo Agent 未授權" },
      { status: 401, headers }
    );
  }

  try {
    const body = await request.json();
    const id = String(body?.id || "");
    if (!/^[0-9a-f-]{30,40}$/i.test(id)) {
      return NextResponse.json(
        { ok: false, error: "id 錯誤" },
        { status: 400, headers }
      );
    }

    const store = photoStore();
    await store.delete(`queue/${id}`);
    await store.delete(`files/${id}`);

    return NextResponse.json(
      { ok: true, deleted: true, id },
      { status: 200, headers }
    );
  } catch (error) {
    console.error("[photo-ack]", error);
    return NextResponse.json(
      { ok: false, error: "照片確認刪除失敗" },
      { status: 500, headers }
    );
  }
}
