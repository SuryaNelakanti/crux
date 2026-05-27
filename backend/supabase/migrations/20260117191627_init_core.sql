-- Core schema for Crux MVP
create extension if not exists "pgcrypto";

-- ============================================================================
-- Tables
-- ============================================================================

create table if not exists public.users (
    id uuid primary key references auth.users (id) on delete cascade,
    handle text unique,
    created_at timestamptz not null default now()
);

create table if not exists public.sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users (id) on delete cascade,
    start_ts timestamptz not null,
    end_ts timestamptz,
    gym_label text,
    created_at timestamptz not null default now()
);

create table if not exists public.problems (
    id uuid primary key default gen_random_uuid(),
    created_by uuid not null references public.users (id) on delete cascade,
    created_at timestamptz not null default now(),
    created_in_session_id uuid references public.sessions (id) on delete set null,
    primary_media_id uuid,
    photo_phash text
);

create table if not exists public.problem_members (
    problem_id uuid not null references public.problems (id) on delete cascade,
    user_id uuid not null references public.users (id) on delete cascade,
    role text not null check (role in ('owner', 'member')),
    joined_at timestamptz not null default now(),
    primary key (problem_id, user_id)
);

create table if not exists public.problem_share_links (
    id uuid primary key default gen_random_uuid(),
    problem_id uuid not null references public.problems (id) on delete cascade,
    created_by uuid not null references public.users (id) on delete cascade,
    token text not null unique,
    created_at timestamptz not null default now(),
    revoked_at timestamptz,
    expires_at timestamptz
);

create table if not exists public.media (
    id uuid primary key default gen_random_uuid(),
    problem_id uuid not null references public.problems (id) on delete cascade,
    type text not null check (type in ('photo', 'mask')),
    storage_path text not null,
    width integer not null check (width > 0),
    height integer not null check (height > 0),
    created_at timestamptz not null default now(),
    sha256 text,
    bytes integer,
    metadata_json jsonb
);

create table if not exists public.route_masks (
    id uuid primary key default gen_random_uuid(),
    problem_id uuid not null references public.problems (id) on delete cascade,
    version integer not null,
    mask_media_id uuid not null references public.media (id) on delete cascade,
    method text not null check (method in ('auto', 'color-dominant', 'manual-edit', 'seed-color', 'ml-yolo26-seg', 'ml-combo-v1')),
    seed_color_json jsonb,
    confidence numeric,
    metadata_json jsonb,
    created_by uuid not null references public.users (id) on delete cascade,
    created_at timestamptz not null default now(),
    unique (problem_id, version)
);

create table if not exists public.user_problem_logs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users (id) on delete cascade,
    problem_id uuid not null references public.problems (id) on delete cascade,
    session_id uuid not null references public.sessions (id) on delete cascade,
    outcome text not null check (outcome in ('flash', 'send', 'tried', 'project')),
    attempts_count integer,
    grade_min integer,
    grade_max integer,
    note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, problem_id, session_id)
);

create table if not exists public.tag_suggestions (
    id uuid primary key default gen_random_uuid(),
    problem_id uuid not null references public.problems (id) on delete cascade,
    model_version text not null,
    tags_json jsonb not null,
    confidence_json jsonb,
    raw_features_json jsonb,
    created_at timestamptz not null default now()
);

create table if not exists public.events (
    id uuid primary key,
    user_id uuid not null references public.users (id) on delete cascade,
    session_id uuid references public.sessions (id) on delete set null,
    problem_id uuid references public.problems (id) on delete set null,
    type text not null,
    payload_json jsonb not null,
    client_ts timestamptz not null,
    server_ts timestamptz not null default now()
);

create table if not exists public.settings (
    user_id uuid primary key references public.users (id) on delete cascade,
    attempts_mode text not null default 'off' check (attempts_mode in ('off', 'aggregate', 'per_attempt')),
    grade_scale text not null default 'v_scale' check (grade_scale in ('v_scale', 'font', 'custom'))
);

create table if not exists public.pain_logs (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.sessions (id) on delete cascade,
    user_id uuid not null references public.users (id) on delete cascade,
    body_part text not null,
    score integer not null check (score >= 0 and score <= 10),
    ts timestamptz not null default now()
);

alter table public.problems
    add constraint problems_primary_media_fk
    foreign key (primary_media_id) references public.media (id) on delete set null;

-- ============================================================================
-- Indexes
-- ============================================================================

create index if not exists sessions_user_id_idx on public.sessions (user_id);
create index if not exists problems_created_by_idx on public.problems (created_by);
create index if not exists problem_members_user_id_idx on public.problem_members (user_id);
create index if not exists media_problem_id_idx on public.media (problem_id);
create index if not exists route_masks_problem_id_idx on public.route_masks (problem_id);
create index if not exists user_problem_logs_problem_id_idx on public.user_problem_logs (problem_id);
create index if not exists events_problem_id_idx on public.events (problem_id);
create index if not exists events_session_id_idx on public.events (session_id);
create index if not exists events_server_ts_idx on public.events (server_ts);

-- ============================================================================
-- Helper functions for RLS
-- ============================================================================

create or replace function public.can_access_problem(pid uuid)
returns boolean
language sql
stable
as $$
    select exists (
        select 1
        from public.problems p
        where p.id = pid
          and (
            p.created_by = auth.uid()
            or exists (
                select 1
                from public.problem_members m
                where m.problem_id = p.id
                  and m.user_id = auth.uid()
            )
          )
    );
$$;

create or replace function public.can_manage_problem(pid uuid)
returns boolean
language sql
stable
as $$
    select exists (
        select 1
        from public.problems p
        where p.id = pid
          and p.created_by = auth.uid()
    )
    or exists (
        select 1
        from public.problem_members m
        where m.problem_id = pid
          and m.user_id = auth.uid()
          and m.role = 'owner'
    );
$$;

-- ============================================================================
-- Share-link RPCs (security definer)
-- ============================================================================

create or replace function public.resolve_problem_share_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_problem_id uuid;
begin
    if auth.uid() is null then
        raise exception 'not authenticated';
    end if;

    select problem_id
      into v_problem_id
      from public.problem_share_links
     where token = p_token
       and revoked_at is null
       and (expires_at is null or expires_at > now())
     limit 1;

    return v_problem_id;
end;
$$;

create or replace function public.join_problem_with_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_problem_id uuid;
begin
    if auth.uid() is null then
        raise exception 'not authenticated';
    end if;

    v_problem_id := public.resolve_problem_share_token(p_token);

    if v_problem_id is null then
        return null;
    end if;

    insert into public.problem_members (problem_id, user_id, role, joined_at)
    values (v_problem_id, auth.uid(), 'member', now())
    on conflict (problem_id, user_id) do nothing;

    return v_problem_id;
end;
$$;

grant execute on function public.resolve_problem_share_token(text) to authenticated;
grant execute on function public.join_problem_with_token(text) to authenticated;

-- ============================================================================
-- Row level security
-- ============================================================================

alter table public.users enable row level security;
alter table public.sessions enable row level security;
alter table public.problems enable row level security;
alter table public.problem_members enable row level security;
alter table public.problem_share_links enable row level security;
alter table public.media enable row level security;
alter table public.route_masks enable row level security;
alter table public.user_problem_logs enable row level security;
alter table public.tag_suggestions enable row level security;
alter table public.events enable row level security;
alter table public.settings enable row level security;
alter table public.pain_logs enable row level security;

create policy users_select_own on public.users
    for select using (id = auth.uid());
create policy users_insert_self on public.users
    for insert with check (id = auth.uid());
create policy users_update_self on public.users
    for update using (id = auth.uid()) with check (id = auth.uid());

create policy sessions_select_own on public.sessions
    for select using (user_id = auth.uid());
create policy sessions_insert_own on public.sessions
    for insert with check (user_id = auth.uid());
create policy sessions_update_own on public.sessions
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy sessions_delete_own on public.sessions
    for delete using (user_id = auth.uid());

create policy problems_select_access on public.problems
    for select using (public.can_access_problem(id));
create policy problems_insert_own on public.problems
    for insert with check (created_by = auth.uid());
create policy problems_update_own on public.problems
    for update using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy problems_delete_own on public.problems
    for delete using (created_by = auth.uid());

create policy problem_members_select_access on public.problem_members
    for select using (public.can_access_problem(problem_id));
create policy problem_members_insert_owner on public.problem_members
    for insert with check (public.can_manage_problem(problem_id));
create policy problem_members_update_owner on public.problem_members
    for update using (public.can_manage_problem(problem_id)) with check (public.can_manage_problem(problem_id));
create policy problem_members_delete_owner on public.problem_members
    for delete using (public.can_manage_problem(problem_id));

create policy problem_share_links_select_owner on public.problem_share_links
    for select using (created_by = auth.uid());
create policy problem_share_links_insert_owner on public.problem_share_links
    for insert with check (created_by = auth.uid());
create policy problem_share_links_update_owner on public.problem_share_links
    for update using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy problem_share_links_delete_owner on public.problem_share_links
    for delete using (created_by = auth.uid());

create policy media_select_access on public.media
    for select using (public.can_access_problem(problem_id));
create policy media_insert_owner on public.media
    for insert with check (public.can_manage_problem(problem_id));
create policy media_update_owner on public.media
    for update using (public.can_manage_problem(problem_id)) with check (public.can_manage_problem(problem_id));
create policy media_delete_owner on public.media
    for delete using (public.can_manage_problem(problem_id));

create policy route_masks_select_access on public.route_masks
    for select using (public.can_access_problem(problem_id));
create policy route_masks_insert_owner on public.route_masks
    for insert with check (public.can_manage_problem(problem_id));
create policy route_masks_update_owner on public.route_masks
    for update using (public.can_manage_problem(problem_id)) with check (public.can_manage_problem(problem_id));
create policy route_masks_delete_owner on public.route_masks
    for delete using (public.can_manage_problem(problem_id));

create policy user_problem_logs_select_access on public.user_problem_logs
    for select using (public.can_access_problem(problem_id));
create policy user_problem_logs_insert_self on public.user_problem_logs
    for insert with check (user_id = auth.uid() and public.can_access_problem(problem_id));
create policy user_problem_logs_update_self on public.user_problem_logs
    for update using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_access_problem(problem_id));
create policy user_problem_logs_delete_self on public.user_problem_logs
    for delete using (user_id = auth.uid());

create policy tag_suggestions_select_access on public.tag_suggestions
    for select using (public.can_access_problem(problem_id));
create policy tag_suggestions_insert_owner on public.tag_suggestions
    for insert with check (public.can_manage_problem(problem_id));
create policy tag_suggestions_update_owner on public.tag_suggestions
    for update using (public.can_manage_problem(problem_id)) with check (public.can_manage_problem(problem_id));
create policy tag_suggestions_delete_owner on public.tag_suggestions
    for delete using (public.can_manage_problem(problem_id));

create policy events_select_own on public.events
    for select using (user_id = auth.uid());
create policy events_insert_own on public.events
    for insert with check (
        user_id = auth.uid()
        and (
            (problem_id is null and session_id is not null and exists (
                select 1 from public.sessions s where s.id = session_id and s.user_id = auth.uid()
            ))
            or (problem_id is not null and public.can_access_problem(problem_id))
        )
    );

create policy settings_select_own on public.settings
    for select using (user_id = auth.uid());
create policy settings_insert_own on public.settings
    for insert with check (user_id = auth.uid());
create policy settings_update_own on public.settings
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy pain_logs_select_own on public.pain_logs
    for select using (user_id = auth.uid());
create policy pain_logs_insert_own on public.pain_logs
    for insert with check (user_id = auth.uid());
create policy pain_logs_update_own on public.pain_logs
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy pain_logs_delete_own on public.pain_logs
    for delete using (user_id = auth.uid());

-- ============================================================================
-- Storage buckets + policies
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('photos', 'photos', false), ('masks', 'masks', false)
on conflict (id) do nothing;

create policy photos_select_access on storage.objects
    for select using (
        bucket_id = 'photos'
        and public.can_access_problem(split_part(name, '/', 1)::uuid)
    );

create policy photos_insert_owner on storage.objects
    for insert with check (
        bucket_id = 'photos'
        and public.can_manage_problem(split_part(name, '/', 1)::uuid)
    );

create policy photos_delete_owner on storage.objects
    for delete using (
        bucket_id = 'photos'
        and public.can_manage_problem(split_part(name, '/', 1)::uuid)
    );

create policy masks_select_access on storage.objects
    for select using (
        bucket_id = 'masks'
        and public.can_access_problem(split_part(name, '/', 1)::uuid)
    );

create policy masks_insert_owner on storage.objects
    for insert with check (
        bucket_id = 'masks'
        and public.can_manage_problem(split_part(name, '/', 1)::uuid)
    );

create policy masks_delete_owner on storage.objects
    for delete using (
        bucket_id = 'masks'
        and public.can_manage_problem(split_part(name, '/', 1)::uuid)
    );
