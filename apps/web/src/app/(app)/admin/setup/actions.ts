'use server';

import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

type SetupResult = {
  success: boolean;
  steps: string[];
  errors: string[];
};

/**
 * One-time bootstrap: creates chance@diamondos.app as platform admin,
 * ensures current user has proper profile + team membership.
 */
export async function runSetupAction(): Promise<SetupResult> {
  const steps: string[] = [];
  const errors: string[] = [];

  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { success: false, steps, errors: ['Not authenticated.'] };

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // ── Step 1: Ensure current user (cdital5@gmail.com) has a user_profiles row ──
  const { data: existingProfile } = await db
    .from('user_profiles')
    .select('id, first_name, last_name, email')
    .eq('id', user.id)
    .maybeSingle();

  if (!existingProfile) {
    const { error } = await db.from('user_profiles').upsert({
      id: user.id,
      email: user.email,
      first_name: '',
      last_name: '',
    }, { onConflict: 'id' });
    if (error) errors.push(`Create profile: ${error.message}`);
    else steps.push(`Created user_profiles row for ${user.email}`);
  } else {
    steps.push(`Profile exists for ${user.email} (id: ${user.id})`);
    // Backfill email if missing
    if (!existingProfile.email) {
      await db.from('user_profiles').update({ email: user.email }).eq('id', user.id);
      steps.push(`Backfilled email on profile`);
    }
  }

  // ── Step 2: Ensure current user has team membership ──
  const { data: teams } = await db
    .from('teams')
    .select('id, name')
    .eq('created_by', user.id);

  for (const team of teams ?? []) {
    const { data: membership } = await db
      .from('team_members')
      .select('id, role')
      .eq('team_id', team.id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      const { error } = await db.from('team_members').insert({
        team_id: team.id,
        user_id: user.id,
        role: 'head_coach',
        is_active: true,
      });
      if (error) errors.push(`Add to team ${team.name}: ${error.message}`);
      else steps.push(`Added as head_coach to "${team.name}"`);
    } else {
      steps.push(`Already member of "${team.name}" (role: ${membership.role})`);
      // Ensure is_active
      await db.from('team_members')
        .update({ is_active: true })
        .eq('id', membership.id);
    }
  }

  // ── Step 3: Create chance@diamondos.app account ──
  const adminEmail = 'chance@diamondos.app';
  const { data: listData } = await db.auth.admin.listUsers({ perPage: 1000 });
  const existingAdmin = listData?.users?.find((u) => u.email === adminEmail);

  let adminUserId: string;

  if (existingAdmin) {
    adminUserId = existingAdmin.id;
    steps.push(`chance@diamondos.app already exists (id: ${adminUserId})`);
  } else {
    // Create the admin user with a password (they can reset later via magic link)
    const { data: newUser, error: createError } = await db.auth.admin.createUser({
      email: adminEmail,
      email_confirm: true,
      user_metadata: { role: 'platform_admin' },
    });
    if (createError || !newUser?.user) {
      errors.push(`Create admin user: ${createError?.message ?? 'Unknown error'}`);
      return { success: errors.length === 0, steps, errors };
    }
    adminUserId = newUser.user.id;
    steps.push(`Created chance@diamondos.app (id: ${adminUserId})`);
  }

  // ── Step 4: Ensure admin has user_profiles row ──
  const { data: adminProfile } = await db
    .from('user_profiles')
    .select('id')
    .eq('id', adminUserId)
    .maybeSingle();

  if (!adminProfile) {
    const { error } = await db.from('user_profiles').upsert({
      id: adminUserId,
      email: adminEmail,
      first_name: 'Chance',
      last_name: 'Douglass',
      is_platform_admin: true,
    }, { onConflict: 'id' });
    if (error) errors.push(`Create admin profile: ${error.message}`);
    else steps.push(`Created user_profiles row for admin`);
  } else {
    await db.from('user_profiles')
      .update({ is_platform_admin: true, email: adminEmail })
      .eq('id', adminUserId);
    steps.push(`Set is_platform_admin = true on admin profile`);
  }

  // ── Step 5: Add admin to ALL existing teams as head_coach ──
  const { data: allTeams } = await db.from('teams').select('id, name');
  for (const team of allTeams ?? []) {
    const { data: existing } = await db
      .from('team_members')
      .select('id')
      .eq('team_id', team.id)
      .eq('user_id', adminUserId)
      .maybeSingle();

    if (!existing) {
      const { error: tmErr } = await db.from('team_members').insert({
        team_id: team.id,
        user_id: adminUserId,
        role: 'head_coach',
        is_active: true,
      });
      if (tmErr) errors.push(`Add admin to team "${team.name}": ${tmErr.message}`);
      else steps.push(`Added admin as head_coach to "${team.name}"`);
    } else {
      steps.push(`Admin already member of "${team.name}"`);
    }
  }

  // ── Step 6: Also ensure cdital5@gmail.com has team membership ──
  const cditalUser = listData?.users?.find((u) => u.email === 'cdital5@gmail.com');
  if (cditalUser) {
    for (const team of allTeams ?? []) {
      const { data: cditalMembership } = await db
        .from('team_members')
        .select('id')
        .eq('team_id', team.id)
        .eq('user_id', cditalUser.id)
        .maybeSingle();

      if (!cditalMembership) {
        await db.from('team_members').insert({
          team_id: team.id,
          user_id: cditalUser.id,
          role: 'head_coach',
          is_active: true,
        });
        steps.push(`Added cdital5@gmail.com as head_coach to "${team.name}"`);
      } else {
        steps.push(`cdital5@gmail.com already member of "${team.name}"`);
      }
    }
  }

  // ── Step 7: Count all user_profiles and auth.users for diagnostics ──
  const { count: profileCount } = await db
    .from('user_profiles')
    .select('id', { count: 'exact', head: true });

  const totalAuthUsers = listData?.users?.length ?? 0;

  steps.push(`Diagnostics: ${totalAuthUsers} auth users, ${profileCount ?? 0} user_profiles rows`);

  // ── Step 8: Backfill missing user_profiles for any auth users without one ──
  const profileIds = new Set<string>();
  const { data: allProfiles } = await db.from('user_profiles').select('id');
  for (const p of allProfiles ?? []) {
    profileIds.add(p.id);
  }

  let backfillCount = 0;
  for (const authUser of listData?.users ?? []) {
    if (!profileIds.has(authUser.id)) {
      await db.from('user_profiles').upsert({
        id: authUser.id,
        email: authUser.email,
        first_name: '',
        last_name: '',
      }, { onConflict: 'id' });
      backfillCount++;
    }
  }
  if (backfillCount > 0) {
    steps.push(`Backfilled ${backfillCount} missing user_profiles rows`);
  }

  return { success: errors.length === 0, steps, errors };
}

/**
 * Verification: checks every table for any remaining trace of cdital5@gmail.com
 * or "Chance Douglass" data (other than the platform admin account itself).
 */
export async function runVerifyCleanAction(): Promise<SetupResult> {
  const steps: string[] = [];
  const errors: string[] = [];

  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { success: false, steps, errors: ['Not authenticated.'] };

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: allAuthUsers } = await db.auth.admin.listUsers({ perPage: 1000 });

  // Check auth.users
  const cditalAuth = allAuthUsers?.users?.find((u) => u.email === 'cdital5@gmail.com');
  if (cditalAuth) {
    errors.push(`auth.users: cdital5@gmail.com still exists (id: ${cditalAuth.id})`);
  } else {
    steps.push('auth.users: cdital5@gmail.com — not found ✓');
  }

  // Check user_profiles by email
  const { data: profilesByEmail } = await db
    .from('user_profiles')
    .select('id, first_name, last_name, email')
    .eq('email', 'cdital5@gmail.com');
  if ((profilesByEmail ?? []).length > 0) {
    errors.push(`user_profiles: found row(s) with email cdital5@gmail.com`);
  } else {
    steps.push('user_profiles: no rows with cdital5@gmail.com ✓');
  }

  // Check user_profiles by name (excluding the chance@diamondos.app admin profile)
  const adminUser = allAuthUsers?.users?.find((u) => u.email === 'chance@diamondos.app');
  const { data: profilesByName } = await db
    .from('user_profiles')
    .select('id, first_name, last_name, email')
    .or('first_name.ilike.%chance%,last_name.ilike.%douglass%');
  const nonAdminNameMatches = (profilesByName ?? []).filter(
    (p) => p.id !== adminUser?.id,
  );
  if (nonAdminNameMatches.length > 0) {
    errors.push(
      `user_profiles: found name matches outside admin account: ${JSON.stringify(nonAdminNameMatches)}`,
    );
  } else {
    steps.push('user_profiles: no unexpected "Chance Douglass" rows ✓');
  }

  // Check team_members
  if (cditalAuth) {
    const { count } = await db
      .from('team_members')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', cditalAuth.id);
    if ((count ?? 0) > 0) errors.push(`team_members: ${count} row(s) for cdital5`);
    else steps.push('team_members: no rows for cdital5 ✓');
  } else {
    steps.push('team_members: skipped (user already removed) ✓');
  }

  // Check teams table
  const { data: allTeams } = await db.from('teams').select('id, name');
  steps.push(`teams: ${(allTeams ?? []).length} team(s) in database — ${(allTeams ?? []).map((t) => t.name).join(', ') || 'none'}`);

  // Check team_invitations by email
  const { count: inviteCount } = await db
    .from('team_invitations')
    .select('id', { count: 'exact', head: true })
    .eq('email', 'cdital5@gmail.com');
  if ((inviteCount ?? 0) > 0) {
    errors.push(`team_invitations: ${inviteCount} pending invite(s) for cdital5@gmail.com`);
  } else {
    steps.push('team_invitations: no invites for cdital5@gmail.com ✓');
  }

  // Summary of all auth users
  const emailList = (allAuthUsers?.users ?? []).map((u) => u.email).join(', ');
  steps.push(`auth.users total: ${allAuthUsers?.users?.length ?? 0} — [${emailList}]`);

  return { success: errors.length === 0, steps, errors };
}

/**
 * Danger Zone: deletes all teams (cascade) and removes cdital5@gmail.com.
 * Only callable by a platform admin.
 */
export async function runResetAction(): Promise<SetupResult> {
  const steps: string[] = [];
  const errors: string[] = [];

  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { success: false, steps, errors: ['Not authenticated.'] };

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Verify caller is platform admin
  const { data: callerProfile } = await db
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (!callerProfile?.is_platform_admin) {
    return { success: false, steps, errors: ['Not authorized — must be platform admin.'] };
  }

  // Step 1: Delete all games first (games.team_id FK is not CASCADE, blocks team deletion)
  const { data: allGames } = await db.from('games').select('id');
  const allGameIds = (allGames ?? []).map((g) => g.id);
  if (allGameIds.length > 0) {
    // game_events, game_lineups, game_rsvps, pitch_counts cascade from games — delete games directly
    const { error } = await db.from('games').delete().in('id', allGameIds);
    if (error) errors.push(`Delete games: ${error.message}`);
    else steps.push(`Deleted ${allGameIds.length} game(s) and related events/lineups`);
  }

  // Step 2: Delete all teams (cascade removes seasons, team_members, players, channels, etc.)
  const { data: teams } = await db.from('teams').select('id, name');
  for (const team of teams ?? []) {
    const { error } = await db.from('teams').delete().eq('id', team.id);
    if (error) errors.push(`Delete team "${team.name}": ${error.message}`);
    else steps.push(`Deleted team "${team.name}" and all related data`);
  }
  if ((teams ?? []).length === 0) steps.push('No teams found to delete');

  // Step 3: Null out any remaining created_by / sender_id references so user deletion succeeds
  const { data: listData } = await db.auth.admin.listUsers({ perPage: 1000 });
  const targetUser = listData?.users?.find((u) => u.email === 'cdital5@gmail.com');
  if (targetUser) {
    const uid = targetUser.id;
    // Null out non-cascade FK columns that could block auth.users deletion
    await db.from('games').update({ created_by: null }).eq('created_by', uid);
    await db.from('channels').update({ created_by: null }).eq('created_by', uid);
    await db.from('messages').update({ sender_id: null }).eq('sender_id', uid);
    await db.from('team_events').update({ created_by: null }).eq('created_by', uid);
    await db.from('practices').update({ created_by: null }).eq('created_by', uid);
    await db.from('game_events').update({ created_by: null }).eq('created_by', uid);
    await db.from('teams').update({ created_by: null }).eq('created_by', uid);

    const { error } = await db.auth.admin.deleteUser(uid);
    if (error) errors.push(`Delete cdital5@gmail.com: ${error.message}`);
    else steps.push('Deleted cdital5@gmail.com and all associated data');
  } else {
    steps.push('cdital5@gmail.com not found (already removed)');
  }

  return { success: errors.length === 0, steps, errors };
}
