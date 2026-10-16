-- ============================================================
--  BOS Quiz — many quizzes, each with its own theme
--  Safe to run again (e.g. after an update): nothing is deleted, new columns are added.
--  Supabase Dashboard → SQL Editor → New query → paste everything → Run
--  (setup.sql must have been run before; media-setup.sql is still needed for uploads.)
--
--  • table "quizzes": one row per quiz (title, theme, palette, questions)
--  • nobody can read/write the table directly — only through the functions below,
--    which all check the game-master code (so players never see the answers)
--  • your current quiz (last saved version) is copied in once as a Halloween quiz
--  • To change the code: edit 'BOS-HOST' in quiz_code_ok() below (+ setup.sql, media-setup.sql)
-- ============================================================

create table if not exists public.quizzes (
  id          uuid primary key default gen_random_uuid(),
  title       text not null default 'BOS Quiz',
  subtitle    text not null default '',
  theme       text not null default 'default',
  palette     text not null default '',
  questions   jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.quizzes add column if not exists settings jsonb not null default '{}'::jsonb;   -- music, …
alter table public.quizzes enable row level security;   -- no policies = no direct access

create or replace function public.quiz_code_ok(p_code text)
returns boolean language sql immutable as $$
  select upper(trim(coalesce(p_code, ''))) = 'BOS-HOST';
$$;

-- list (no questions, just what the library cards need)
create or replace function public.list_quizzes(p_code text)
returns table (id uuid, title text, subtitle text, theme text, palette text, n int, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.quiz_code_ok(p_code) then raise exception 'Wrong game-master code'; end if;
  return query select q.id, q.title, q.subtitle, q.theme, q.palette, jsonb_array_length(q.questions), q.created_at, q.updated_at
    from public.quizzes q order by q.updated_at desc;
end $$;

-- one full quiz (with questions)
create or replace function public.get_quiz(p_code text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.quiz_code_ok(p_code) then raise exception 'Wrong game-master code'; end if;
  select to_jsonb(q) into r from public.quizzes q where q.id = p_id;
  if r is null then raise exception 'Quiz not found'; end if;
  return r;
end $$;

-- create (no id) or update (with id) → returns the id
create or replace function public.upsert_quiz(p_code text, p_quiz jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_q jsonb;
begin
  if not public.quiz_code_ok(p_code) then raise exception 'Wrong game-master code'; end if;
  v_q := coalesce(p_quiz->'questions', '[]'::jsonb);
  if jsonb_typeof(v_q) <> 'array' then raise exception 'questions must be a list'; end if;
  if jsonb_array_length(v_q) > 200 then raise exception 'Too many questions (max 200)'; end if;
  v_id := nullif(p_quiz->>'id', '')::uuid;
  if v_id is not null and exists (select 1 from public.quizzes where id = v_id) then
    update public.quizzes set
      title = left(coalesce(p_quiz->>'title', title), 80),
      subtitle = left(coalesce(p_quiz->>'subtitle', subtitle), 80),
      theme = coalesce(p_quiz->>'theme', theme),
      palette = coalesce(p_quiz->>'palette', palette),
      settings = coalesce(p_quiz->'settings', settings),
      questions = v_q,
      updated_at = now()
    where id = v_id;
  else
    insert into public.quizzes (title, subtitle, theme, palette, settings, questions)
    values (left(coalesce(p_quiz->>'title', 'BOS Quiz'), 80), left(coalesce(p_quiz->>'subtitle', ''), 80),
            coalesce(p_quiz->>'theme', 'default'), coalesce(p_quiz->>'palette', ''), coalesce(p_quiz->'settings', '{}'::jsonb), v_q)
    returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.delete_quiz(p_code text, p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.quiz_code_ok(p_code) then raise exception 'Wrong game-master code'; end if;
  delete from public.quizzes where id = p_id;
  return found;
end $$;

revoke all on function public.list_quizzes(text) from public;
revoke all on function public.get_quiz(text, uuid) from public;
revoke all on function public.upsert_quiz(text, jsonb) from public;
revoke all on function public.delete_quiz(text, uuid) from public;
grant execute on function public.list_quizzes(text) to anon, authenticated;
grant execute on function public.get_quiz(text, uuid) to anon, authenticated;
grant execute on function public.upsert_quiz(text, jsonb) to anon, authenticated;
grant execute on function public.delete_quiz(text, uuid) to anon, authenticated;

-- copy the quiz you already made (latest saved version) once, as a Halloween quiz
insert into public.quizzes (title, subtitle, theme, palette, questions)
select 'BOS Quiz', 'Halloween Night', 'halloween', 'purple', v.questions
from public.quiz_versions v
where not exists (select 1 from public.quizzes)
order by v.id desc
limit 1;

-- quick check: one row per quiz
select id, title, theme, jsonb_array_length(questions) as questions, updated_at from public.quizzes order by updated_at desc;
