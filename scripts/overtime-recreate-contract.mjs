// Read-only contract validation for deleted-account re-registration and temporary passwords.
// No real auth attempts, password resets or account changes.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const source=readFileSync("integrations/overtime-supabase/overtime-auth/index.ts","utf8");
const body=source.match(/function validPass\(p:any\).*?\nfunction validTemporaryPass\(p:any\).*?\n/);
assert(body,"Both permanent and temporary password validators must exist");
const exec=body[0].replaceAll("p:any","p");
const context={};
runInNewContext(exec+"this.check=[validPass,validTemporaryPass];",context);
const [permanent,temporary]=context.check;
assert.equal(temporary("1234"),true);
assert.equal(permanent("1234"),false);
assert.equal(temporary("abcd"),true);
assert.equal(permanent("abcd"),true);
assert.equal(temporary("123"),false);
assert.equal(temporary("x".repeat(73)),false);
assert(source.includes('role:"supervisor",salt_b64:salt,hash_b64:hash,iterations:ITERATIONS,must_change:false'),"New supervisor must be able to sign in without forced password change");
assert(source.includes('hash_b64:hash,iterations:ITERATIONS,must_change:false,updated_at:'),"Reset supervisor must be able to sign in without forced password change");
assert(source.includes('if(existing)return answer({ok:false,error:"此帳號目前已存在'),"Existing accounts must not be recreated");
assert(!source.includes("deleted_usernames")&&!source.includes("blacklist"),"Deleted account names must not be permanently denied");
assert(source.includes('return answer({ok:true,message:"已建立主管帳號'),"Success should explain temporary password rule");
assert(source.includes('if(action==="change-password")'),"Voluntary password change must remain available");
assert(source.includes('if(!validPass(next))'),"Changing password must still reject 1234 as permanent new password");
console.log("PASS deleted account reuse, default login without mandatory change, voluntary password update");
