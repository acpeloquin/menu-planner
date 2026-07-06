import { supabase } from '@/lib/supabase';
import type { Diet } from '@/lib/types';

export async function listDiets(): Promise<Diet[]> {
  const { data, error } = await supabase.from('diets').select('*').order('name');
  if (error) throw error;
  return data;
}
