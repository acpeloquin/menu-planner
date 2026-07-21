import { supabase } from '@/lib/supabase';
import type { MealPlan, MealPlanRecipe, MealType, Recipe } from '@/lib/types';

export interface MealPlanRecipeWithRecipe extends MealPlanRecipe {
  recipes: Recipe;
}

export interface CreateMealPlanInput {
  userId: string;
  weekStartDate: string;
  dietId: string | null;
  servings: number;
  numBreakfasts: number;
  numLunches: number;
  numDinners: number;
  numSnacks: number;
  preferences: string | null;
  budgetPerPortionCents: number;
}

export async function createMealPlan(input: CreateMealPlanInput): Promise<MealPlan> {
  const { data, error } = await supabase
    .from('meal_plans')
    .insert({
      user_id: input.userId,
      week_start_date: input.weekStartDate,
      diet_id: input.dietId,
      servings: input.servings,
      num_breakfasts: input.numBreakfasts,
      num_lunches: input.numLunches,
      num_dinners: input.numDinners,
      num_snacks: input.numSnacks,
      preferences: input.preferences,
      budget_per_portion_cents: input.budgetPerPortionCents,
      status: 'draft',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getLatestMealPlan(userId: string): Promise<MealPlan | null> {
  const { data, error } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Tous les menus de l'utilisateur, du plus récent au plus ancien — les
// anciens ne sont jamais supprimés, ce qui sert d'archive par semaine (on
// peut générer un nouveau menu pour la semaine en cours tout en gardant
// celui de la semaine dernière pour continuer ses recettes).
export async function listMealPlans(userId: string): Promise<MealPlan[]> {
  const { data, error } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('user_id', userId)
    .order('week_start_date', { ascending: false });
  if (error) throw error;
  return data;
}

// Supprime un menu (et en cascade ses meal_plan_recipes / liste d'épicerie
// générée) — utile quand plusieurs menus ont été générés pour la même
// semaine et qu'on veut n'en garder qu'un pour la liste d'épicerie.
export async function deleteMealPlan(mealPlanId: string): Promise<void> {
  const { error } = await supabase.from('meal_plans').delete().eq('id', mealPlanId);
  if (error) throw error;
}

export async function getMealPlan(mealPlanId: string): Promise<MealPlan> {
  const { data, error } = await supabase.from('meal_plans').select('*').eq('id', mealPlanId).single();
  if (error) throw error;
  return data;
}

export async function getMealPlanRecipes(mealPlanId: string): Promise<MealPlanRecipeWithRecipe[]> {
  const { data, error } = await supabase
    .from('meal_plan_recipes')
    .select('*, recipes(*)')
    .eq('meal_plan_id', mealPlanId)
    .order('day_index');
  if (error) throw error;
  return data as unknown as MealPlanRecipeWithRecipe[];
}

export async function setMealLocked(mealPlanRecipeId: string, isLocked: boolean): Promise<void> {
  const { error } = await supabase
    .from('meal_plan_recipes')
    .update({ is_locked: isLocked })
    .eq('id', mealPlanRecipeId);
  if (error) throw error;
}

export interface GroundingTarget {
  recipeId: string;
  dayIndex: number;
  mealType: MealType;
  title: string;
}

// Compose rapidement le menu (sans recherche web) et renvoie les repas
// composés par l'IA (pas une recette favorite réutilisée) — à ancrer ensuite
// un par un via invokeGroundRecipe. Voir generate-menu/index.ts pour le
// pourquoi de cette séparation (timeout 504 quand l'ancrage se faisait dans
// la même invocation).
export async function invokeGenerateMenu(mealPlanId: string): Promise<GroundingTarget[]> {
  const { data, error } = await supabase.functions.invoke('generate-menu', { body: { mealPlanId } });
  if (error) throw error;
  return (data?.groundingTargets ?? []) as GroundingTarget[];
}

// Tente d'ancrer une recette déjà composée dans une vraie recette trouvée sur
// les sites de référence (best-effort : ne lève pas si rien n'est trouvé).
export async function invokeGroundRecipe(
  recipeId: string,
  mealType: MealType,
  title: string,
  servings: number,
  dietName: string | null,
): Promise<void> {
  const { error } = await supabase.functions.invoke('ground-recipe', {
    body: { recipeId, mealType, title, servings, dietName },
  });
  if (error) throw error;
}

export async function invokeRegenerateMeal(
  mealPlanId: string,
  dayIndex: number,
  mealType: MealType,
): Promise<void> {
  const { error } = await supabase.functions.invoke('regenerate-meal', {
    body: { mealPlanId, dayIndex, mealType },
  });
  if (error) throw error;
}
