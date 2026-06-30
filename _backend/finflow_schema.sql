-- ============================================================
--  FinFlow — Banco de dados por usuário + segurança (RLS)
--  Como usar: Supabase → SQL Editor → cole tudo → RUN.
-- ============================================================

-- 1) Tabela: um documento JSONB por usuário
create table if not exists public.finflow_data (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2) Liga o Row Level Security (sem isso, ninguém acessa nada)
alter table public.finflow_data enable row level security;

-- 3) Políticas: cada usuário só acessa a PRÓPRIA linha (user_id = auth.uid())
drop policy if exists "finflow_select_own" on public.finflow_data;
create policy "finflow_select_own"
  on public.finflow_data for select
  using (auth.uid() = user_id);

drop policy if exists "finflow_insert_own" on public.finflow_data;
create policy "finflow_insert_own"
  on public.finflow_data for insert
  with check (auth.uid() = user_id);

drop policy if exists "finflow_update_own" on public.finflow_data;
create policy "finflow_update_own"
  on public.finflow_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "finflow_delete_own" on public.finflow_data;
create policy "finflow_delete_own"
  on public.finflow_data for delete
  using (auth.uid() = user_id);

-- 4) updated_at automático a cada alteração
create or replace function public.finflow_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists finflow_touch on public.finflow_data;
create trigger finflow_touch
  before update on public.finflow_data
  for each row execute function public.finflow_touch_updated_at();
