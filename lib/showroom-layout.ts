export type ShowroomViewMode = "mobile" | "desktop";

export function getShowroomGridTemplate(viewMode: ShowroomViewMode): string {
  if (viewMode === "mobile") return "1fr";
  return "11% minmax(0,72%) minmax(0,17%)";
}
