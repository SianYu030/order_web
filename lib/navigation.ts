import type { Role } from "./roles";

export type SidebarItem = {
  id: "home" | "fill" | "record";
  label: string;
  icon: string;
  mode?: "fill" | "record";
};

export function getSidebarItems(role: Role): SidebarItem[] {
  const items: SidebarItem[] = [
    { id: "home", label: "作業首頁", icon: "⌂" },
    { id: "fill", label: "填寫表單", icon: "▤", mode: "fill" }
  ];

  if (role !== "staff") {
    items.push({ id: "record", label: "紀錄查詢", icon: "⌕", mode: "record" });
  }

  return items;
}
