/**
 * Lightweight Supabase REST client using fetch.
 * We only need upsert + select + simple storage uploads -- no realtime, no auth.
 * This avoids the Metro bundler issue with @supabase/realtime-js.
 */

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

const REST_URL = `${supabaseUrl}/rest/v1`;
const STORAGE_URL = `${supabaseUrl}/storage/v1`;
const FUNCTIONS_URL = `${supabaseUrl}/functions/v1`;

export function isSupabaseReady() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

const headers = () => ({
  apikey: supabaseAnonKey,
  Authorization: `Bearer ${supabaseAnonKey}`,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
});

const storageHeaders = (contentType?: string) => ({
  apikey: supabaseAnonKey,
  Authorization: `Bearer ${supabaseAnonKey}`,
  ...(contentType ? { "Content-Type": contentType } : {}),
});

const functionHeaders = () => ({
  apikey: supabaseAnonKey,
  Authorization: `Bearer ${supabaseAnonKey}`,
  "Content-Type": "application/json",
});

function encodeStoragePath(path: string) {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

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

export function getSupabaseStoragePublicUrl(bucket: string, path: string) {
  return `${STORAGE_URL}/object/public/${encodeURIComponent(bucket)}/${encodeStoragePath(path)}`;
}

export async function supabaseUploadStorageObject(
  bucket: string,
  path: string,
  fileBytes: ArrayBuffer,
  contentType: string,
): Promise<string> {
  const response = await fetch(
    `${STORAGE_URL}/object/${encodeURIComponent(bucket)}/${encodeStoragePath(path)}`,
    {
      method: "POST",
      headers: storageHeaders(contentType),
      body: fileBytes,
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Supabase storage upload failed (${response.status}). Make sure the "${bucket}" bucket exists and has upload policies. ${body}`,
    );
  }

  return getSupabaseStoragePublicUrl(bucket, path);
}

export async function invokeSupabaseFunction<T = unknown>(
  functionName: string,
  payload: Record<string, unknown>,
  options?: {
    signal?: AbortSignal;
  },
): Promise<T> {
  const response = await fetch(`${FUNCTIONS_URL}/${functionName}`, {
    method: "POST",
    headers: functionHeaders(),
    body: JSON.stringify(payload),
    signal: options?.signal,
  });

  const rawBody = await response.text();

  if (!response.ok) {
    throw new Error(`Supabase function "${functionName}" failed (${response.status}): ${rawBody}`);
  }

  if (!rawBody.trim()) {
    return undefined as T;
  }

  return JSON.parse(rawBody) as T;
}
