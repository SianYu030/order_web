// Read-only contract test. No account deletes or password changes.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const client=readFileSync("overtime/supervisor-auth.js","utf8");
const backend=readFileSync("integrations/overtime-supabase/overtime-auth/index.ts","utf8");
const migration=readFileSync("integrations/overtime-supabase/delete-supervisor.sql","utf8");
assert(client.includes('entry.role==="supervisor"'),"delete control must be available only for supervisor rows");
assert(client.includes('if(!confirm(warning))return;'),"first deletion confirmation required");
assert(client.includes('if(typed!==name)'),"user must retype exact account");
assert(client.includes('call("delete",{username:name,confirm_username:typed})'),"deletion must include matching second confirmation");
assert(backend.includes('if(user.role!=="admin")'),"backend must deny non-admin account management");
assert(backend.includes('if(action==="delete")'),"backend must explicitly handle account deletion");
assert(backend.includes('db.rpc("overtime_delete_supervisor"'),"delete must be transactional and preserve audit logs");
assert(backend.includes('confirmName!==username'),"server must validate typed account");
assert(migration.includes("role='supervisor'"),"database must not delete admin accounts");
assert(migration.includes('actor_username_snapshot'),"historical actor names must remain after deletion");
assert(migration.includes("security invoker"),"backend procedure must not grant definer privileges");
assert(migration.includes("revoke all on function"),"anonymous clients must not invoke deletion RPC");
console.log("PASS supervisor delete UI confirmation, admin authorization, audit and RPC restrictions");
