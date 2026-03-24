/**
 * Lightweight Supabase REST client using fetch.
 * We only need upsert + select — no realtime, no auth, no storage.
 * This avoids the Metro bundler issue with @supabase/realtime-js.
 */

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function isSupabaseReady() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

const REST_URL = `${supabaseUrl}/rest/v1`;

const headers = () => ({
  apikey: supabaseAnonKey,
  Authorization: `Bearer ${supabaseAnonKey}`,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
});

/**
 * Upsert rows into a Supabase table (uses PostgREST).
 * Resolves conflicts on the `id` column by default.
 */
export async function supabaseUpsert(
  table: string,
  rows: Record<string, unknown>[],
  onConflict = "id",
): Promise<void> {
  if (rows.length === 0) return;

  const response = await fetch(`${REST_URL}/${table}`, {
    method: "POST",
    headers: {
      ...headers(),
      Prefer: "resolution=merge-duplicates",
      "On-Conflict": onConflict,
    },
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase upsert to "${table}" failed (${response.status}): ${body}`);
  }
}

/**
 * Select all rows from a Supabase table.
 */
export async function supabaseSelectAll<T = Record<string, unknown>>(
  table: string,
): Promise<T[]> {
  const response = await fetch(`${REST_URL}/${table}?select=*`, {
    method: "GET",
    headers: {
      ...headers(),
      Prefer: "return=representation",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase select from "${table}" failed (${response.status}): ${body}`);
  }

  return (await response.json()) as T[];
}
