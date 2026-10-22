import { NextResponse } from "next/server";
import {
  agentAuthorized,
  corsHeaders,
  photoStore,
  type PhotoQueueItem,
} from "../../../lib/photo-temp-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));
  if (!(await agentAuthorized(request))) {
    return NextResponse.json(
      { ok: false, error: "Photo Agent 未授權" },
      { status: 401, headers }
    );
  }

  try {
    const store = photoStore();
    const listed = await store.list({ prefix: "queue/" });
    const origin = new URL(request.url).origin;
    const items: Array<PhotoQueueItem & { downloadUrl: string }> = [];

    for (const blob of listed.blobs) {
      const item = await store.get(blob.key, { type: "json" }) as PhotoQueueItem | null;
      if (!item?.id) continue;
      items.push({
        ...item,
        downloadUrl: `${origin}/api/photo-file?id=${encodeURIComponent(item.id)}`,
      });
    }

    items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return NextResponse.json(
      { ok: true, items },
      { status: 200, headers }
    );
  } catch (error) {
    console.error("[photo-queue]", error);
    return NextResponse.json(
      { ok: false, error: "讀取照片佇列失敗" },
      { status: 500, headers }
    );
  }
}
