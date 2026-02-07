import { createClient } from "@supabase/supabase-js";

// Client-side: anon key, used for real-time subscriptions only.
// This client can SELECT games (for real-time change detection)
// but cannot INSERT/UPDATE (no RLS policy for anon writes).
export function getAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

// Server-side only: service role key, bypasses RLS.
// Used in API routes to read/write full game state (including hidden info).
export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}
