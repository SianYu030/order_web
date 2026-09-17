export type ReferenceRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export const REFERENCE_CARD_RECTS: ReferenceRect[] = [
  { left: 19.74, top: 28.23, width: 29.66, height: 16.09 },
  { left: 50.36, top: 28.23, width: 29.66, height: 16.09 },
  { left: 19.74, top: 45.58, width: 29.66, height: 15.46 },
  { left: 50.36, top: 45.58, width: 29.66, height: 15.46 },
  { left: 19.74, top: 62.15, width: 29.66, height: 15.46 },
  { left: 50.36, top: 62.15, width: 29.66, height: 15.46 },
  { left: 19.74, top: 79.02, width: 29.66, height: 15.46 },
  { left: 50.36, top: 79.02, width: 29.66, height: 15.46 }
];

export const REFERENCE_FILL_TAB: ReferenceRect = {
  left: 19.74,
  top: 21.45,
  width: 29.9,
  height: 5.2
};

export const REFERENCE_RECORD_TAB: ReferenceRect = {
  left: 49.76,
  top: 21.45,
  width: 30.26,
  height: 5.2
};

export function getReferenceSlot(name: string): number | null {
  const normalized = String(name || "").trim();
  const lower = normalized.toLowerCase();

  if (normalized.includes("板材") && normalized.includes("裁板")) return 0;
  if (normalized.includes("板材") && lower.includes("nesting")) return 1;
  if (normalized.includes("報修")) return 2;
  if (normalized.includes("廢料")) return 3;
  if (normalized.includes("首件")) return 4;
  if (normalized.includes("不良")) return 5;
  if (normalized.includes("五金")) return 6;
  if (normalized.includes("封邊")) return 7;

  return null;
}
