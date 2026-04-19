-- Hines Family Calendar — Supabase schema
-- Run this once in your Supabase project SQL editor (Database → SQL Editor → New query).

create table if not exists events (
  id text primary key,
  title text not null,
  type text not null check (type in ('activity', 'vacation')),
  status text not null check (status in ('confirmed', 'prospective')),
  start_date date not null,
  end_date date not null,
  members text[] not null default '{}',
  notes text default '',
  vacation jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists events_date_idx on events (start_date, end_date);

-- Row Level Security: allow public read/write (fine for a small family app where
-- only people with the site URL know about it). Tighten later if desired.
alter table events enable row level security;

drop policy if exists "public read" on events;
drop policy if exists "public insert" on events;
drop policy if exists "public update" on events;
drop policy if exists "public delete" on events;

create policy "public read"   on events for select using (true);
create policy "public insert" on events for insert with check (true);
create policy "public update" on events for update using (true) with check (true);
create policy "public delete" on events for delete using (true);

-- Enable realtime so every phone syncs instantly.
-- In the Supabase dashboard: Database → Replication → turn on realtime for the
-- `events` table. (Or run the statement below.)
alter publication supabase_realtime add table events;
