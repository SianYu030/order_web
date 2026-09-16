# Next.js + Google Sheets API Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the current GAS-hosted management platform to a deployable Next.js + TypeScript app that reads the existing `系統清單` sheet through Google Sheets API while preserving the current UI behavior and role/view query parameters.

**Architecture:** Browser renders a React client component. It calls server-side `GET /api/systems`. The API route calls a server-only Google Sheets client authenticated by Service Account environment variables, maps A:I rows into `SystemItem`, preserves hyperlinks, and returns the same `{success,data}` shape the current GAS front end expects.

**Tech Stack:** Next.js App Router, React, TypeScript, googleapis, Vitest, ESLint.

**Spec:** `docs/superpowers/specs/2026-09-16-nextjs-google-sheets-migration-design.md`

## Global Constraints

- Work only on branch `migration/nextjs-google-sheets`; do not modify `main`.
- Preserve the current GAS deployment unchanged during migration.
- Preserve query compatibility for `?role=staff|supervisor|admin` and `?view=mobile|desktop`.
- Service Account credentials must remain server-only and must never be committed.
- Read only `系統清單!A2:I` in this phase.
- Preserve existing hyperlink behavior for form and record cells.
- UI should retain the existing dark header, green/blue/red modes, mobile single-column and desktop two-column cards.
- `?role=admin` remains a display mode, not authentication.
- Completion requires successful `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`.

---

### Task 1: Bootstrap the Next.js project and test harness

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `eslint.config.mjs`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `app/globals.css`

**Interfaces:**
- Produces a valid Next.js App Router project.
- `app/page.tsx` will render `ManagementPlatform` from Task 4.

- [ ] **Step 1: Add package scripts and dependencies**

`package.json` must define:

```json
{
  "name": "order-web",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "googleapis": "^144.0.0",
    "next": "^15.5.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@eslint/eslintrc": "^3.3.1",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.5.0",
    "typescript": "^5.7.0",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 2: Configure TypeScript and linting**

Use strict TypeScript, `@/*` path aliases, Next.js plugin config, and an ESLint flat config extending Next core-web-vitals and TypeScript rules.

- [ ] **Step 3: Add environment variable template**

`.env.example` must contain exactly the required names, with no secrets:

```text
GOOGLE_SHEETS_SPREADSHEET_ID=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=
```

- [ ] **Step 4: Add base layout and global CSS entry point**

`app/layout.tsx` exports metadata title `大成鋼系統櫥櫃部管理平台`, imports `./globals.css`, and renders children under `<html lang="zh-Hant">`.

- [ ] **Step 5: Install and verify baseline**

Run:

```bash
npm install
npm run typecheck
```

Expected: dependency installation completes and TypeScript has zero errors for the scaffold.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts eslint.config.mjs .gitignore .env.example app
git commit -m "chore: bootstrap Next.js migration app"
```

### Task 2: Implement role and visibility rules with tests

**Files:**
- Create: `lib/roles.ts`
- Create: `tests/roles.test.ts`

**Interfaces:**
- Produces `Role`, `normalizeRole`, `canViewRecord`, `isRoleAllowed`, `getRoleName`, `getRoleNote`.
- Task 4 consumes these functions.

- [ ] **Step 1: Write failing tests**

Tests must assert:

```ts
expect(normalizeRole("ADMIN")).toBe("admin");
expect(normalizeRole("主管")).toBe("supervisor");
expect(normalizeRole("bogus")).toBe("staff");
expect(canViewRecord("staff")).toBe(false);
expect(canViewRecord("supervisor")).toBe(true);
expect(isRoleAllowed("staff", "每日首件紀錄")).toBe(true);
expect(isRoleAllowed("staff", "系統櫃線上報修")).toBe(false);
expect(isRoleAllowed("supervisor", "停工時間紀錄")).toBe(true);
expect(isRoleAllowed("admin", "任何功能")).toBe(true);
```

- [ ] **Step 2: Run test to verify failure**

Run `npm test -- tests/roles.test.ts`.
Expected: FAIL because `lib/roles.ts` does not exist.

- [ ] **Step 3: Implement role helpers**

Implement aliases matching the existing HTML logic and the exact visibility rules from the spec. Unknown role must return `staff`.

- [ ] **Step 4: Run test to verify pass**

Run `npm test -- tests/roles.test.ts`.
Expected: all role tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/roles.ts tests/roles.test.ts
git commit -m "feat: preserve management platform role rules"
```

### Task 3: Implement system row parsing, hyperlink extraction, and sorting

**Files:**
- Create: `lib/systems.ts`
- Create: `tests/systems.test.ts`

**Interfaces:**
- Produces `SystemItem`, `SheetCell`, `extractCellText`, `extractCellLinkOrText`, `mapSheetRow`, `sortSystemItems`.
- Task 5 Google Sheets client passes normalized `SheetCell[][]` to these helpers.
- Task 4 UI consumes `SystemItem[]`.

- [ ] **Step 1: Write failing tests**

Tests cover:

```ts
expect(extractCellLinkOrText({ text: "顯示字", hyperlink: "https://example.com" })).toBe("https://example.com");
expect(extractCellLinkOrText({ text: "純文字" })).toBe("純文字");
expect(mapSheetRow([
  {text:"001"},{text:"設備"},{text:"系統櫃線上報修"},{text:"表單"},{text:"E3"},{text:"現場"},
  {text:"填寫", hyperlink:"https://form.example"},{text:"紀錄", hyperlink:"https://record.example"},{text:"備註"}
])?.formUrl).toBe("https://form.example");
expect(mapSheetRow(Array(9).fill({text:""}))).toBeNull();
```

Also verify the existing order begins with 裁板機板材、Nesting板材、線上報修、停工、廢料、首件、不良、五金、封邊.

- [ ] **Step 2: Run test to verify failure**

Run `npm test -- tests/systems.test.ts`.
Expected: FAIL because implementation is missing.

- [ ] **Step 3: Implement parsers and sorting**

`SheetCell` must support `text`, optional `hyperlink`, and optional `runLinks: string[]`. Link precedence is `hyperlink` → first non-empty `runLinks` → `text`.

`mapSheetRow` maps A:I to:

```ts
{
  id, module, name, type, department, user,
  formUrl, recordUrl, note
}
```

and returns `null` only when both `id` and `name` are blank.

- [ ] **Step 4: Run tests**

Run `npm test -- tests/systems.test.ts`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/systems.ts tests/systems.test.ts
git commit -m "feat: map system list rows and hyperlinks"
```

### Task 4: Port the management platform UI to React

**Files:**
- Create: `components/management-platform.tsx`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes `Role` helpers from `lib/roles.ts`.
- Consumes `SystemItem` and sorting from `lib/systems.ts`.
- Fetches `GET /api/systems` and expects `{success:boolean,data?:SystemItem[],message?:string}`.

- [ ] **Step 1: Implement client-side URL parsing**

On mount, use `window.location.search` to read `role` and `view`. Normalize role through `normalizeRole`. Normalize view aliases `mobile|phone|app|手機` to mobile and `desktop|pc|computer|電腦` to desktop; otherwise infer from user agent and `(max-width:700px)`.

- [ ] **Step 2: Implement data fetch and states**

Fetch `/api/systems` once on mount, display `載入中...` while pending, red error panel on non-success, and `目前沒有系統資料` for empty data.

- [ ] **Step 3: Port fill/record mode**

`staff` sees fill mode only. `supervisor` and `admin` can switch between `填寫表單` and `查看紀錄`. Record mode uses `recordUrl`; fill mode uses `formUrl`.

- [ ] **Step 4: Port cards and admin list**

Preserve icons, short descriptions, danger styling for 不良, blue record styling, disabled opacity for missing links, `_blank` navigation, and the current sort order. Only admin renders `全部功能`.

- [ ] **Step 5: Port responsive visual design**

Move the supplied CSS into `app/globals.css` with React-safe class names while retaining header, role badge, cards, mobile one-column, desktop two-column, and current colors.

- [ ] **Step 6: Verify typecheck**

Run `npm run typecheck`.
Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx app/globals.css components/management-platform.tsx
git commit -m "feat: port management platform UI to React"
```

### Task 5: Add server-only Google Sheets API client and `/api/systems`

**Files:**
- Create: `lib/google-sheets.ts`
- Create: `app/api/systems/route.ts`
- Create: `tests/google-sheets.test.ts`

**Interfaces:**
- `getSystemListFromGoogleSheets(): Promise<SystemItem[]>`
- `GET /api/systems` returns status 200 with `{success:true,data}` or status 500/502 with `{success:false,message}`.

- [ ] **Step 1: Write environment/parser tests**

Test a pure helper `normalizePrivateKey(value)` that converts literal `\\n` sequences into newline characters. Test `readGoogleSheetsConfig(env)` throws when any required variable is missing.

- [ ] **Step 2: Run test to verify failure**

Run `npm test -- tests/google-sheets.test.ts`.
Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement Service Account config**

Read only:

```text
GOOGLE_SHEETS_SPREADSHEET_ID
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
```

Create `google.auth.JWT` with Sheets readonly scope. Never expose these values from an API response.

- [ ] **Step 4: Implement sheet fetch with hyperlink metadata**

Call `sheets.spreadsheets.get` using the configured spreadsheet id and range `系統清單!A2:I`, with `includeGridData: true`. Request enough grid data to read formatted/display text, cell-level hyperlink, and text-format run links. Convert each returned cell to `SheetCell` and then through `mapSheetRow`.

- [ ] **Step 5: Add 60-second server cache**

Maintain a module-level cache `{expiresAt,data}`. Reuse cached rows until expired. Do not cache errors.

- [ ] **Step 6: Implement API route**

On success return:

```ts
NextResponse.json({ success: true, data })
```

On missing configuration return HTTP 500 with `系統尚未完成 Google Sheets 連線設定。`. For Google API/network/sheet failures return HTTP 502 with `Google Sheets 資料讀取失敗，請稍後再試。` and log the original server error.

- [ ] **Step 7: Run unit tests and typecheck**

Run:

```bash
npm test
npm run typecheck
```

Expected: all tests PASS and zero TS errors.

- [ ] **Step 8: Commit**

```bash
git add lib/google-sheets.ts app/api/systems/route.ts tests/google-sheets.test.ts
git commit -m "feat: read system list through Google Sheets API"
```

### Task 6: Documentation and full verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- README becomes the operator setup guide for GitHub/Next.js + Google Sheets API.

- [ ] **Step 1: Document local setup**

README must include `npm install`, copy `.env.example` to `.env.local`, and `npm run dev`.

- [ ] **Step 2: Document Google Cloud setup**

Explain enabling Google Sheets API, creating a Service Account, obtaining the service account email/private key, sharing the total-control spreadsheet with the service account as Viewer, and finding the spreadsheet ID from the Sheet URL.

- [ ] **Step 3: Document deployment secrets**

List the same three environment variables and explicitly state that `.env.local` and private keys must never be committed.

- [ ] **Step 4: Document compatibility URLs**

Examples:

```text
/?role=staff
/?role=supervisor
/?role=admin
/?role=admin&view=desktop
/?role=staff&view=mobile
```

State that role is a UI mode only and is not authentication.

- [ ] **Step 5: Run full verification**

Run exactly:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 6: Verify secret safety**

Run:

```bash
git grep -n "BEGIN PRIVATE KEY" || true
git status --short
```

Expected: no private key text is found and only intended tracked changes are present.

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "docs: add Google Sheets API migration setup"
```

### Task 7: Review branch diff and prepare deployment handoff

**Files:**
- No required source change unless review finds an issue.

**Interfaces:**
- Produces a reviewed migration branch ready for preview deployment once the user supplies/authorizes Google Cloud credentials and a deployment provider.

- [ ] **Step 1: Compare against main**

Run:

```bash
git diff --stat main...HEAD
git diff --check main...HEAD
```

Expected: no whitespace errors and changes limited to migration files/docs.

- [ ] **Step 2: Re-run verification from a clean state**

Run:

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

Expected: exit 0.

- [ ] **Step 3: Record the external blocker precisely**

The application can be fully coded without secrets, but live Google data cannot be verified until the user creates/authorizes a Google Cloud Service Account and supplies the three environment variables through a secure deployment environment. Do not place any secret into chat, source code, issue comments, or commits.

- [ ] **Step 4: Prepare PR summary**

Summarize: GAS frontend dependency removed, Next.js UI added, Sheets API route added, role/view compatibility preserved, tests/build status, and remaining deployment credential step.
