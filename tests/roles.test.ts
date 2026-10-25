import { describe, expect, it } from "vitest";
import { canViewRecord, isRoleAllowed, normalizeRole } from "../lib/roles";

describe("roles", () => {
  it("normalizes role aliases and falls back to staff", () => {
    expect(normalizeRole("ADMIN")).toBe("admin");
    expect(normalizeRole("主管")).toBe("supervisor");
    expect(normalizeRole("worker")).toBe("staff");
    expect(normalizeRole("bogus")).toBe("staff");
  });

  it("controls record access", () => {
    expect(canViewRecord("staff")).toBe(false);
    expect(canViewRecord("supervisor")).toBe(true);
    expect(canViewRecord("admin")).toBe(true);
  });

  it("preserves existing visibility rules", () => {
    expect(isRoleAllowed("staff", "每日首件紀錄")).toBe(true);
    expect(isRoleAllowed("staff", "系統櫃線上報修")).toBe(false);
    expect(isRoleAllowed("staff", "現場五金領料")).toBe(false);
    expect(isRoleAllowed("supervisor", "停工時間紀錄")).toBe(true);
    expect(isRoleAllowed("supervisor", "每日首件紀錄")).toBe(false);
    expect(isRoleAllowed("admin", "任何功能")).toBe(true);
  });
});
