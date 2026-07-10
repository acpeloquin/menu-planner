import { supabase } from '@/lib/supabase';
import type { Recipe } from '@/lib/types';

export interface FavoriteRecipeWithRecipe {
  user_id: string;
  recipe_id: string;
  created_at: string;
  recipes: Recipe;
}

export async function listFavoriteRecipeIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('favorite_recipes').select('recipe_id').eq('user_id', userId);
  if (error) throw error;
  return new Set(data.map((row) => row.recipe_id));
}

export async function listFavoriteRecipes(userId: string): Promise<FavoriteRecipeWithRecipe[]> {
  const { data, error } = await supabase
    .from('favorite_recipes')
    .select('*, recipes(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as unknown as FavoriteRecipeWithRecipe[];
}

export async function addFavorite(userId: string, recipeId: string): Promise<void> {
  const { error } = await supabase.from('favorite_recipes').insert({ user_id: userId, recipe_id: recipeId });
  if (error) throw error;
}

export async function removeFavorite(userId: string, recipeId: string): Promise<void> {
  const { error } = await supabase
    .from('favorite_recipes')
    .delete()
    .eq('user_id', userId)
    .eq('recipe_id', recipeId);
  if (error) throw error;
}
