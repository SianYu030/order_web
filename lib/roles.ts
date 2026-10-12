export type Role = "staff" | "supervisor" | "admin";

export function normalizeRole(value: string | null | undefined): Role {
  const role = String(value ?? "").trim().toLowerCase();

  if (role === "admin" || role === "manage" || role === "manager" || role.includes("管理")) {
    return "admin";
  }
  if (role === "supervisor" || role === "leader" || role === "主管" || role.includes("主管")) {
    return "supervisor";
  }
  if (role === "staff" || role === "worker" || role === "現場" || role.includes("現場")) {
    return "staff";
  }
  return "staff";
}

export function canViewRecord(role: Role): boolean {
  return role === "supervisor" || role === "admin";
}

export function isRoleAllowed(role: Role, itemName: string): boolean {
  const name = String(itemName ?? "");

  if (role === "admin") return true;

  if (role === "supervisor") {
    return name.includes("板材") || name.includes("報修") || name.includes("停工") || name.includes("廢料");
  }

  if (name.includes("報修") || name.includes("停工") || name.includes("五金") || name.includes("封邊")) {
    return false;
  }
  return name.includes("首件") || name.includes("不良") || name.includes("板材");
}

export function getRoleName(role: Role): string {
  if (role === "admin") return "管理版";
  if (role === "supervisor") return "主管版";
  return "現場版";
}

export function getRoleNote(role: Role): string {
  if (role === "admin") {
    return "管理版：全部功能皆可顯示，可切換填寫表單與查看紀錄，並可查看全部功能清單。";
  }
  if (role === "supervisor") {
    return "主管版：顯示板材領用、線上報修、停工時間紀錄與廠內廢料紀錄，可切換填寫表單與查看紀錄 / Google試算表，不顯示全部功能清單。";
  }
  return "";
}
