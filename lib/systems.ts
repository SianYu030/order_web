export type SystemItem = {
  id: string;
  module: string;
  name: string;
  type: string;
  department: string;
  user: string;
  formUrl: string;
  recordUrl: string;
  note: string;
};

export type SheetCell = {
  text: string;
  hyperlink?: string;
  runLinks?: string[];
};

const SYSTEM_ORDER = [
  "每日板材領用（裁板機）",
  "每日板材領用（Nesting）",
  "系統櫃線上報修",
  "停工時間紀錄",
  "廠內廢料紀錄",
  "每日首件紀錄",
  "不良品重工",
  "現場五金領料",
  "每日封邊條領用"
];

export function extractCellText(cell: SheetCell | undefined): string {
  return String(cell?.text ?? "").trim();
}

export function extractCellLinkOrText(cell: SheetCell | undefined): string {
  const direct = String(cell?.hyperlink ?? "").trim();
  if (direct) return direct;
  const runLink = cell?.runLinks?.find((value) => String(value ?? "").trim() !== "");
  if (runLink) return String(runLink).trim();
  return extractCellText(cell);
}

export function mapSheetRow(row: SheetCell[]): SystemItem | null {
  const id = extractCellText(row[0]);
  const name = extractCellText(row[2]);
  if (!id && !name) return null;

  return {
    id,
    module: extractCellText(row[1]),
    name,
    type: extractCellText(row[3]),
    department: extractCellText(row[4]),
    user: extractCellText(row[5]),
    formUrl: extractCellLinkOrText(row[6]),
    recordUrl: extractCellLinkOrText(row[7]),
    note: extractCellText(row[8])
  };
}

function getSortIndex(name: string): number {
  for (let index = 0; index < SYSTEM_ORDER.length; index += 1) {
    if (name.includes(SYSTEM_ORDER[index]) || SYSTEM_ORDER[index].includes(name)) return index;
  }
  return 999;
}

export function sortSystemItems(items: SystemItem[]): SystemItem[] {
  return [...items].sort((a, b) => getSortIndex(a.name) - getSortIndex(b.name));
}
