import type { Recipe } from '@/lib/types';

export function recipeMetaLine(recipe: Recipe): string {
  const parts: string[] = [];
  if (recipe.prep_time_minutes) parts.push(`~${recipe.prep_time_minutes} min`);
  if (recipe.calories_per_serving) parts.push(`~${recipe.calories_per_serving} kcal/portion`);
  if (recipe.estimated_cost_per_serving_cents != null) {
    parts.push(`~${(recipe.estimated_cost_per_serving_cents / 100).toFixed(2)} $/portion`);
  }
  return parts.join(' · ');
}
