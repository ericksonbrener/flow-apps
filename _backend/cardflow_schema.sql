-- ============================================================
--  CardFlow — Banco de dados por usuário + segurança (RLS)
--  Como usar: Supabase → SQL Editor → cole tudo → RUN.
-- ============================================================

create table if not exists public.cardflow_data (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.cardflow_data enable row level security;

drop policy if exists "cardflow_select_own" on public.cardflow_data;
create policy "cardflow_select_own"
  on public.cardflow_data for select
  using (auth.uid() = user_id);

drop policy if exists "cardflow_insert_own" on public.cardflow_data;
create policy "cardflow_insert_own"
  on public.cardflow_data for insert
  with check (auth.uid() = user_id);

drop policy if exists "cardflow_update_own" on public.cardflow_data;
create policy "cardflow_update_own"
  on public.cardflow_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "cardflow_delete_own" on public.cardflow_data;
create policy "cardflow_delete_own"
  on public.cardflow_data for delete
  using (auth.uid() = user_id);

create or replace function public.cardflow_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists cardflow_touch on public.cardflow_data;
create trigger cardflow_touch
  before update on public.cardflow_data
  for each row execute function public.cardflow_touch_updated_at();
