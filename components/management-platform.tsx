"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { canViewRecord, getRoleName, getRoleNote, isRoleAllowed, normalizeRole } from "@/lib/roles";
import { sortSystemItems, type SystemItem } from "@/lib/systems";

type Mode = "fill" | "record";
type ViewMode = "mobile" | "desktop";
type ApiResponse = { success: boolean; data?: SystemItem[]; message?: string };

const SNAPSHOT_SEPARATOR = "\u0000";

function isMobileDevice(): boolean {
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || window.matchMedia?.("(max-width: 700px)").matches === true;
}

function subscribeBrowserState(callback: () => void): () => void {
  const mediaQuery = window.matchMedia("(max-width: 700px)");
  window.addEventListener("popstate", callback);
  window.addEventListener("resize", callback);
  mediaQuery.addEventListener("change", callback);

  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener("resize", callback);
    mediaQuery.removeEventListener("change", callback);
  };
}

function getBrowserSnapshot(): string {
  return `${window.location.search}${SNAPSHOT_SEPARATOR}${isMobileDevice() ? "mobile" : "desktop"}`;
}

function getServerSnapshot(): string {
  return `${SNAPSHOT_SEPARATOR}desktop`;
}

function normalizeView(value: string | null, fallback: ViewMode): ViewMode {
  const view = String(value ?? "").trim().toLowerCase();
  if (view === "mobile" || view === "phone" || view === "app" || view === "手機" || view.includes("手機")) return "mobile";
  if (view === "desktop" || view === "pc" || view === "computer" || view === "電腦" || view.includes("電腦")) return "desktop";
  return fallback;
}

function cleanName(name: string): string {
  if (name.includes("首件")) return "每日首件";
  if (name.includes("不良")) return "不良品重工";
  if (name.includes("五金")) return "五金領料";
  if (name.includes("板材") && name.includes("裁板")) return "板材領用\n（裁板機）";
  if (name.includes("板材") && name.toLowerCase().includes("nesting")) return "板材領用\n（Nesting）";
  if (name.includes("報修")) return "線上報修";
  if (name.includes("封邊")) return "封邊條領用";
  if (name.includes("停工")) return "停工時間紀錄";
  if (name.includes("廢料")) return "廠內廢料紀錄";
  return name.replace("系統櫃", "").replace("每日", "").replace("紀錄", "").replace("表單", "").replace("（", "\n（").trim();
}

function getShortDesc(name: string): string {
  if (name.includes("報修")) return "設備異常報修";
  if (name.includes("首件")) return "品質檢查";
  if (name.includes("不良")) return "重工補料申請";
  if (name.includes("五金")) return "五金領料";
  if (name.includes("板材") && name.includes("裁板")) return "裁板機用料";
  if (name.includes("板材") && name.toLowerCase().includes("nesting")) return "Nesting 用料";
  if (name.includes("板材")) return "板材領用";
  if (name.includes("封邊")) return "封邊條領用";
  if (name.includes("停工")) return "停工紀錄";
  if (name.includes("廢料")) return "廠內廢料紀錄";
  return "開始填寫";
}

function getIcon(moduleName: string, name: string): string {
  if (name.includes("報修")) return "🔧";
  if (name.includes("首件")) return "🧪";
  if (name.includes("不良")) return "❌";
  if (name.includes("五金")) return "🔩";
  if (name.includes("板材")) return "🪵";
  if (name.includes("封邊")) return "📏";
  if (name.includes("停工")) return "⏱️";
  if (name.includes("廢料")) return "🗑️";
  if (moduleName.includes("倉庫")) return "📦";
  if (moduleName.includes("品質")) return "🧪";
  if (moduleName.includes("設備")) return "🔧";
  if (moduleName.includes("生產")) return "⏱️";
  return "📋";
}

function todayText(): string {
  const days = ["日", "一", "二", "三", "四", "五", "六"];
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} 星期${days[d.getDay()]}`;
}

export default function ManagementPlatform() {
  const browserSnapshot = useSyncExternalStore(subscribeBrowserState, getBrowserSnapshot, getServerSnapshot);
  const [search, detectedView = "desktop"] = browserSnapshot.split(SNAPSHOT_SEPARATOR) as [string, ViewMode];
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const role = normalizeRole(params.get("role"));
  const viewMode = normalizeView(params.get("view"), detectedView);

  const [mode, setMode] = useState<Mode>("fill");
  const [systems, setSystems] = useState<SystemItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const effectiveMode: Mode = canViewRecord(role) ? mode : "fill";

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/systems", { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as ApiResponse;
        if (!response.ok || !body.success) throw new Error(body.message || "系統沒有回傳資料");
        setSystems(body.data ?? []);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "系統資料讀取失敗");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  const visibleItems = useMemo(() => {
    const filtered = systems.filter((item) => {
      if (!isRoleAllowed(role, item.name)) return false;
      if (effectiveMode === "record") return canViewRecord(role) && Boolean(item.recordUrl);
      return Boolean(item.formUrl);
    });
    return sortSystemItems(filtered);
  }, [systems, role, effectiveMode]);

  const note = getRoleNote(role);
  const rootClass = `platformRoot ${role} view-${viewMode}`;

  return (
    <main className={rootClass}>
      <header className="appHeader">
        <div className="headerTop">
          <div className="brand">
            <div className="title">🏭 大成鋼系統櫥櫃部</div>
            <div className="subtitle">E3 / E4 / W8 現場作業平台</div>
          </div>
          <div className="roleBadge">{getRoleName(role)}</div>
        </div>
        <div className="dateText">{todayText()}</div>
      </header>

      <div className="wrap">
        <section className="panel">
          <div className="panelTitleRow">
            <div className="panelTitle">{effectiveMode === "fill" ? "👇 請選擇要填寫的作業項目" : "📊 請選擇要查看的紀錄"}</div>
            <div className="panelHint">{effectiveMode === "fill" ? "點選下方功能開始填寫" : "點選下方功能查看紀錄 / Google 試算表"}</div>
          </div>

          {canViewRecord(role) && (
            <div className="modeTabs">
              <button className={`tab ${effectiveMode === "fill" ? "active" : ""}`} onClick={() => setMode("fill")}>填寫表單</button>
              <button className={`tab ${effectiveMode === "record" ? "active" : ""}`} onClick={() => setMode("record")}>查看紀錄</button>
            </div>
          )}

          <div className={`grid ${effectiveMode === "record" ? "recordMode" : ""}`}>
            {loading && <div className="loading">載入中...</div>}
            {!loading && error && <div className="errorBox"><b>⚠️ 系統讀取失敗</b><br /><br />{error}</div>}
            {!loading && !error && visibleItems.length === 0 && <div className="empty">目前沒有系統資料</div>}
            {!loading && !error && visibleItems.map((item) => {
              const url = effectiveMode === "record" ? item.recordUrl : item.formUrl;
              const danger = item.name.includes("不良");
              return (
                <a
                  key={`${item.id}-${item.name}`}
                  className={`appTile ${danger ? "dangerTile" : ""}`}
                  href={url || undefined}
                  target={url ? "_blank" : undefined}
                  rel={url ? "noopener noreferrer" : undefined}
                  aria-disabled={!url}
                >
                  <div className="tileIcon">{getIcon(item.module, item.name)}</div>
                  <div className="tileName">{cleanName(item.name)}</div>
                  <div className="tileDesc">{effectiveMode === "record" ? "查看紀錄 / Google 試算表" : getShortDesc(item.name)}</div>
                  <div className="tileAction">{effectiveMode === "record" ? "查看紀錄" : danger ? "⚠️ 立即填寫" : "👉 立即填寫"}</div>
                </a>
              );
            })}
          </div>
        </section>

        {note && <div className="adminNote">{note}</div>}

        {role === "admin" && (
          <section className="section">
            <div className="sectionTitle">全部功能</div>
            <div className="smallList">
              {systems.length === 0 && !loading ? <div className="empty">目前沒有功能資料</div> : systems.map((item) => {
                const url = effectiveMode === "record" ? item.recordUrl : item.formUrl;
                return (
                  <a
                    key={`all-${item.id}-${item.name}`}
                    className="listItem"
                    href={url || undefined}
                    target={url ? "_blank" : undefined}
                    rel={url ? "noopener noreferrer" : undefined}
                    aria-disabled={!url}
                  >
                    <div className="listIcon">{getIcon(item.module, item.name)}</div>
                    <div className="listMain">
                      <div className="listName">{item.name}</div>
                      <div className="listMeta">{item.module}｜{item.department}｜{effectiveMode === "record" ? "紀錄 / Google試算表" : "填寫表單"}</div>
                    </div>
                    <div className="arrow">›</div>
                  </a>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <footer className="footer">大成鋼系統櫃部</footer>
    </main>
  );
}
