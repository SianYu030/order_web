import chunk00 from "./reference-showroom-image/chunk-00";
import chunk01 from "./reference-showroom-image/chunk-01";
import chunk02 from "./reference-showroom-image/chunk-02";
import chunk03 from "./reference-showroom-image/chunk-03";
import chunk04 from "./reference-showroom-image/chunk-04";
import chunk05 from "./reference-showroom-image/chunk-05";

export type PercentRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const HD_SHOWROOM_IMAGE_BASE64 = [chunk00, chunk01, chunk02, chunk03, chunk04, chunk05].join("");

export function getHdShowroomImageSrc(): string {
  return `data:image/webp;base64,${HD_SHOWROOM_IMAGE_BASE64}`;
}

export const HD_SHOWROOM_ASSET_PATH = getHdShowroomImageSrc();

export const HD_SHOWROOM_FILL_TAB: PercentRect = {
  left: 19.4,
  top: 21.1,
  width: 30.4,
  height: 4.8
};

export const HD_SHOWROOM_RECORD_TAB: PercentRect = {
  left: 50.0,
  top: 21.1,
  width: 29.5,
  height: 4.8
};

export const HD_SHOWROOM_CARD_RECTS: readonly PercentRect[] = [
  { left: 31.4, top: 37.5, width: 13.5, height: 4.5 },
  { left: 62.1, top: 37.5, width: 13.5, height: 4.5 },
  { left: 31.4, top: 52.6, width: 13.5, height: 4.5 },
  { left: 62.1, top: 52.6, width: 13.5, height: 4.5 },
  { left: 31.4, top: 67.8, width: 13.5, height: 4.5 },
  { left: 62.1, top: 67.8, width: 13.5, height: 4.5 },
  { left: 31.4, top: 83.0, width: 13.5, height: 4.5 },
  { left: 62.1, top: 83.0, width: 13.5, height: 4.5 }
];

const SLOT_MATCHERS: Array<(name: string) => boolean> = [
  (name) => name.includes("板材") && name.includes("裁板"),
  (name) => name.includes("板材") && name.toLowerCase().includes("nesting"),
  (name) => name.includes("報修"),
  (name) => name.includes("廢料"),
  (name) => name.includes("首件"),
  (name) => name.includes("不良"),
  (name) => name.includes("五金"),
  (name) => name.includes("封邊")
];

export function getHdShowroomSlot(name: string): number | null {
  const normalized = String(name ?? "").trim();
  const index = SLOT_MATCHERS.findIndex((matches) => matches(normalized));
  return index >= 0 ? index : null;
}

export function rectStyle(rect: PercentRect): Record<"left" | "top" | "width" | "height", string> {
  return {
    left: `${rect.left}%`,
    top: `${rect.top}%`,
    width: `${rect.width}%`,
    height: `${rect.height}%`
  };
}
