import { supabase } from '@/lib/supabase';
import type { PantryItem } from '@/lib/types';

export async function listPantryItems(userId: string): Promise<PantryItem[]> {
  const { data, error } = await supabase
    .from('pantry_items')
    .select('*')
    .eq('user_id', userId)
    .order('ingredient_name');
  if (error) throw error;
  return data;
}

export async function addPantryItem(
  userId: string,
  ingredientName: string,
  quantity: number | null,
  unit: string | null,
): Promise<PantryItem> {
  const { data, error } = await supabase
    .from('pantry_items')
    .insert({ user_id: userId, ingredient_name: ingredientName, quantity, unit })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removePantryItem(id: string): Promise<void> {
  const { error } = await supabase.from('pantry_items').delete().eq('id', id);
  if (error) throw error;
}

export interface ParsedPantryItem {
  ingredient_name: string;
  quantity: number | null;
  unit: string | null;
}

export async function analyzePantryPhoto(base64: string, mediaType: string): Promise<ParsedPantryItem[]> {
  const { data, error } = await supabase.functions.invoke<{ items: ParsedPantryItem[] }>(
    'analyze-pantry-photo',
    { body: { imageBase64: base64, mediaType } },
  );
  if (error) throw error;
  return data?.items ?? [];
}
