import { NextResponse } from "next/server";
import { fetchSystemListFromAppsScript } from "../../../lib/apps-script-bridge";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchSystemListFromAppsScript();
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    console.error("[api/systems]", error);

    return NextResponse.json(
      { success: false, message: "Apps Script 資料橋接失敗，請稍後再試。" },
      { status: 502 }
    );
  }
}
