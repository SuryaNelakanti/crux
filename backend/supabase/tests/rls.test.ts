/**
 * RLS Policy Tests for Supabase
 *
 * These tests validate that Row Level Security policies work correctly
 * and don't cause stack depth exceeded errors.
 *
 * Prerequisites:
 * - Local Supabase running: `pnpm supabase:start`
 * - Fresh database: `pnpm supabase:reset`
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Local Supabase default credentials
const SUPABASE_URL = 'http://127.0.0.1:54321';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

// Test user credentials
const TEST_USER_EMAIL = 'test-owner@example.com';
const TEST_USER_PASSWORD = 'test-password-123';
const TEST_MEMBER_EMAIL = 'test-member@example.com';
const TEST_MEMBER_PASSWORD = 'test-password-456';
const TEST_OUTSIDER_EMAIL = 'test-outsider@example.com';
const TEST_OUTSIDER_PASSWORD = 'test-password-789';

describe('RLS Policies', () => {
  let adminClient: SupabaseClient;
  let ownerClient: SupabaseClient;
  let memberClient: SupabaseClient;
  let outsiderClient: SupabaseClient;

  let ownerId: string;
  let memberId: string;
  let outsiderId: string;
  let sessionId: string;
  let problemId: string;

  beforeAll(async () => {
    // Admin client for setup (bypasses RLS)
    adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Create test users via admin API
    const createUser = async (email: string, password: string) => {
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error && !error.message.includes('already been registered')) {
        throw error;
      }
      // Get existing user if already exists
      if (!data?.user) {
        const { data: users } = await adminClient.auth.admin.listUsers();
        const user = users?.users?.find((u) => u.email === email);
        return user?.id;
      }
      return data.user.id;
    };

    ownerId = (await createUser(TEST_USER_EMAIL, TEST_USER_PASSWORD))!;
    memberId = (await createUser(TEST_MEMBER_EMAIL, TEST_MEMBER_PASSWORD))!;
    outsiderId = (await createUser(TEST_OUTSIDER_EMAIL, TEST_OUTSIDER_PASSWORD))!;

    // Ensure users exist in public.users table
    await adminClient.from('users').upsert([
      { id: ownerId },
      { id: memberId },
      { id: outsiderId },
    ]);

    // Create authenticated clients
    const createAuthClient = async (email: string, password: string) => {
      const client = createClient(SUPABASE_URL, ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return client;
    };

    ownerClient = await createAuthClient(TEST_USER_EMAIL, TEST_USER_PASSWORD);
    memberClient = await createAuthClient(TEST_MEMBER_EMAIL, TEST_MEMBER_PASSWORD);
    outsiderClient = await createAuthClient(TEST_OUTSIDER_EMAIL, TEST_OUTSIDER_PASSWORD);

    // Create test session via admin
    const { data: session } = await adminClient
      .from('sessions')
      .insert({ user_id: ownerId, start_ts: new Date().toISOString() })
      .select()
      .single();
    sessionId = session!.id;

    // Create test problem via admin
    const { data: problem } = await adminClient
      .from('problems')
      .insert({
        created_by: ownerId,
        created_in_session_id: sessionId,
      })
      .select()
      .single();
    problemId = problem!.id;

    // Add member to problem
    await adminClient.from('problem_members').insert({
      problem_id: problemId,
      user_id: memberId,
      role: 'member',
    });
  });

  afterAll(async () => {
    // Cleanup
    await adminClient.from('problems').delete().eq('id', problemId);
    await adminClient.from('sessions').delete().eq('id', sessionId);
  });

  describe('Problems table', () => {
    it('owner can select their own problems without stack depth error', async () => {
      const { data, error } = await ownerClient
        .from('problems')
        .select('id, created_in_session_id')
        .eq('id', problemId);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0].id).toBe(problemId);
    });

    it('member can select shared problems', async () => {
      const { data, error } = await memberClient
        .from('problems')
        .select('id')
        .eq('id', problemId);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it('outsider cannot select problems they have no access to', async () => {
      const { data, error } = await outsiderClient
        .from('problems')
        .select('id')
        .eq('id', problemId);

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('querying problems with IN filter does not cause stack depth error', async () => {
      // This is the specific query pattern that was failing
      const { data, error } = await ownerClient
        .from('problems')
        .select('id, created_in_session_id')
        .in('created_in_session_id', [sessionId, 'fake-uuid-1', 'fake-uuid-2']);

      expect(error).toBeNull();
      expect(data).toBeDefined();
      // Should not throw stack depth error
    });
  });

  describe('Storage: Photos bucket', () => {
    const testFileName = `${problemId}/test-photo.jpg`;
    const testFileContent = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header

    afterEach(async () => {
      // Cleanup uploaded files
      await adminClient.storage.from('photos').remove([testFileName]);
    });

    it('owner can upload photos without stack depth error', async () => {
      const { error } = await ownerClient.storage
        .from('photos')
        .upload(testFileName, testFileContent, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      // Should not have stack depth error
      expect(error?.message).not.toContain('stack depth limit exceeded');
    });

    it('member can upload photos to shared problem', async () => {
      const { error } = await memberClient.storage
        .from('photos')
        .upload(testFileName, testFileContent, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      // Members have access but may not have manage permission
      // The important thing is no stack depth error
      if (error) {
        expect(error.message).not.toContain('stack depth limit exceeded');
      }
    });

    it('outsider cannot upload photos', async () => {
      const { error } = await outsiderClient.storage
        .from('photos')
        .upload(testFileName, testFileContent, {
          contentType: 'image/jpeg',
        });

      expect(error).not.toBeNull();
      expect(error?.message).not.toContain('stack depth limit exceeded');
    });
  });

  describe('Media table (regression test)', () => {
    it('inserting media does not cause stack depth error', async () => {
      const { data, error } = await ownerClient.from('media').insert({
        problem_id: problemId,
        type: 'photo',
        storage_path: `${problemId}/test.jpg`,
        width: 100,
        height: 100,
      }).select();

      expect(error?.message).not.toContain('stack depth limit exceeded');
      
      // Cleanup
      if (data?.[0]?.id) {
        await adminClient.from('media').delete().eq('id', data[0].id);
      }
    });
  });
});
