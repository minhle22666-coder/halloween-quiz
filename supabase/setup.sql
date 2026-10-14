-- ============================================================
--  Haunted Quiz — Supabase setup (run once in: Dashboard → SQL Editor → New query → Run)
--  Creates the table that stores every saved quiz version + 2 functions that
--  check the game-master code. The code lives only here, never in the website JS.
--  To change the code: edit 'BOS-HOST' in BOTH functions below and run this file again.
-- ============================================================

create table if not exists public.quiz_versions (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  questions   jsonb not null
);

alter table public.quiz_versions enable row level security;

-- everyone (players, big screen) may READ the quiz; nobody may write directly
drop policy if exists "quiz readable by everyone" on public.quiz_versions;
create policy "quiz readable by everyone" on public.quiz_versions
  for select to anon, authenticated using (true);

grant select on public.quiz_versions to anon, authenticated;

-- is this the game-master code?
create or replace function public.check_host_code(p_code text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select upper(trim(coalesce(p_code, ''))) = 'BOS-HOST';
$$;

-- save a new quiz version (only with the right code) → returns the version number
create or replace function public.save_quiz(p_code text, p_questions jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if upper(trim(coalesce(p_code, ''))) <> 'BOS-HOST' then
    raise exception 'Wrong game-master code';
  end if;
  if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception 'The quiz needs at least one question';
  end if;
  if jsonb_array_length(p_questions) > 100 then
    raise exception 'Too many questions (max 100)';
  end if;
  insert into public.quiz_versions (questions) values (p_questions) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.check_host_code(text) from public;
revoke all on function public.save_quiz(text, jsonb) from public;
grant execute on function public.check_host_code(text) to anon, authenticated;
grant execute on function public.save_quiz(text, jsonb) to anon, authenticated;

-- quick check: should return one row per saved version (empty at first)
select id, created_at, jsonb_array_length(questions) as questions from public.quiz_versions order by id desc;
