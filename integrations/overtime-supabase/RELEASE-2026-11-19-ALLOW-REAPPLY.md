# 2026-11-19 同日取消後可重新申請：正式 DB 索引修正

已於 Supabase 專案 `mjcbixcgbcybtciribar` 套用遷移：
`allow_same_day_reapply_after_confirmed_cancellation_20261119`

## 原因
原索引 `overtime_web_one_active_date`：
```sql
CREATE UNIQUE INDEX overtime_web_one_active_date
ON public.overtime_web_requests (department,employee_id,work_date)
WHERE status <> '已駁回';
```
原規則讓「已取消」永久佔用同一天，阻止當天後續再申請。

## 已執行的 SQL（勿重複執行）
```sql
CREATE UNIQUE INDEX overtime_web_one_active_date_v2
 ON public.overtime_web_requests (department, employee_id, work_date)
 WHERE status NOT IN ('已駁回','已取消');
DROP INDEX public.overtime_web_one_active_date;
ALTER INDEX public.overtime_web_one_active_date_v2
 RENAME TO overtime_web_one_active_date;
```

## 行為驗收
- 待同步／同步中／待核准／已核准／核准待同步／取消待審核／取消待同步／取消需人工核對／需人工核對：仍佔用同日有效申請名額。
- 已駁回／已取消：不佔用，同日可以重報。
- 原正式 Google 同步 `otRegister_` 排除「已駁回」「已取消」來源列。
- Google 月表同人同日同一工時格，應維持只能有一筆有效核准；重新申請需待原取消及工時清除核對完成。
- 不降低防連點提交、主管審核、申請憑證核對、後端稽核機制。

## 修正後已驗證
- `pg_indexes` 查得新部分唯一索引：`status <> ALL (ARRAY['已駁回','已取消'])`
- 現有有效申請同日重複衝突數 0。
- 變更前後正式工單狀態筆數不變：已取消 1、已核准 1、已駁回 1。
- 未對正式工單執行測試送出、取消、核准等交易。

## 注意：還原前必須先核對
舊索引會禁止「已取消」與後續有效申請共存，因此未來一旦有人完成同日重報，**不能直接還原舊索引**；應先評估現存資料，避免還原失敗或把已取消紀錄當成有效資料。

## 狀態
DB 正式規則已生效；員工 V1.1.43 前端無需改動，後端提交預檢早已排除「已取消」「已駁回」。實際跨系統申請至 Google 月表尚需在正常業務流程驗收。
