-- IM AI cloud sync + auth schema
-- Run this in Supabase SQL Editor.

create table if not exists public.chats (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  messages jsonb not null default '[]'::jsonb,
  versions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chats_user_updated_idx
  on public.chats(user_id, updated_at desc);

alter table public.chats enable row level security;

drop policy if exists "Users can read their chats" on public.chats;
drop policy if exists "Users can insert their chats" on public.chats;
drop policy if exists "Users can update their chats" on public.chats;
drop policy if exists "Users can delete their chats" on public.chats;

create policy "Users can read their chats"
  on public.chats for select
  using (auth.uid() = user_id);

create policy "Users can insert their chats"
  on public.chats for insert
  with check (auth.uid() = user_id);

create policy "Users can update their chats"
  on public.chats for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their chats"
  on public.chats for delete
  using (auth.uid() = user_id);

create table if not exists public.user_memory (
  user_id uuid primary key references auth.users(id) on delete cascade,
  memory jsonb not null default '{"name":"","facts":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_memory enable row level security;

drop policy if exists "Users can read their memory" on public.user_memory;
drop policy if exists "Users can insert their memory" on public.user_memory;
drop policy if exists "Users can update their memory" on public.user_memory;
drop policy if exists "Users can delete their memory" on public.user_memory;

create policy "Users can read their memory"
  on public.user_memory for select
  using (auth.uid() = user_id);

create policy "Users can insert their memory"
  on public.user_memory for insert
  with check (auth.uid() = user_id);

create policy "Users can update their memory"
  on public.user_memory for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their memory"
  on public.user_memory for delete
  using (auth.uid() = user_id);
