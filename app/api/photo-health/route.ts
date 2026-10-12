import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { ok: true, service: "repair-photo-temp-v1", time: new Date().toISOString() },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
