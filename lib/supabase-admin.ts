import "server-only";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseSecret = process.env.SUPABASE_SECRET_KEY || "";

if (!supabaseUrl || !supabaseSecret) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL veya SUPABASE_SECRET_KEY eksik.");
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseSecret, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

export async function getUserFromBearer(request: Request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error) return null;
  return data.user ?? null;
}
