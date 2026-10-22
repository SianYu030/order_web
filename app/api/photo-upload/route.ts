import { NextResponse } from "next/server";
import {
  corsHeaders,
  isAllowedOrigin,
  photoStore,
  type PhotoQueueItem,
} from "../../../lib/photo-temp-store";

export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  if (!isAllowedOrigin(origin)) {
    return NextResponse.json(
      { ok: false, error: "不允許的來源" },
      { status: 403, headers }
    );
  }

  try {
    const form = await request.formData();
    const orderNo = String(form.get("orderNo") || "").trim().toUpperCase();
    const photoType = String(form.get("photoType") || "").trim();
    const file = form.get("file");

    if (!/^MR\d{10}$/.test(orderNo)) {
      return NextResponse.json(
        { ok: false, error: "工單編號格式錯誤" },
        { status: 400, headers }
      );
    }
    if (photoType !== "報修照片" && photoType !== "維修照片") {
      return NextResponse.json(
        { ok: false, error: "照片類型錯誤" },
        { status: 400, headers }
      );
    }
    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json(
        { ok: false, error: "沒有收到照片" },
        { status: 400, headers }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: "單張照片不可超過 15MB" },
        { status: 413, headers }
      );
    }
    const contentType = file.type || "application/octet-stream";
    if (!ALLOWED_TYPES.has(contentType)) {
      return NextResponse.json(
        { ok: false, error: "僅支援 JPG、PNG、WebP、HEIC/HEIF" },
        { status: 415, headers }
      );
    }

    const id = crypto.randomUUID();
    const publicToken = crypto.randomUUID().replaceAll("-", "");
    const item: PhotoQueueItem = {
      id,
      orderNo,
      photoType: photoType as PhotoQueueItem["photoType"],
      fileName: file.name || "photo.jpg",
      contentType,
      createdAt: new Date().toISOString(),
      publicToken,
    };

    const store = photoStore();
    await store.set(`files/${id}`, file, { metadata: item });
    await store.setJSON(`queue/${id}`, item);

    return NextResponse.json(
      { ok: true, id, orderNo, photoType, queued: true },
      { status: 200, headers }
    );
  } catch (error) {
    console.error("[photo-upload]", error);
    return NextResponse.json(
      { ok: false, error: "照片暫存失敗" },
      { status: 500, headers }
    );
  }
}
