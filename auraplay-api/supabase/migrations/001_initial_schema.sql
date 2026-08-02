begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

create or replace function public.normalize_title(value text)
returns text language sql stable strict set search_path = '' as $$
  select trim(regexp_replace(
    regexp_replace(lower(extensions.unaccent(value)), '[^[:alnum:]]+', ' ', 'g'),
    '\s+', ' ', 'g'
  ));
$$;

create type public.playback_status as enum (
  'METADATA_ONLY', 'MATCH_PENDING', 'MATCHING', 'MATCHED', 'SYNCING',
  'READY', 'UNAVAILABLE', 'ERROR', 'NEEDS_REVIEW'
);
create type public.match_status as enum (
  'PENDING', 'AUTO_MATCHED', 'MATCHED', 'NOT_FOUND', 'AMBIGUOUS',
  'NEEDS_REVIEW', 'REJECTED'
);
create type public.sync_job_status as enum ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');
create type public.audio_type as enum ('SUB', 'DUB', 'MULTI');

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.animes (
  id uuid primary key default extensions.gen_random_uuid(),
  anilist_id integer not null unique check (anilist_id > 0),
  mal_id integer check (mal_id is null or mal_id > 0),
  title_romaji text,
  title_english text,
  title_native text,
  preferred_title text not null check (length(trim(preferred_title)) > 0),
  description text,
  cover_url text,
  banner_url text,
  average_score smallint check (average_score between 0 and 100),
  popularity integer check (popularity is null or popularity >= 0),
  trending integer check (trending is null or trending >= 0),
  genres text[] not null default '{}',
  format text,
  status text,
  season text,
  season_year smallint check (season_year is null or season_year between 1900 and 2200),
  start_date date,
  end_date date,
  expected_episode_count integer check (expected_episode_count is null or expected_episode_count >= 0),
  available_episode_count integer not null default 0 check (available_episode_count >= 0),
  playback_status public.playback_status not null default 'METADATA_ONLY',
  next_airing_episode integer check (next_airing_episode is null or next_airing_episode > 0),
  next_airing_at timestamptz,
  last_metadata_sync_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (end_date is null or start_date is null or end_date >= start_date),
  check (playback_status <> 'READY' or available_episode_count > 0)
);
create unique index animes_mal_id_uidx on public.animes (mal_id) where mal_id is not null;
create index animes_playback_status_idx on public.animes (playback_status);
create index animes_season_idx on public.animes (season_year desc, season);
create index animes_updated_at_idx on public.animes (updated_at desc);
create trigger animes_set_updated_at before update on public.animes
for each row execute function public.set_updated_at();

create table public.anime_titles (
  id uuid primary key default extensions.gen_random_uuid(),
  anime_id uuid not null references public.animes(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  normalized_title text not null check (length(trim(normalized_title)) > 0),
  language text not null default 'und',
  title_type text not null check (title_type in ('ROMAJI','ENGLISH','NATIVE','PORTUGUESE','SYNONYM')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (anime_id, normalized_title, language, title_type)
);
create index anime_titles_anime_id_idx on public.anime_titles (anime_id);
create index anime_titles_normalized_title_idx on public.anime_titles (normalized_title);
create index anime_titles_trgm_idx on public.anime_titles using gin (normalized_title extensions.gin_trgm_ops);

create table public.anime_relations (
  id uuid primary key default extensions.gen_random_uuid(),
  anime_id uuid not null references public.animes(id) on delete cascade,
  related_anilist_id integer not null check (related_anilist_id > 0),
  relation_type text not null check (length(trim(relation_type)) > 0),
  created_at timestamptz not null default timezone('utc', now()),
  unique (anime_id, related_anilist_id, relation_type)
);
create index anime_relations_anime_id_idx on public.anime_relations (anime_id);
create index anime_relations_related_anilist_id_idx on public.anime_relations (related_anilist_id);

create table public.catalog_sections (
  id uuid primary key default extensions.gen_random_uuid(),
  key text not null unique check (key in ('featured','popularSeason','recentReleases','airingNow')),
  title text not null check (length(trim(title)) > 0),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.catalog_entries (
  section_id uuid not null references public.catalog_sections(id) on delete cascade,
  anime_id uuid not null references public.animes(id) on delete cascade,
  position integer not null check (position >= 0),
  score numeric,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (section_id, anime_id),
  unique (section_id, position)
);
create index catalog_entries_anime_id_idx on public.catalog_entries (anime_id);
create index catalog_entries_order_idx on public.catalog_entries (section_id, position);

create table public.provider_animes (
  id uuid primary key default extensions.gen_random_uuid(),
  anime_id uuid references public.animes(id) on delete set null,
  provider_key text not null check (length(trim(provider_key)) > 0),
  provider_anime_id text not null check (length(trim(provider_anime_id)) > 0),
  provider_title text not null check (length(trim(provider_title)) > 0),
  match_status public.match_status not null default 'PENDING',
  match_confidence numeric(5,4) check (match_confidence is null or match_confidence between 0 and 1),
  match_method text,
  last_sync_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (provider_key, provider_anime_id),
  unique (provider_key, anime_id),
  check (match_status not in ('AUTO_MATCHED','MATCHED') or anime_id is not null),
  check (match_status <> 'AUTO_MATCHED' or match_confidence >= 0.85)
);
create index provider_animes_anime_id_idx on public.provider_animes (anime_id);
create index provider_animes_provider_id_idx on public.provider_animes (provider_anime_id);
create index provider_animes_match_status_idx on public.provider_animes (match_status);
create trigger provider_animes_set_updated_at before update on public.provider_animes
for each row execute function public.set_updated_at();

create table public.seasons (
  id uuid primary key default extensions.gen_random_uuid(),
  anime_id uuid not null references public.animes(id) on delete cascade,
  provider_key text not null,
  provider_anime_id text not null,
  provider_season_id text not null,
  season_number integer not null check (season_number >= 0),
  title text,
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (provider_key, provider_anime_id, provider_season_id),
  unique (anime_id, provider_key, season_number, provider_season_id),
  unique (id, anime_id),
  foreign key (provider_key, provider_anime_id)
    references public.provider_animes(provider_key, provider_anime_id) on delete cascade
);
create index seasons_anime_id_idx on public.seasons (anime_id);
create index seasons_provider_anime_id_idx on public.seasons (provider_anime_id);
create index seasons_order_idx on public.seasons (anime_id, display_order, season_number);
create trigger seasons_set_updated_at before update on public.seasons
for each row execute function public.set_updated_at();

create table public.episodes (
  id uuid primary key default extensions.gen_random_uuid(),
  anime_id uuid not null references public.animes(id) on delete cascade,
  season_id uuid not null,
  provider_episode_id text not null check (length(trim(provider_episode_id)) > 0),
  episode_number numeric(8,2) not null check (episode_number >= 0),
  absolute_number integer check (absolute_number is null or absolute_number >= 0),
  title text,
  description text,
  duration_seconds integer check (duration_seconds is null or duration_seconds > 0),
  thumbnail_url text,
  aired_at timestamptz,
  available boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (season_id, provider_episode_id),
  unique (season_id, episode_number),
  foreign key (season_id, anime_id) references public.seasons(id, anime_id) on delete cascade
);
create index episodes_anime_id_idx on public.episodes (anime_id);
create index episodes_season_id_idx on public.episodes (season_id);
create index episodes_provider_episode_id_idx on public.episodes (provider_episode_id);
create index episodes_available_idx on public.episodes (anime_id, available);
create trigger episodes_set_updated_at before update on public.episodes
for each row execute function public.set_updated_at();

create table public.episode_sources (
  id uuid primary key default extensions.gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  provider_key text not null,
  provider_source_id text not null,
  language text,
  audio_type public.audio_type not null,
  quality text,
  available boolean not null default true,
  last_checked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (episode_id, provider_key, provider_source_id, audio_type)
);
create index episode_sources_episode_id_idx on public.episode_sources (episode_id);
create index episode_sources_provider_idx on public.episode_sources (provider_key, provider_source_id);
create index episode_sources_available_idx on public.episode_sources (episode_id, available);
create trigger episode_sources_set_updated_at before update on public.episode_sources
for each row execute function public.set_updated_at();

create table public.sync_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  job_type text not null check (length(trim(job_type)) > 0),
  status public.sync_job_status not null default 'RUNNING',
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  processed_count integer not null default 0 check (processed_count >= 0),
  created_count integer not null default 0 check (created_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  error_summary text,
  metadata jsonb not null default '{}'::jsonb,
  check (finished_at is null or finished_at >= started_at),
  check (status = 'RUNNING' or finished_at is not null)
);
create index sync_jobs_type_started_idx on public.sync_jobs (job_type, started_at desc);
create index sync_jobs_status_idx on public.sync_jobs (status);

create table public.sync_locks (
  lock_key text primary key check (length(trim(lock_key)) > 0),
  acquired_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  owner_id uuid not null,
  check (expires_at > acquired_at)
);
create index sync_locks_expires_at_idx on public.sync_locks (expires_at);

create or replace function public.refresh_anime_availability()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_anime_id uuid;
declare valid_count integer;
begin
  target_anime_id := coalesce(new.anime_id, old.anime_id);
  select count(distinct e.id)::integer into valid_count
  from public.episodes e
  join public.episode_sources s on s.episode_id = e.id
  where e.anime_id = target_anime_id and e.available and s.available;

  update public.animes
  set available_episode_count = valid_count,
      playback_status = case when valid_count > 0 then 'READY'::public.playback_status
        when playback_status = 'READY' then 'MATCHED'::public.playback_status else playback_status end
  where id = target_anime_id;
  return coalesce(new, old);
end;
$$;
create trigger episodes_refresh_availability after insert or update of available or delete on public.episodes
for each row execute function public.refresh_anime_availability();

create or replace function public.refresh_anime_availability_for_id(p_anime_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare valid_count integer;
begin
  select count(distinct e.id)::integer into valid_count
  from public.episodes e join public.episode_sources s on s.episode_id = e.id
  where e.anime_id = p_anime_id and e.available and s.available;
  update public.animes set available_episode_count = valid_count,
    playback_status = case when valid_count > 0 then 'READY'::public.playback_status
      when playback_status = 'READY' then 'MATCHED'::public.playback_status else playback_status end
  where id = p_anime_id;
end;
$$;

create or replace function public.refresh_anime_availability_from_source()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_anime_id uuid;
begin
  select anime_id into target_anime_id from public.episodes where id = coalesce(new.episode_id, old.episode_id);
  perform public.refresh_anime_availability_for_id(target_anime_id);
  return coalesce(new, old);
end;
$$;
create trigger episode_sources_refresh_availability after insert or update of available or delete on public.episode_sources
for each row execute function public.refresh_anime_availability_from_source();

create or replace function public.acquire_sync_lock(
  p_lock_key text, p_owner_id uuid, p_ttl_seconds integer default 300
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_ttl_seconds < 30 or p_ttl_seconds > 3600 then
    raise exception 'invalid lock ttl';
  end if;
  insert into public.sync_locks(lock_key, acquired_at, expires_at, owner_id)
  values (p_lock_key, timezone('utc', now()), timezone('utc', now()) + make_interval(secs => p_ttl_seconds), p_owner_id)
  on conflict (lock_key) do update set
    acquired_at = excluded.acquired_at, expires_at = excluded.expires_at, owner_id = excluded.owner_id
  where public.sync_locks.expires_at <= timezone('utc', now());
  return found;
end;
$$;

create or replace function public.release_sync_lock(p_lock_key text, p_owner_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  delete from public.sync_locks where lock_key = p_lock_key and owner_id = p_owner_id;
  return found;
end;
$$;

create or replace function public.search_animes(p_query text, p_limit integer default 20, p_offset integer default 0)
returns setof public.animes language sql stable security definer set search_path = '' as $$
  select distinct a.* from public.animes a
  join public.anime_titles t on t.anime_id = a.id
  where t.normalized_title OPERATOR(extensions.%) public.normalize_title(p_query)
     or t.normalized_title like '%' || public.normalize_title(p_query) || '%'
  order by a.popularity desc nulls last, a.preferred_title
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
$$;

revoke all on function public.acquire_sync_lock(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.release_sync_lock(text, uuid) from public, anon, authenticated;
revoke all on function public.search_animes(text, integer, integer) from public, anon, authenticated;
revoke all on function public.normalize_title(text) from public, anon, authenticated;
grant execute on function public.acquire_sync_lock(text, uuid, integer) to service_role;
grant execute on function public.release_sync_lock(text, uuid) to service_role;
grant execute on function public.search_animes(text, integer, integer) to service_role;
grant execute on function public.normalize_title(text) to service_role;

alter table public.animes enable row level security;
alter table public.anime_titles enable row level security;
alter table public.anime_relations enable row level security;
alter table public.catalog_sections enable row level security;
alter table public.catalog_entries enable row level security;
alter table public.provider_animes enable row level security;
alter table public.seasons enable row level security;
alter table public.episodes enable row level security;
alter table public.episode_sources enable row level security;
alter table public.sync_jobs enable row level security;
alter table public.sync_locks enable row level security;

revoke all on all tables in schema public from anon, authenticated;

commit;
