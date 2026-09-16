import { google, type sheets_v4 } from "googleapis";
import { mapSheetRow, type SheetCell, type SystemItem } from "./systems";

export type GoogleSheetsConfig = {
  spreadsheetId: string;
  email: string;
  privateKey: string;
};

export class GoogleSheetsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleSheetsConfigError";
  }
}

export function normalizePrivateKey(value: string): string {
  return value.replace(/\\n/g, "\n");
}

export function readGoogleSheetsConfig(env: NodeJS.ProcessEnv = process.env): GoogleSheetsConfig {
  const spreadsheetId = String(env.GOOGLE_SHEETS_SPREADSHEET_ID ?? "").trim();
  const email = String(env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "").trim();
  const privateKeyRaw = String(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").trim();

  if (!spreadsheetId || !email || !privateKeyRaw) {
    throw new GoogleSheetsConfigError("Missing Google Sheets Service Account environment variables.");
  }

  return { spreadsheetId, email, privateKey: normalizePrivateKey(privateKeyRaw) };
}

function cellDataToSheetCell(cell: sheets_v4.Schema$CellData | undefined): SheetCell {
  const runLinks = (cell?.textFormatRuns ?? [])
    .map((run) => run.format?.link?.uri ?? "")
    .filter((uri): uri is string => Boolean(uri));

  return {
    text: String(cell?.formattedValue ?? ""),
    hyperlink: cell?.hyperlink ?? undefined,
    runLinks
  };
}

let cache: { expiresAt: number; data: SystemItem[] } | null = null;

export async function getSystemListFromGoogleSheets(): Promise<SystemItem[]> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.data;

  const config = readGoogleSheetsConfig();
  const auth = new google.auth.JWT({
    email: config.email,
    key: config.privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.get({
    spreadsheetId: config.spreadsheetId,
    ranges: ["系統清單!A2:I"],
    includeGridData: true,
    fields: "sheets(data(rowData(values(formattedValue,hyperlink,textFormatRuns(format(link(uri)))))))"
  });

  const rowData = response.data.sheets?.[0]?.data?.[0]?.rowData ?? [];
  const items = rowData
    .map((row) => (row.values ?? []).map(cellDataToSheetCell))
    .map(mapSheetRow)
    .filter((item): item is SystemItem => item !== null);

  cache = { expiresAt: now + 60_000, data: items };
  return items;
}

export function clearSystemListCacheForTests(): void {
  cache = null;
}
