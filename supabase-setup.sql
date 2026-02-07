-- Run this in your Supabase SQL Editor (supabase.com → your project → SQL Editor)

-- Games table
create table games (
  id text primary key,
  state jsonb not null default '{}'::jsonb,
  phase text not null default 'lobby',
  updated_at timestamptz not null default now()
);

-- Auto-update timestamp on every change (this triggers real-time subscriptions)
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger games_updated_at
  before update on games
  for each row
  execute function update_updated_at();

-- Enable real-time so clients get notified of changes
alter publication supabase_realtime add table games;

-- Row-level security: anyone can read (needed for real-time subscriptions),
-- but only the service role (API routes) can write.
alter table games enable row level security;

create policy "Anyone can read games"
  on games for select
  using (true);

-- No insert/update/delete policies for anon role = anon can't write.
-- Service role bypasses RLS, so API routes (which use the service key) can write freely.
