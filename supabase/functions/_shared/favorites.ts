// Recettes que l'utilisateur a marquées comme favorites (voir 0007_favorite_recipes.sql).
// La génération/régénération de menu peut réutiliser une de ces recettes telle
// quelle (même recipe_id) plutôt que d'en composer une nouvelle, quand ses
// ingrédients correspondent bien aux aubaines/garde-manger de la semaine.

export interface FavoriteForPrompt {
  recipe_id: string;
  title: string;
  ingredients: unknown;
  diet_tags: string[] | null;
}

// deno-lint-ignore no-explicit-any
export async function fetchFavoriteRecipes(supabase: any, userId: string): Promise<FavoriteForPrompt[]> {
  const { data } = await supabase
    .from('favorite_recipes')
    .select('recipe_id, recipes(title, ingredients, diet_tags)')
    .eq('user_id', userId);

  return (data ?? []).map((row: { recipe_id: string; recipes: { title: string; ingredients: unknown; diet_tags: string[] | null } }) => ({
    recipe_id: row.recipe_id,
    title: row.recipes.title,
    ingredients: row.recipes.ingredients,
    diet_tags: row.recipes.diet_tags,
  }));
}

export function formatFavoritesForPrompt(favorites: FavoriteForPrompt[]): string {
  if (favorites.length === 0) return 'Aucune recette favorite pour l\'instant.';
  return favorites
    .map((f, i) => `[${i}] "${f.title}" — ingrédients: ${JSON.stringify(f.ingredients)} — tags: ${JSON.stringify(f.diet_tags ?? [])}`)
    .join('\n');
}
