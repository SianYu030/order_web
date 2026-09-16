import { NextResponse } from "next/server";
import { getSystemListFromGoogleSheets, GoogleSheetsConfigError } from "../../../lib/google-sheets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getSystemListFromGoogleSheets();
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    console.error("[api/systems]", error);

    if (error instanceof GoogleSheetsConfigError) {
      return NextResponse.json(
        { success: false, message: "系統尚未完成 Google Sheets 連線設定。" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: false, message: "Google Sheets 資料讀取失敗，請稍後再試。" },
      { status: 502 }
    );
  }
}
