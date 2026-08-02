import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local',
    );
  }

  return createSupabaseClient(supabaseUrl, supabaseAnonKey);
}

export type SupabaseTaskRow = {
  id: string;
  title: string;
  due_time: string;
  due_date: string;
  completed: boolean;
  completed_at?: string | null;
};
