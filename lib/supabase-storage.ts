import { createClient } from "@supabase/supabase-js";

export function getSupabaseStorageConfig() {
  return {
    url: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
    secretKey: process.env.SUPABASE_SECRET_KEY,
    bucket: process.env.SUPABASE_PHOTO_BUCKET,
  };
}

export function createSupabaseStorageClient(url: string, secretKey: string) {
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) },
  });
}
