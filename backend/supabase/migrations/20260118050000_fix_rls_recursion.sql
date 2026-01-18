-- Migration: Fix recursive RLS policies causing stack depth exceeded errors
-- The helper functions now use SECURITY DEFINER to bypass RLS when checking access

-- ============================================================================
-- Drop existing policies that will be recreated
-- ============================================================================

DROP POLICY IF EXISTS problems_select_access ON public.problems;
DROP POLICY IF EXISTS problem_members_select_access ON public.problem_members;
DROP POLICY IF EXISTS problem_members_insert_owner ON public.problem_members;
DROP POLICY IF EXISTS problem_members_update_owner ON public.problem_members;
DROP POLICY IF EXISTS problem_members_delete_owner ON public.problem_members;
DROP POLICY IF EXISTS media_select_access ON public.media;
DROP POLICY IF EXISTS media_insert_owner ON public.media;
DROP POLICY IF EXISTS media_update_owner ON public.media;
DROP POLICY IF EXISTS media_delete_owner ON public.media;
DROP POLICY IF EXISTS route_masks_select_access ON public.route_masks;
DROP POLICY IF EXISTS route_masks_insert_owner ON public.route_masks;
DROP POLICY IF EXISTS route_masks_update_owner ON public.route_masks;
DROP POLICY IF EXISTS route_masks_delete_owner ON public.route_masks;
DROP POLICY IF EXISTS user_problem_logs_select_access ON public.user_problem_logs;
DROP POLICY IF EXISTS user_problem_logs_insert_self ON public.user_problem_logs;
DROP POLICY IF EXISTS user_problem_logs_update_self ON public.user_problem_logs;
DROP POLICY IF EXISTS tag_suggestions_select_access ON public.tag_suggestions;
DROP POLICY IF EXISTS tag_suggestions_insert_owner ON public.tag_suggestions;
DROP POLICY IF EXISTS tag_suggestions_update_owner ON public.tag_suggestions;
DROP POLICY IF EXISTS tag_suggestions_delete_owner ON public.tag_suggestions;
DROP POLICY IF EXISTS events_insert_own ON public.events;

-- Drop storage policies
DROP POLICY IF EXISTS photos_select_access ON storage.objects;
DROP POLICY IF EXISTS photos_insert_owner ON storage.objects;
DROP POLICY IF EXISTS photos_delete_owner ON storage.objects;
DROP POLICY IF EXISTS masks_select_access ON storage.objects;
DROP POLICY IF EXISTS masks_insert_owner ON storage.objects;
DROP POLICY IF EXISTS masks_delete_owner ON storage.objects;

-- ============================================================================
-- Rewrite helper functions with SECURITY DEFINER
-- These bypass RLS when checking access to avoid infinite recursion
-- ============================================================================

-- can_access_problem: Check if current user can view a problem
-- Uses SECURITY DEFINER to query problem_members without triggering RLS
CREATE OR REPLACE FUNCTION public.can_access_problem(pid uuid, p_created_by uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT auth.uid() IS NOT NULL AND (
        -- User is the creator
        auth.uid() = p_created_by
        -- Or user is a member
        OR EXISTS (
            SELECT 1 FROM public.problem_members m
            WHERE m.problem_id = pid AND m.user_id = auth.uid()
        )
    );
$$;

-- can_manage_problem: Check if current user can modify a problem
-- Uses SECURITY DEFINER to query problem_members without triggering RLS
CREATE OR REPLACE FUNCTION public.can_manage_problem(pid uuid, p_created_by uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT auth.uid() IS NOT NULL AND (
        -- User is the creator
        auth.uid() = p_created_by
        -- Or user is an owner member
        OR EXISTS (
            SELECT 1 FROM public.problem_members m
            WHERE m.problem_id = pid 
              AND m.user_id = auth.uid() 
              AND m.role = 'owner'
        )
    );
$$;

-- ============================================================================
-- Recreate RLS policies - passing created_by to avoid recursion
-- ============================================================================

-- Problems: Pass created_by from the row being evaluated
CREATE POLICY problems_select_access ON public.problems
    FOR SELECT USING (public.can_access_problem(id, created_by));

-- Problem members: Need to join to get created_by
CREATE POLICY problem_members_select_access ON public.problem_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.problems p 
            WHERE p.id = problem_id 
              AND public.can_access_problem(p.id, p.created_by)
        )
    );

CREATE POLICY problem_members_insert_owner ON public.problem_members
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.problems p 
            WHERE p.id = problem_id 
              AND public.can_manage_problem(p.id, p.created_by)
        )
    );

CREATE POLICY problem_members_update_owner ON public.problem_members
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.problems p 
            WHERE p.id = problem_id 
              AND public.can_manage_problem(p.id, p.created_by)
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.problems p 
            WHERE p.id = problem_id 
              AND public.can_manage_problem(p.id, p.created_by)
        )
    );

CREATE POLICY problem_members_delete_owner ON public.problem_members
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.problems p 
            WHERE p.id = problem_id 
              AND public.can_manage_problem(p.id, p.created_by)
        )
    );

-- Media policies
CREATE POLICY media_select_access ON public.media
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.problems p 
            WHERE p.id = problem_id 
              AND public.can_access_problem(p.id, p.created_by)
        )
    );

CREATE POLICY media_insert_owner ON public.media
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.problems p 
            WHERE p.id = problem_id 
              AND public.can_manage_problem(p.id, p.created_by)
        )
    );

CREATE POLICY media_update_owner ON public.media
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.problems p 
            WHERE p.id = problem_id 
              AND public.can_manage_problem(p.id, p.created_by)
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.problems p 
            WHERE p.id = problem_id 
              AND public.can_manage_problem(p.id, p.created_by)
        )
    );

CREATE POLICY media_delete_owner ON public.media
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.problems p 
            WHERE p.id = problem_id 
              AND public.can_manage_problem(p.id, p.created_by)
        )
    );

-- Route masks policies
CREATE POLICY route_masks_select_access ON public.route_masks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.problems p 
            WHERE p.id = problem_id 
              AND public.can_access_problem(p.id, p.created_by)
        )
    );

CREATE POLICY route_masks_insert_owner ON public.route_masks
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.problems p 
            WHERE p.id = problem_id 
              AND public.can_manage_problem(p.id, p.created_by)
        )
    );

CREATE POLICY route_masks_update_owner ON public.route_masks
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.problems p 
            WHERE p.id = problem_id 
              AND public.can_manage_problem(p.id, p.created_by)
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.problems p 
            WHERE p.id = problem_id 
              AND public.can_manage_problem(p.id, p.created_by)
        )
    );

CREATE POLICY route_masks_delete_owner ON public.route_masks
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.problems p 
            WHERE p.id = problem_id 
              AND public.can_manage_problem(p.id, p.created_by)
        )
    );

-- User problem logs policies
CREATE POLICY user_problem_logs_select_access ON public.user_problem_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.problems p 
            WHERE p.id = problem_id 
              AND public.can_access_problem(p.id, p.created_by)
        )
    );

CREATE POLICY user_problem_logs_insert_self ON public.user_problem_logs
    FOR INSERT WITH CHECK (
        user_id = auth.uid() 
        AND EXISTS (
            SELECT 1 FROM public.problems p 
            WHERE p.id = problem_id 
              AND public.can_access_problem(p.id, p.created_by)
        )
    );

CREATE POLICY user_problem_logs_update_self ON public.user_problem_logs
    FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (
        user_id = auth.uid() 
        AND EXISTS (
            SELECT 1 FROM public.problems p 
            WHERE p.id = problem_id 
              AND public.can_access_problem(p.id, p.created_by)
        )
    );

-- Tag suggestions policies
CREATE POLICY tag_suggestions_select_access ON public.tag_suggestions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.problems p 
            WHERE p.id = problem_id 
              AND public.can_access_problem(p.id, p.created_by)
        )
    );

CREATE POLICY tag_suggestions_insert_owner ON public.tag_suggestions
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.problems p 
            WHERE p.id = problem_id 
              AND public.can_manage_problem(p.id, p.created_by)
        )
    );

CREATE POLICY tag_suggestions_update_owner ON public.tag_suggestions
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.problems p 
            WHERE p.id = problem_id 
              AND public.can_manage_problem(p.id, p.created_by)
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.problems p 
            WHERE p.id = problem_id 
              AND public.can_manage_problem(p.id, p.created_by)
        )
    );

CREATE POLICY tag_suggestions_delete_owner ON public.tag_suggestions
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.problems p 
            WHERE p.id = problem_id 
              AND public.can_manage_problem(p.id, p.created_by)
        )
    );

-- Events insert policy
CREATE POLICY events_insert_own ON public.events
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
        AND (
            (problem_id IS NULL AND session_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.sessions s WHERE s.id = session_id AND s.user_id = auth.uid()
            ))
            OR (problem_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.problems p 
                WHERE p.id = problem_id 
                  AND public.can_access_problem(p.id, p.created_by)
            ))
        )
    );

-- ============================================================================
-- Storage policies - extract problem_id from path and look up created_by
-- ============================================================================

-- Helper function to get created_by for a problem (used by storage policies)
CREATE OR REPLACE FUNCTION public.get_problem_created_by(pid uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT created_by FROM public.problems WHERE id = pid LIMIT 1;
$$;

-- Photos bucket policies
CREATE POLICY photos_select_access ON storage.objects
    FOR SELECT USING (
        bucket_id = 'photos'
        AND public.can_access_problem(
            (split_part(name, '/', 1))::uuid,
            public.get_problem_created_by((split_part(name, '/', 1))::uuid)
        )
    );

CREATE POLICY photos_insert_owner ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'photos'
        AND public.can_manage_problem(
            (split_part(name, '/', 1))::uuid,
            public.get_problem_created_by((split_part(name, '/', 1))::uuid)
        )
    );

CREATE POLICY photos_delete_owner ON storage.objects
    FOR DELETE USING (
        bucket_id = 'photos'
        AND public.can_manage_problem(
            (split_part(name, '/', 1))::uuid,
            public.get_problem_created_by((split_part(name, '/', 1))::uuid)
        )
    );

-- Masks bucket policies
CREATE POLICY masks_select_access ON storage.objects
    FOR SELECT USING (
        bucket_id = 'masks'
        AND public.can_access_problem(
            (split_part(name, '/', 1))::uuid,
            public.get_problem_created_by((split_part(name, '/', 1))::uuid)
        )
    );

CREATE POLICY masks_insert_owner ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'masks'
        AND public.can_manage_problem(
            (split_part(name, '/', 1))::uuid,
            public.get_problem_created_by((split_part(name, '/', 1))::uuid)
        )
    );

CREATE POLICY masks_delete_owner ON storage.objects
    FOR DELETE USING (
        bucket_id = 'masks'
        AND public.can_manage_problem(
            (split_part(name, '/', 1))::uuid,
            public.get_problem_created_by((split_part(name, '/', 1))::uuid)
        )
    );
