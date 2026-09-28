export type ShowroomVisualKey =
  | "board-stack"
  | "nesting-stack"
  | "tools"
  | "waste-bin"
  | "clipboard"
  | "warning"
  | "hardware"
  | "edge-roll"
  | "generic";

export function getShowroomVisualKey(name: string): ShowroomVisualKey {
  const value = String(name || "");
  const lower = value.toLowerCase();

  if (value.includes("板材") && value.includes("裁板")) return "board-stack";
  if (value.includes("板材") && lower.includes("nesting")) return "nesting-stack";
  if (value.includes("報修")) return "tools";
  if (value.includes("廢料")) return "waste-bin";
  if (value.includes("首件")) return "clipboard";
  if (value.includes("不良")) return "warning";
  if (value.includes("五金")) return "hardware";
  if (value.includes("封邊")) return "edge-roll";
  return "generic";
}
