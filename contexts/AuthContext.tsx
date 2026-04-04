import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSQLiteContext } from "expo-sqlite";
import type { Session, User } from "@supabase/supabase-js";

import {
  clearAuthMetadata,
  getActiveStoreId,
  getAuthenticatedUserId,
  saveActiveStoreId,
  saveAuthenticatedUserId,
} from "@/db/repositories";
import {
  completeAuthSessionFromUrl,
  createStoreForCurrentUser,
  ensureProfile,
  getCurrentSession,
  isAuthCallbackUrl,
  listStoresForCurrentUser,
  signInWithPassword,
  signOutUser,
  type SignUpResult,
  signUpWithPassword,
  subscribeToAuthChanges,
  type StoreSummary,
} from "@/utils/auth";
import { isSupabaseReady } from "@/utils/supabase";

type AuthContextValue = {
  activeStore: StoreSummary | null;
  activeStoreId: string | null;
  createStore: (storeName: string) => Promise<StoreSummary>;
  isReady: boolean;
  needsStoreSetup: boolean;
  refresh: () => Promise<void>;
  session: Session | null;
  setActiveStore: (storeId: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  stores: StoreSummary[];
  user: User | null;
  completeAuthCallback: (url: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [isReady, setIsReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null);

  const refresh = async () => {
    if (!isSupabaseReady()) {
      setSession(null);
      setStores([]);
      setActiveStoreId(null);
      setIsReady(true);
      return;
    }

    const nextSession = await getCurrentSession();
    setSession(nextSession);

    if (!nextSession?.user) {
      await clearAuthMetadata(db);
      setStores([]);
      setActiveStoreId(null);
      setIsReady(true);
      return;
    }

    await ensureProfile(nextSession.user);

    const [availableStores, savedStoreId, savedUserId] = await Promise.all([
      listStoresForCurrentUser(),
      getActiveStoreId(db),
      getAuthenticatedUserId(db),
    ]);

    const matchingStoreId =
      savedUserId === nextSession.user.id && savedStoreId
        ? availableStores.find((store) => store.id === savedStoreId)?.id ?? null
        : null;
    const nextActiveStoreId = matchingStoreId ?? availableStores[0]?.id ?? null;

    await Promise.all([
      saveAuthenticatedUserId(db, nextSession.user.id),
      saveActiveStoreId(db, nextActiveStoreId),
    ]);

    setStores(availableStores);
    setActiveStoreId(nextActiveStoreId);
    setIsReady(true);
  };

  useEffect(() => {
    let mounted = true;

    void refresh().catch(() => {
      if (mounted) {
        setIsReady(true);
      }
    });

    if (!isSupabaseReady()) {
      return () => {
        mounted = false;
      };
    }

    const unsubscribe = subscribeToAuthChanges(() => {
      void refresh().catch(() => {
        if (mounted) {
          setIsReady(true);
        }
      });
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [db]);

  const value = useMemo<AuthContextValue>(
    () => ({
      activeStore: stores.find((store) => store.id === activeStoreId) ?? null,
      activeStoreId,
      completeAuthCallback: async (url: string) => {
        if (!isAuthCallbackUrl(url)) {
          return;
        }

        await completeAuthSessionFromUrl(url);
        await refresh();
      },
      createStore: async (storeName: string) => {
        const store = await createStoreForCurrentUser(storeName);
        await saveActiveStoreId(db, store.id);
        setActiveStoreId(store.id);
        await refresh();
        return store;
      },
      isReady,
      needsStoreSetup: Boolean(session?.user && stores.length === 0),
      refresh,
      session,
      setActiveStore: async (storeId: string) => {
        await saveActiveStoreId(db, storeId);
        setActiveStoreId(storeId);
      },
      signIn: async (email: string, password: string) => {
        await signInWithPassword(email, password);
        await refresh();
      },
      signOut: async () => {
        await signOutUser();
        await clearAuthMetadata(db);
        setSession(null);
        setStores([]);
        setActiveStoreId(null);
      },
      signUp: async (email: string, password: string) => {
        const result = await signUpWithPassword(email, password);
        await refresh();
        return result;
      },
      stores,
      user: session?.user ?? null,
    }),
    [activeStoreId, db, isReady, session, stores],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
