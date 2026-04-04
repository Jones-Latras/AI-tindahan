-- Manual migration worksheet for the old shared single-tenant backup tables.
-- Review and adapt before running in production.

-- Recommended approach:
-- 1. Create a new authenticated store-scoped schema with scripts/supabase-setup.sql.
-- 2. Export any existing shared backup data that must be preserved.
-- 3. Create one destination store per real owner.
-- 4. Rewrite exported rows so each one has:
--    - store_id
--    - sync_id
--    - *_sync_id foreign references instead of local integer ids
-- 5. Import the rewritten rows into the new tables.
-- 6. Disable or archive the legacy shared tables once verified.

-- If the existing cloud data is mixed across multiple real users and cannot be
-- reliably partitioned, do not auto-migrate it. Start with empty store-scoped
-- tables and re-upload from each device after the local app migration.
