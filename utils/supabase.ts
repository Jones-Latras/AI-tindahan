import * as SecureStore from "expo-secure-store";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
const FUNCTIONS_URL = `${supabaseUrl}/functions/v1`;
const PRODUCT_IMAGE_BUCKET = "product-images";

type FilterValue = string | number | boolean | null;

const secureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

let supabaseClient: SupabaseClient | null = null;

export function isSupabaseReady() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function getSupabaseClient() {
  if (!isSupabaseReady()) {
    throw new Error("Supabase is not configured. Add your project URL and anon key to .env.");
  }

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: true,
        storage: secureStoreAdapter,
      },
    });
  }

  return supabaseClient;
}

function applyEqualsFilters(query: any, filters?: Record<string, FilterValue>) {
  let nextQuery = query;

  if (!filters) {
    return nextQuery;
  }

  for (const [column, value] of Object.entries(filters)) {
    if (value == null) {
      nextQuery = nextQuery.is(column, null);
      continue;
    }

    nextQuery = nextQuery.eq(column, value);
  }

  return nextQuery;
}

export async function getSupabaseSession() {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session;
}

export async function getSupabaseAccessToken() {
  const session = await getSupabaseSession();
  return session?.access_token ?? null;
}

export async function supabaseUpsert(
  table: string,
  rows: Record<string, unknown>[],
  onConflict = "store_id,sync_id",
) {
  if (rows.length === 0) {
    return;
  }

  const client = getSupabaseClient();
  const { error } = await client.from(table).upsert(rows, {
    ignoreDuplicates: false,
    onConflict,
  });

  if (error) {
    throw new Error(`Supabase upsert to "${table}" failed: ${error.message}`);
  }
}

export async function supabaseSelectAll<T = Record<string, unknown>>(
  table: string,
  filters?: Record<string, FilterValue>,
) {
  const client = getSupabaseClient();
  const query = applyEqualsFilters(client.from(table).select("*"), filters);
  const { data, error } = await query;

  if (error) {
    throw new Error(`Supabase select from "${table}" failed: ${error.message}`);
  }

  return (data ?? []) as T[];
}

export async function supabaseUploadStorageObject(
  path: string,
  fileBytes: ArrayBuffer,
  contentType: string,
) {
  const client = getSupabaseClient();
  const { error } = await client.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, fileBytes, {
    contentType,
    upsert: true,
  });

  if (error) {
    throw new Error(`Supabase storage upload failed: ${error.message}`);
  }

  const { data } = client.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function invokeSupabaseFunction<T = unknown>(
  functionName: string,
  payload: Record<string, unknown>,
  options?: {
    signal?: AbortSignal;
  },
) {
  const accessToken = await getSupabaseAccessToken();

  if (!accessToken) {
    throw new Error("Sign in before calling Supabase functions.");
  }

  const response = await fetch(`${FUNCTIONS_URL}/${functionName}`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
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
