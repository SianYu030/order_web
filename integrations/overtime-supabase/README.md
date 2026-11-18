# 業務加班即時同步 + 1 分鐘補同步 | 2026-11-18
- Source snapshot from active Supabase Edge Functions.
- overtime-requests v8: signup/update/approval send signed HMAC wake-up signals, retaining Supabase authorization and Google verification.
- overtime-sheet-bridge v5: private bridge token, webhook registration and synchronization statuses.
- Google Apps Script source: integrations/overtime-google/Code.gs.
- GitHub Pages client: docs/overtime/bridge-admin.js.
- Database schema: public.overtime_sheet_bridge_keys has webhook_url, last_notify_at, last_notify_result columns.
- Do not hardcode or commit Google Apps Script private BUSINESS_OVERTIME_SYNC_TOKEN, Supabase service role key, or any account passwords.
- Google Apps Script still needs manual update / web app deployment / webhook registration from Google account. Without it, the existing schedule remains unchanged.
