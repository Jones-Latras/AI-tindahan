# Multi-User Data Isolation Checklist

Target architecture: `one authenticated user -> one active store -> all synced rows scoped to that store`.

Recommended stack for this repo: Supabase Auth plus store-scoped RLS, because the app already depends on Supabase for sync and edge functions.

## Config And Dependencies

- [ ] Update `package.json`
  Add `@supabase/supabase-js` and `expo-secure-store`.
- [ ] Update `.env.example`
  Keep `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and add any redirect or deep-link env vars needed for auth.
- [ ] Verify `.gitignore`
  Make sure any new auth env files stay ignored.
- [ ] Update `app.config.ts`
  Add auth/deep-link config if magic links or OAuth redirects are used in Expo.

## App Shell And User Flow

- [ ] Create `contexts/AuthContext.tsx`
  Own session bootstrap, sign-in/sign-out, active store selection, and auth-ready state.
- [ ] Create `utils/auth.ts`
  Centralize Supabase auth client setup, token persistence via SecureStore, and helper methods.
- [ ] Update `app/_layout.tsx`
  Wrap the app in `AuthProvider`, block main tabs until auth and active store are resolved, and route between onboarding, sign-in, and app tabs.
- [ ] Create `app/sign-in.tsx`
  Implement the first auth screen and keep it minimal before adding polish.
- [ ] Create `app/store-setup.tsx`
  Create or join a store after first sign-in if no active store exists yet.
- [ ] Update `app/(tabs)/settings.tsx`
  Replace anonymous backup/restore actions with session-aware sync, show signed-in identity, add sign-out, and disable restore until an active store is loaded.
- [ ] Temporarily gate backup/restore in `app/(tabs)/settings.tsx`
  Do not allow the current global restore flow to continue once auth work starts.
- [ ] Update `constants/translations.ts`
  Add copy for sign-in, sign-out, session errors, store setup, and backup warnings.

## Local Data Model

- [ ] Update `db/database.ts`
  Add a new migration version that introduces local `sync_id` columns for every synced table and a local metadata table for `active_store_id`, `owner_user_id`, and migration flags.
- [ ] Keep local integer IDs local-only
  Do not treat SQLite integer IDs as cloud-global identifiers anymore.
- [ ] Update `db/repositories.ts`
  Add repository helpers for reading and writing local sync metadata and active store info.
- [ ] Update `scripts/seed-store.ts`
  Ensure dev seed data generates `sync_id` values and respects the active local store context.

## Supabase Client And Sync

- [ ] Rewrite `utils/supabase.ts`
  Replace the current anon-only REST helper with an authenticated client or session-aware request layer that sends the user access token.
- [ ] Remove unscoped select helpers in `utils/supabase.ts`
  Do not keep generic `select=*` access that can accidentally read global rows.
- [ ] Rewrite push sync in `utils/sync.ts`
  Every uploaded row must include `store_id` and use `sync_id` or `(store_id, sync_id)` as the conflict key.
- [ ] Rewrite restore in `utils/sync.ts`
  Restore only rows for the active store. Never do global-table restore again.
- [ ] Make sync metadata store-aware in `utils/sync.ts`
  The last-sync state should be per store, not one global value for the whole device.
- [ ] Scope storage uploads in `utils/sync.ts`
  Use storage paths like `product-images/{store_id}/products/...`.

## Cloud Schema And Policies

- [ ] Update `scripts/supabase-setup.sql`
  Add `profiles`, `stores`, and `store_memberships`.
- [ ] Add `store_id` and `sync_id` to all synced cloud tables in `scripts/supabase-setup.sql`
  Every business row must belong to one store and have a stable sync identifier.
- [ ] Replace open RLS policies in `scripts/supabase-setup.sql`
  Delete the current `Allow all` policies and replace them with membership-based policies.
- [ ] Add safe upsert constraints in `scripts/supabase-setup.sql`
  Prefer composite uniqueness like `(store_id, sync_id)`.
- [ ] Update storage policies in `scripts/supabase-setup.sql`
  Users should only upload and read objects for stores they belong to.
- [ ] Create `scripts/supabase-migrate-shared-data.sql`
  Handle the current shared cloud data explicitly instead of trying to auto-repair it silently.

## Edge Function Hardening

- [ ] Update `supabase/functions/gemini-proxy/index.ts`
  Require a valid Supabase user token before proxying Gemini requests.
- [ ] Tighten CORS in `supabase/functions/gemini-proxy/index.ts`
  Narrow the allowed origins once the auth flow is defined.

## Suggested Order

1. Cloud schema and RLS in `scripts/supabase-setup.sql`.
2. Local DB migration in `db/database.ts`.
3. Auth client and provider in `utils/auth.ts` and `contexts/AuthContext.tsx`.
4. Router and auth screens in `app/_layout.tsx`, `app/sign-in.tsx`, and `app/store-setup.tsx`.
5. Sync rewrite in `utils/supabase.ts` and `utils/sync.ts`.
6. Settings and UX updates in `app/(tabs)/settings.tsx` and `constants/translations.ts`.
7. Edge-function hardening in `supabase/functions/gemini-proxy/index.ts`.

## Definition Of Done

- [ ] Unauthenticated clients cannot read business data.
- [ ] Authenticated users can only access rows for stores they belong to.
- [ ] No cloud upsert depends on local integer IDs alone.
- [ ] Backup and restore works across devices for the same store without leaking data across accounts.
