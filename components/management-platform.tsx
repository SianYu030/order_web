/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { canViewRecord, getRoleName, isRoleAllowed, normalizeRole } from "@/lib/roles";
import {
  HD_SHOWROOM_ASSET_PATH,
  HD_SHOWROOM_CARD_RECTS,
  HD_SHOWROOM_FILL_TAB,
  HD_SHOWROOM_RECORD_TAB,
  getHdShowroomSlot,
  rectStyle
} from "@/lib/reference-showroom-hd";
import { sortSystemItems, type SystemItem } from "@/lib/systems";
import { getSidebarItems } from "@/lib/navigation";
import { getShowroomGridTemplate } from "@/lib/showroom-layout";
import { getShowroomVisualKey } from "@/lib/showroom-visuals";
import { ShowroomIcon } from "@/components/showroom-icon";

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

function getGhostIcon(name: string): string {
  if (name.includes("板材") && name.includes("裁板")) return "◒";
  if (name.includes("板材") && name.toLowerCase().includes("nesting")) return "▱";
  if (name.includes("報修")) return "⚙";
  if (name.includes("廢料")) return "♻";
  if (name.includes("首件")) return "☑";
  if (name.includes("不良")) return "🛠";
  if (name.includes("五金")) return "⚙";
  if (name.includes("封邊")) return "◎";
  return "◇";
}

function todayText(): string {
  const days = ["日", "一", "二", "三", "四", "五", "六"];
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} 星期${days[d.getDay()]}`;
}

export default function ManagementPlatform() {
  const browserSnapshot = useSyncExternalStore(subscribeBrowserState, getBrowserSnapshot, getServerSnapshot);
  const [search, detectedView = "desktop"] = browserSnapshot.split(SNAPSHOT_SEPARATOR) as [string, ViewMode];
  const params = new URLSearchParams(search);
  const role = normalizeRole(params.get("role"));
  const viewMode = normalizeView(params.get("view"), detectedView);

  const [mode, setMode] = useState<Mode>("fill");
  const [systems, setSystems] = useState<SystemItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const effectiveMode: Mode = canViewRecord(role) ? mode : "fill";
  const sidebarItems = getSidebarItems(role);

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

  const visibleItems = sortSystemItems(
    systems.filter((item) => {
      if (!isRoleAllowed(role, item.name)) return false;
      if (effectiveMode === "record") return canViewRecord(role) && Boolean(item.recordUrl);
      return Boolean(item.formUrl);
    })
  );

  if (viewMode === "desktop") {
    const slotItems = visibleItems
      .map((item) => ({ item, slot: getHdShowroomSlot(item.name) }))
      .filter((entry): entry is { item: SystemItem; slot: number } => entry.slot !== null);

    return (
      <main className={`hdShowroomRoot ${role} mode-${effectiveMode}`}>
        <section className="hdShowroomCanvas" aria-label="大成鋼系統櫥櫃部作業平台桌機版">
          <img
            className="hdShowroomImage"
            src={HD_SHOWROOM_ASSET_PATH}
            width="1200"
            height="960"
            alt="大成鋼系統櫥櫃部作業平台"
            draggable={false}
          />

          {effectiveMode === "record" && (
            <>
              <div className="hdFillTabMutedCover" style={rectStyle(HD_SHOWROOM_FILL_TAB)} />
              <div className="hdRecordCover hdRecordTabCover" style={rectStyle(HD_SHOWROOM_RECORD_TAB)}>▤　查看紀錄</div>
              {slotItems.map(({ item, slot }) => {
                const rect = HD_SHOWROOM_CARD_RECTS[slot];
                if (!rect) return null;
                return <div key={`cover-${item.id}-${slot}`} className="hdRecordCover hdRecordButtonCover" style={rectStyle(rect)}>▤ 查看紀錄　›</div>;
              })}
            </>
          )}

          <button
            type="button"
            className={`hdHotspot hdTabHotspot ${effectiveMode === "fill" ? "isActive" : ""}`}
            style={rectStyle(HD_SHOWROOM_FILL_TAB)}
            aria-label="填寫表單"
            onClick={() => setMode("fill")}
          />

          {canViewRecord(role) && (
            <button
              type="button"
              className={`hdHotspot hdTabHotspot ${effectiveMode === "record" ? "isActive" : ""}`}
              style={rectStyle(HD_SHOWROOM_RECORD_TAB)}
              aria-label="查看紀錄"
              onClick={() => setMode("record")}
            />
          )}

          {!loading && !error && slotItems.map(({ item, slot }) => {
            const url = effectiveMode === "record" ? item.recordUrl : item.formUrl;
            const rect = HD_SHOWROOM_CARD_RECTS[slot];
            if (!rect) return null;
            return (
              <a
                key={`${item.id}-${item.name}-${effectiveMode}`}
                className="hdHotspot hdCardHotspot"
                style={rectStyle(rect)}
                href={url || undefined}
                target={url ? "_blank" : undefined}
                rel={url ? "noopener noreferrer" : undefined}
                aria-label={`${effectiveMode === "record" ? "查看" : "填寫"}${item.name}`}
                aria-disabled={!url}
              />
            );
          })}

          {loading && <div className="hdStatusOverlay">資料載入中…</div>}
          {!loading && error && <div className="hdStatusOverlay hdStatusError">⚠️ {error}</div>}
        </section>
      </main>
    );
  }

  const rootClass = `platformRoot ${role} view-${viewMode}`;

  function handleNavigation(id: string, targetMode?: Mode) {
    if (targetMode) setMode(targetMode);
    if (id === "home") setMode("fill");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className={rootClass}>
      <header className="appHeader">
        <div className="brandBlock">
          <div className="brandMark" aria-hidden="true"><span /><span /></div>
          <div className="brand">
            <div className="title">大成鋼系統櫥櫃部</div>
            <div className="subtitle">E3 / E4 / W8 現場作業平台</div>
          </div>
        </div>
        <div className="headerSlogan">創造更好的生活空間<span>SYSTEM CABINET · BETTER LIVING</span></div>
        <div className="headerMeta">
          <div className="dateText">▣ {todayText()}</div>
          <div className="headerLine">用專業・打造家的每一個細節</div>
          <div className="roleBadge">{getRoleName(role)}</div>
        </div>
      </header>

      <div className="layoutShell" style={{ gridTemplateColumns: getShowroomGridTemplate(viewMode) }}>
        <aside className="sideNav" aria-label="作業導覽">
          <div className="showroomShelf showroomShelfTop" aria-hidden="true"><span /><span /><span /></div>
          <nav className="sideNavMenu">
            {sidebarItems.map((item) => {
              const active = item.id === "record" ? effectiveMode === "record" : item.id === "home" ? effectiveMode === "fill" : false;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`sideNavItem ${active ? "active" : ""}`}
                  onClick={() => handleNavigation(item.id, item.mode)}
                >
                  <span className="sideNavIcon">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="sideQuote">
            <b>好的櫥櫃</b><br />讓空間更有溫度
            <span>Good Cabinets<br />Better Living</span>
          </div>
          <div className="sidePlant" aria-hidden="true"><span /><span /><span /></div>
          <div className="showroomShelf showroomShelfBottom" aria-hidden="true"><span /><span /></div>
          <div className="sideScript" aria-hidden="true">From<br />Material to Home</div>
        </aside>

        <div className="contentStage">
          <div className="wrap">
            <section className="panel">
              <div className="panelTitleRow">
                <div className="panelTitle"><span className="panelTitleIcon">▣</span>{effectiveMode === "fill" ? "請選擇要填寫的作業項目" : "請選擇要查看的紀錄"}</div>
                <div className="panelHint">{effectiveMode === "fill" ? "點選下方功能開始填寫" : "點選下方功能查看紀錄 / Google 試算表"}</div>
              </div>

              {canViewRecord(role) && (
                <div className="modeTabs">
                  <button className={`tab ${effectiveMode === "fill" ? "active" : ""}`} onClick={() => setMode("fill")}>✎　填寫表單</button>
                  <button className={`tab ${effectiveMode === "record" ? "active" : ""}`} onClick={() => setMode("record")}>▤　查看紀錄</button>
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
                      <div className="tileIcon"><ShowroomIcon type={getShowroomVisualKey(item.name)} /></div>
                      <div className="tileCopy">
                        <div className="tileName">{cleanName(item.name)}</div>
                        <div className="tileDesc">{effectiveMode === "record" ? "查看紀錄 / Google 試算表" : getShortDesc(item.name)}</div>
                      </div>
                      <div className="ghostIcon" aria-hidden="true">{getGhostIcon(item.name)}</div>
                      <div className="tileAction">{effectiveMode === "record" ? "▤ 查看紀錄" : danger ? "⚠ 立即填寫" : "▣ 立即填寫"}<span>›</span></div>
                    </a>
                  );
                })}
              </div>
            </section>
          </div>
        </div>

        <aside className="showroomDecor" aria-hidden="true">
          <div className="slatWall" />
          <div className="showroomText">SYSTEM<br />FURNITURE<br />FOR<br />A BETTER<br />TOMORROW<span /></div>
          <div className="lamp"><span /></div>
          <div className="displayNiche"><span /><span /><span /></div>
          <div className="counterTop" />
          <div className="counterFace"><span>空間 · 收納 · 生活</span><i /><b /></div>
          <div className="showroomPlant"><i /><i /><i /><i /></div>
        </aside>
      </div>
    </main>
  );
}
