# 刪除主管帳號 V1.1.21
- 來源：正式 Supabase Edge Function overtime-auth v3。
- 刪除 UI：只有 3109 等 admin 角色在「主管帳號管理」看到；每次先確認、再輸入完整帳號。
- API：`delete` 需有效且已完成初始密碼變更的管理員登入，並且 `confirm_username` 精確吻合。
- DB：`overtime_delete_supervisor` 原子化刪除 supervisor 登入帳號，原登入工作階段由 FK cascade 失效。原稽核紀錄 snapshot 保留歷史帳號名稱、工單和工時不刪除。不可刪 admin。
- 只有 service_role 可 execute；這裡沒有帳號密碼或私密金鑰。
- 建立功能時不得實際刪除 1494 或 kurt；手動點選刪除及兩階段確認才會執行。
