create extension if not exists pgcrypto;

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.topics(id),
  name text not null default '새 목차',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid references public.topics(id),
  title text not null,
  case_no text not null default '',
  important boolean not null default false,
  api_status text not null default 'manual',
  api_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.case_notes (
  case_id uuid primary key references public.cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  holding_html text not null default '',
  judgment_summary_html text not null default '',
  source_html text not null default '',
  key_phrases_html text not null default '',
  summary_html text not null default '',
  majority_html text not null default '',
  dissent_html text not null default '',
  concurring_html text not null default '',
  tags_html text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.user_ui_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  expanded_topic_ids jsonb not null default '[]'::jsonb,
  collapsed_fields jsonb not null default '[]'::jsonb,
  split_width numeric not null default 52,
  pane_widths jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.topics enable row level security;
alter table public.cases enable row level security;
alter table public.case_notes enable row level security;
alter table public.user_ui_state enable row level security;

create policy "topics own rows" on public.topics for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cases own rows" on public.cases for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "case_notes own rows" on public.case_notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user_ui_state own row" on public.user_ui_state for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists topics_user_parent_idx on public.topics(user_id, parent_id, sort_order);
create index if not exists cases_user_topic_idx on public.cases(user_id, topic_id);
create index if not exists cases_user_important_idx on public.cases(user_id, important);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists topics_set_updated_at on public.topics;
create trigger topics_set_updated_at before update on public.topics
for each row execute function public.set_updated_at();

drop trigger if exists cases_set_updated_at on public.cases;
create trigger cases_set_updated_at before update on public.cases
for each row execute function public.set_updated_at();

drop trigger if exists case_notes_set_updated_at on public.case_notes;
create trigger case_notes_set_updated_at before update on public.case_notes
for each row execute function public.set_updated_at();

drop trigger if exists user_ui_state_set_updated_at on public.user_ui_state;
create trigger user_ui_state_set_updated_at before update on public.user_ui_state
for each row execute function public.set_updated_at();

do $$
begin
  begin
    alter publication supabase_realtime add table public.topics;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.cases;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.case_notes;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.user_ui_state;
  exception when duplicate_object then null;
  end;
end $$;
