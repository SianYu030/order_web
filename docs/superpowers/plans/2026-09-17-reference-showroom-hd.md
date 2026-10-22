# Reference Showroom HD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a desktop management-platform home screen that uses the approved high-resolution showroom reference as the visual canvas while preserving the current data, role, form, record, and mobile behaviors.

**Architecture:** Add one pure layout module that defines the reference asset path, card-slot mapping, and percentage-based hotspot rectangles. Add a desktop-only overlay renderer inside the existing management component; keep the existing responsive UI as the mobile renderer. Store the optimized WebP under `public/` and deploy only from the isolated feature branch until preview verification.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, CSS, Apps Script bridge, Netlify

**Spec:** `docs/superpowers/specs/2026-09-17-reference-showroom-hd-design.md`

## Global Constraints
- Production branch stays untouched during implementation.
- Desktop artwork path is `/reference-showroom-hd.webp`.
- Existing `/api/systems`, Apps Script bridge, role logic, query compatibility, and mobile UI remain functional.
- Desktop hotspots use percentage coordinates so they scale with the canvas.
- Unit tests, lint, typecheck, and production build must all pass before preview handoff.

---

### Task 1: HD showroom layout model

**Files:**
- Create: `lib/reference-showroom-hd.ts`
- Test: `tests/reference-showroom-hd.test.ts`

**Interfaces:**
- Produces: `HD_SHOWROOM_ASSET_PATH`, `HD_SHOWROOM_CARD_RECTS`, `HD_SHOWROOM_FILL_TAB`, `HD_SHOWROOM_RECORD_TAB`, `getHdShowroomSlot(name: string): number | null`.

- [ ] **Step 1: Verify the existing failing test is RED**

Run: `npm test -- tests/reference-showroom-hd.test.ts`
Expected: FAIL because `@/lib/reference-showroom-hd` does not exist.

- [ ] **Step 2: Implement the pure layout module**

Create a typed `PercentRect` interface, export the approved asset path, two tab rectangles, eight card-action rectangles, and deterministic name-to-slot matching for the eight primary systems.

- [ ] **Step 3: Run the focused test**

Run: `npm test -- tests/reference-showroom-hd.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

Commit message: `feat: add HD showroom hotspot model`.

### Task 2: Add the optimized artwork

**Files:**
- Create: `public/reference-showroom-hd.webp`

**Interfaces:**
- Consumes: `HD_SHOWROOM_ASSET_PATH`.
- Produces: a static desktop visual asset served by Next.js.

- [ ] **Step 1: Add the 1402×1122 approved showroom artwork as a WebP**

Use the optimized WebP generated from the approved reference image; do not embed it as a data URI.

- [ ] **Step 2: Verify the repository tree contains the asset**

Expected path: `public/reference-showroom-hd.webp`.

- [ ] **Step 3: Commit**

Commit message: `assets: add HD showroom reference`.

### Task 3: Desktop reference renderer

**Files:**
- Modify: `components/management-platform.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `HD_SHOWROOM_ASSET_PATH`, hotspot rectangles, `getHdShowroomSlot`, existing `SystemItem[]`, role, mode, URLs.
- Produces: a desktop-only `.hdShowroom` canvas with clickable hotspots and mobile fallback to the current interface.

- [ ] **Step 1: Add a failing behavior test for primary-slot ordering if coverage is missing**

Extend `tests/reference-showroom-hd.test.ts` only if the current mapping test does not cover all eight system names.

- [ ] **Step 2: Implement desktop branching**

When `viewMode === "desktop"`, render a `<section className="hdShowroom">` containing the reference artwork and absolute-positioned controls. Keep the existing JSX path for mobile.

- [ ] **Step 3: Implement tab hotspots**

Fill hotspot calls `setMode("fill")`; record hotspot calls `setMode("record")` and only appears when `canViewRecord(role)`.

- [ ] **Step 4: Implement eight action hotspots**

Map visible primary systems through `getHdShowroomSlot`. In fill mode open `formUrl`; in record mode open `recordUrl`. Disabled/missing URLs do not navigate.

- [ ] **Step 5: Add loading/error overlay**

Loading shows a centered translucent status panel. Errors show a readable error panel over the artwork.

- [ ] **Step 6: Add CSS for scaling and accessibility**

Use `aspect-ratio: 1402 / 1122`, `position: relative`, percentage-positioned hotspots, visible focus rings, pointer cursor, and mobile hide rules. Do not distort the artwork.

- [ ] **Step 7: Run tests**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 8: Commit**

Commit message: `feat: render HD showroom desktop interface`.

### Task 4: Full verification and preview

**Files:**
- No production-source changes unless verification exposes a defect.

- [ ] **Step 1: Run production dependency audit**

Run: `npm audit --omit=dev --audit-level=high`
Expected: zero production high/critical vulnerabilities.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Run production build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Confirm branch/deploy preview**

Verify Netlify branch/deploy preview is `ready`, then visually inspect desktop admin mode and one mobile URL before any production cutover.

- [ ] **Step 6: Keep PR draft until visual approval**

Update PR description with verification results and preview URL; do not merge automatically.
