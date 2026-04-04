import type { Session, User } from "@supabase/supabase-js";

import { createSyncId } from "@/utils/id";
import { getSupabaseClient, getSupabaseSession } from "@/utils/supabase";

export type StoreSummary = {
  id: string;
  name: string;
  ownerUserId: string;
  role: string;
};

function sanitizeStoreName(storeName: string) {
  const normalized = storeName.trim().replace(/\s+/g, " ");

  if (normalized.length < 2) {
    throw new Error("Store name must be at least 2 characters.");
  }

  return normalized.slice(0, 80);
}

export async function getCurrentSession() {
  return getSupabaseSession();
}

export async function getCurrentUser(): Promise<User | null> {
  const session = await getCurrentSession();
  return session?.user ?? null;
}

export async function signInWithPassword(email: string, password: string) {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data.session;
}

export async function signUpWithPassword(email: string, password: string) {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.signUp({
    email: email.trim(),
    password,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data.session;
}

export async function signOutUser() {
  const client = getSupabaseClient();
  const { error } = await client.auth.signOut();

  if (error) {
    throw new Error(error.message);
  }
}

export async function ensureProfile(user: User) {
  const client = getSupabaseClient();
  const { error } = await client.from("profiles").upsert(
    {
      user_id: user.id,
      email: user.email ?? "",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id", ignoreDuplicates: false },
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function listStoresForCurrentUser(): Promise<StoreSummary[]> {
  const client = getSupabaseClient();
  const user = await getCurrentUser();

  if (!user) {
    return [];
  }

  const { data: memberships, error: membershipError } = await client
    .from("store_memberships")
    .select("store_id, role")
    .eq("user_id", user.id);

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  if (!memberships || memberships.length === 0) {
    return [];
  }

  const storeIds = memberships.map((membership) => membership.store_id);
  const { data: stores, error: storesError } = await client
    .from("stores")
    .select("id, name, owner_user_id")
    .in("id", storeIds);

  if (storesError) {
    throw new Error(storesError.message);
  }

  const membershipsByStoreId = new Map(
    memberships.map((membership) => [membership.store_id, membership.role]),
  );

  return (stores ?? []).map((store) => ({
    id: store.id,
    name: store.name,
    ownerUserId: store.owner_user_id,
    role: membershipsByStoreId.get(store.id) ?? "viewer",
  }));
}

export async function createStoreForCurrentUser(storeName: string) {
  const client = getSupabaseClient();
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("You must be signed in to create a store.");
  }

  const normalizedStoreName = sanitizeStoreName(storeName);
  const storeId = createSyncId();

  const { error: storeError } = await client.from("stores").insert({
    id: storeId,
    name: normalizedStoreName,
    owner_user_id: user.id,
  });

  if (storeError) {
    throw new Error(storeError.message);
  }

  const { error: membershipError } = await client.from("store_memberships").insert({
    store_id: storeId,
    user_id: user.id,
    role: "owner",
  });

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  return {
    id: storeId,
    name: normalizedStoreName,
    ownerUserId: user.id,
    role: "owner",
  } satisfies StoreSummary;
}

export function subscribeToAuthChanges(callback: (session: Session | null) => void) {
  const client = getSupabaseClient();
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });

  return () => {
    data.subscription.unsubscribe();
  };
}
