// Banque de recettes pré-extraites de sites de référence (voir 0019_recipe_bank.sql
// et populate-recipe-bank). generate-menu/regenerate-meal piochent dedans par
// index (même pattern que les favoris) au lieu de faire une recherche web à
// chaque génération — remplace l'ancre web en direct, abandonnée pour son coût
// en tokens (voir historique dans generate-menu/index.ts).

export interface BankRecipeForPrompt {
  id: string;
  title: string;
  ingredients: unknown;
  meal_type: string;
  diet_tags: string[] | null;
  calories_per_serving: number | null;
  estimated_cost_per_serving_cents: number | null;
}

interface BankRow extends BankRecipeForPrompt {
  source_site: string;
  source_url: string;
  image_url: string | null;
  steps: string;
  prep_time_minutes: number | null;
  servings: number | null;
}

// deno-lint-ignore no-explicit-any
export async function fetchBankCandidates(supabase: any, mealTypes: string[], limit = 40): Promise<BankRow[]> {
  if (mealTypes.length === 0) return [];
  const { data } = await supabase
    .from('recipe_bank')
    .select('*')
    .in('meal_type', mealTypes)
    .limit(limit);
  return (data ?? []) as BankRow[];
}

export function formatBankForPrompt(bank: BankRecipeForPrompt[]): string {
  if (bank.length === 0) return 'Aucune recette dans la banque pour ces types de repas.';
  return bank
    .map(
      (r, i) =>
        `[${i}] "${r.title}" (${r.meal_type}) — ingrédients: ${JSON.stringify(r.ingredients)} — tags: ${JSON.stringify(r.diet_tags ?? [])} — calories/portion: ${r.calories_per_serving ?? '?'} — coût/portion: ${r.estimated_cost_per_serving_cents ?? '?'}¢`,
    )
    .join('\n');
}

// Un même bank_recipe peut être choisi dans plusieurs plans de repas (semaines
// ou utilisateurs différents) : on réutilise la ligne `recipes` existante si
// elle a déjà été créée pour cette source_url, sinon on la crée.
// deno-lint-ignore no-explicit-any
export async function resolveBankRecipeId(supabase: any, bankRecipe: BankRow): Promise<string> {
  const { data: existing } = await supabase
    .from('recipes')
    .select('id')
    .eq('source_url', bankRecipe.source_url)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from('recipes')
    .insert({
      title: bankRecipe.title,
      ingredients: bankRecipe.ingredients,
      steps: bankRecipe.steps,
      prep_time_minutes: bankRecipe.prep_time_minutes,
      calories_per_serving: bankRecipe.calories_per_serving,
      estimated_cost_per_serving_cents: bankRecipe.estimated_cost_per_serving_cents,
      diet_tags: bankRecipe.diet_tags,
      source: 'recipe_bank',
      source_url: bankRecipe.source_url,
      image_url: bankRecipe.image_url,
    })
    .select('id')
    .single();
  if (error || !created) throw error ?? new Error('Échec de création de la recette depuis la banque');
  return created.id;
}
