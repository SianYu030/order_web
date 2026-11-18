-- Applied 2026-11-18 to mjcbixcgbcybtciribar.
-- Preserve historical audit entries when supervisor sign-in accounts are deleted.
alter table public.overtime_auth_log add column if not exists actor_username_snapshot text;
create or replace function public.overtime_delete_supervisor(p_username text,p_admin_id uuid)
returns boolean language plpgsql security invoker set search_path=public as $function$
declare target_record record;
begin
 if current_user <> 'service_role' then raise exception 'Operation is restricted to backend service'; end if;
 if not exists (select 1 from public.overtime_accounts where id=p_admin_id and role='admin' and enabled=true and must_change=false)
 then raise exception 'Administrator account invalid'; end if;
 select id,username into target_record from public.overtime_accounts
 where lower(username)=lower(btrim(p_username)) and role='supervisor' and id<>p_admin_id for update;
 if not found then return false; end if;
 update public.overtime_auth_log
 set actor_username_snapshot=coalesce(actor_username_snapshot,target_record.username),actor_id=null
 where actor_id=target_record.id;
 delete from public.overtime_accounts where id=target_record.id and role='supervisor';
 if not found then raise exception 'Concurrent account removal detected'; end if;
 delete from public.overtime_attempts where lower(username)=lower(target_record.username);
 insert into public.overtime_auth_log(actor_id,action,subject) values(p_admin_id,'delete-user',target_record.username);
 return true;
end;
$function$;
revoke all on function public.overtime_delete_supervisor(text,uuid) from public,anon,authenticated;
grant execute on function public.overtime_delete_supervisor(text,uuid) to service_role;
