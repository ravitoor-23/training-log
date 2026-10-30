-- Training Log schema. Everyone in the group can read everyone's data; each person writes their own.

create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.days (
  user_id    uuid not null references public.profiles(user_id) on delete cascade,
  day        date not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table if not exists public.chats (
  user_id    uuid not null references public.profiles(user_id) on delete cascade,
  day        date not null,
  messages   jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table if not exists public.reviews (
  user_id    uuid not null references public.profiles(user_id) on delete cascade,
  id         text not null,
  kind       text not null,
  day        date not null,
  title      text not null,
  body       text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- server-only settings (invite code, owner, import flag); no client policies
create table if not exists public.app_meta (
  key   text primary key,
  value jsonb not null
);

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid());
$$;

alter table public.profiles enable row level security;
alter table public.days     enable row level security;
alter table public.chats    enable row level security;
alter table public.reviews  enable row level security;
alter table public.app_meta enable row level security;

create policy "members read profiles" on public.profiles for select to authenticated using (public.is_member());
create policy "edit own profile"      on public.profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "members read days" on public.days for select to authenticated using (public.is_member());
create policy "insert own days"   on public.days for insert to authenticated with check (user_id = auth.uid() and public.is_member());
create policy "update own days"   on public.days for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "members read chats"   on public.chats   for select to authenticated using (public.is_member());
create policy "members read reviews" on public.reviews for select to authenticated using (public.is_member());

-- private photo/video bucket
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 26214400)
on conflict (id) do nothing;

create policy "members read media" on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.is_member());
create policy "upload own media" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text and public.is_member());
