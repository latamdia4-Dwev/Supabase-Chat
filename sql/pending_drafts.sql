-- Borrador pendiente del chat: una fila por usuario, solo visible para su dueño.
-- Ejecutar una vez en Supabase (SQL Editor). Sin esta tabla, el respaldo
-- solo usa localStorage y se pierde si el navegador lo borra al cerrarse.

create table if not exists public.pending_drafts (
    user_id    uuid primary key references auth.users (id) on delete cascade,
    text       text not null,
    username   text,
    updated_at timestamptz not null default now()
);

alter table public.pending_drafts enable row level security;

drop policy if exists "pending_drafts_select_own" on public.pending_drafts;
drop policy if exists "pending_drafts_insert_own" on public.pending_drafts;
drop policy if exists "pending_drafts_update_own" on public.pending_drafts;
drop policy if exists "pending_drafts_delete_own" on public.pending_drafts;

create policy "pending_drafts_select_own" on public.pending_drafts
    for select to authenticated using (auth.uid() = user_id);
create policy "pending_drafts_insert_own" on public.pending_drafts
    for insert to authenticated with check (auth.uid() = user_id);
create policy "pending_drafts_update_own" on public.pending_drafts
    for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "pending_drafts_delete_own" on public.pending_drafts
    for delete to authenticated using (auth.uid() = user_id);
