import "react-native-url-polyfill/auto";
import * as SecureStore from "expo-secure-store";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
const FUNCTIONS_URL = `${supabaseUrl}/functions/v1`;
const PRODUCT_IMAGE_BUCKET = "product-images";

type FilterValue = string | number | boolean | null;

function getRequestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) {
    return init.method;
  }

  if (typeof input === "object" && "method" in input && input.method) {
    return input.method;
  }

  return "GET";
}

const supabaseFetch: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, init);
  } catch (error) {
    const method = getRequestMethod(input, init);
    const url = getRequestUrl(input);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Supabase network request failed (${method} ${url}): ${message}`);
  }
};

const secureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

let supabaseClient: SupabaseClient | null = null;
let autoRefreshHooked = false;

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
      global: {
        fetch: supabaseFetch,
      },
    });
  }

  if (!autoRefreshHooked) {
    AppState.addEventListener("change", (state) => {
      if (!supabaseClient) {
        return;
      }

      if (state === "active") {
        supabaseClient.auth.startAutoRefresh();
        return;
      }

      supabaseClient.auth.stopAutoRefresh();
    });
    supabaseClient.auth.startAutoRefresh();
    autoRefreshHooked = true;
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
  const client = getSupabaseClient();
  const session = await getSupabaseSession();

  if (!session) {
    return null;
  }

  const expiresAtMs = (session.expires_at ?? 0) * 1000;

  if (expiresAtMs > Date.now() + 60_000) {
    return session.access_token;
  }

  const { data, error } = await client.auth.refreshSession();

  if (error) {
    throw error;
  }

  return data.session?.access_token ?? null;
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
  const client = getSupabaseClient();
  let accessToken = await getSupabaseAccessToken();

  if (!accessToken) {
    throw new Error("Sign in before calling Supabase functions.");
  }

  const url = `${FUNCTIONS_URL}/${functionName}`;
  const runRequest = async (token: string) =>
    fetch(url, {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: options?.signal,
    });

  let response: Response;
  let rawBody: string;

  try {
    response = await runRequest(accessToken);
    rawBody = await response.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Network request to Supabase function "${functionName}" failed (${url}): ${message}`);
  }

  if (response.status === 401 && rawBody.includes("Invalid JWT")) {
    const { data, error } = await client.auth.refreshSession();

    if (!error && data.session?.access_token) {
      accessToken = data.session.access_token;
      try {
        response = await runRequest(accessToken);
        rawBody = await response.text();
      } catch (requestError) {
        const message = requestError instanceof Error ? requestError.message : String(requestError);
        throw new Error(`Network request to Supabase function "${functionName}" failed (${url}): ${message}`);
      }
    }
  }

  if (!response.ok) {
    throw new Error(`Supabase function "${functionName}" failed (${response.status}): ${rawBody}`);
  }

  if (!rawBody.trim()) {
    return undefined as T;
  }

  return JSON.parse(rawBody) as T;
}
