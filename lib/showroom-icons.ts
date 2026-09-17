export type ShowroomIconKey =
  | "board-cut"
  | "board-nesting"
  | "repair"
  | "waste"
  | "first-piece"
  | "rework"
  | "hardware"
  | "edgeband"
  | "fallback";

export function getShowroomIconKey(name: string): ShowroomIconKey {
  const normalized = String(name || "");
  if (normalized.includes("板材") && normalized.includes("裁板")) return "board-cut";
  if (normalized.includes("板材") && normalized.toLowerCase().includes("nesting")) return "board-nesting";
  if (normalized.includes("報修")) return "repair";
  if (normalized.includes("廢料")) return "waste";
  if (normalized.includes("首件")) return "first-piece";
  if (normalized.includes("不良")) return "rework";
  if (normalized.includes("五金")) return "hardware";
  if (normalized.includes("封邊")) return "edgeband";
  return "fallback";
}
