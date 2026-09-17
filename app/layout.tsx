import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./showroom-ratio.css";
import "./showroom-visuals.css";
import "./reference-showroom.css";

export const metadata: Metadata = {
  title: "大成鋼系統櫥櫃部管理平台",
  description: "E3 / E4 / W8 現場作業平台"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
