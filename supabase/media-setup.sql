-- ============================================================
--  Haunted Quiz — MEDIA for questions (pictures / GIFs / short videos)
--  Run once in: Supabase Dashboard → SQL Editor → New query → paste → Run
--  (setup.sql must have been run before.)
--
--  • Creates a PUBLIC storage bucket "quiz-media" (max 5 MB per file).
--  • Only the game master can upload: the editor first asks for a short-lived
--    upload ticket with the code BOS-HOST, and the storage policy only accepts
--    files inside a folder named after a valid ticket (valid 15 minutes).
--  • To change the code: edit 'BOS-HOST' below (and in setup.sql) and run again.
-- ============================================================

create table if not exists public.media_tickets (
  token       text primary key,
  expires_at  timestamptz not null
);
alter table public.media_tickets enable row level security;   -- no policies → nobody can read it directly

-- game master asks for an upload ticket
create or replace function public.media_ticket(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v text;
begin
  if upper(trim(coalesce(p_code, ''))) <> 'BOS-HOST' then
    raise exception 'Wrong game-master code';
  end if;
  delete from public.media_tickets where expires_at < now();
  v := replace(gen_random_uuid()::text, '-', '');
  insert into public.media_tickets (token, expires_at) values (v, now() + interval '15 minutes');
  return v;
end;
$$;

-- used by the storage policy below
create or replace function public.media_ticket_ok(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.media_tickets where token = p_token and expires_at > now());
$$;

revoke all on function public.media_ticket(text) from public;
revoke all on function public.media_ticket_ok(text) from public;
grant execute on function public.media_ticket(text) to anon, authenticated;
grant execute on function public.media_ticket_ok(text) to anon, authenticated;

-- the bucket (public = anyone can VIEW the files, which the phones need)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quiz-media', 'quiz-media', true, 5242880,
        array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'video/mp4', 'video/webm'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "quiz media upload with ticket" on storage.objects;
create policy "quiz media upload with ticket" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'quiz-media' and public.media_ticket_ok((storage.foldername(name))[1]));

drop policy if exists "quiz media readable" on storage.objects;
create policy "quiz media readable" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'quiz-media');

-- quick check: should return 1 row (quiz-media | true | 5242880)
select id, public, file_size_limit from storage.buckets where id = 'quiz-media';
