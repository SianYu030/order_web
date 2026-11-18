alter table public.overtime_accounts add column if not exists display_name text;
do $$
begin
 if not exists(select 1 from pg_constraint where conname='overtime_accounts_display_name_length' and conrelid='public.overtime_accounts'::regclass) then
  alter table public.overtime_accounts add constraint overtime_accounts_display_name_length
   check (display_name is null or (char_length(btrim(display_name)) between 1 and 40 and display_name !~ '[[:cntrl:]]'));
 end if;
end $$;
comment on column public.overtime_accounts.display_name is 'Supervisor name editable by admin; existing accounts may remain NULL.';
