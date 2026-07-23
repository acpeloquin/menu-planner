import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase-admin.ts';
import { callClaude } from '../_shared/anthropic.ts';
import { fetchFavoriteRecipes, formatFavoritesForPrompt, type FavoriteForPrompt } from '../_shared/favorites.ts';
import { fetchBankCandidates, formatBankForPrompt, resolveBankRecipeId } from '../_shared/recipe-bank.ts';

interface GenerateMenuRequest {
  mealPlanId: string;
}

// Génère un menu complet pour un meal_plan existant : lit les aubaines actives,
// le régime et les préférences, appelle Claude, puis insère recipes +
// meal_plan_recipes. Les repas verrouillés (is_locked=true) ne sont jamais
// régénérés par cette fonction.
//
// Décide de la répartition jour/type de repas, de la variété, de l'usage des
// aubaines/garde-manger/favoris/banque de recettes. Priorité par repas :
// favori > recette de la banque locale (recipe_bank) > composition par IA.
//
// Historique : on a exploré l'ancrage de chaque recette dans une vraie
// recette trouvée par recherche web EN DIRECT sur des sites de référence
// (d'abord un seul repas, puis tous en parallèle, puis via des appels séparés
// type ground-recipe). Abandonné : ça consommait beaucoup trop de tokens/coût
// pour la valeur ajoutée, en plus d'avoir provoqué plusieurs timeouts (504) en
// cours de route. La banque de recettes (extraite une seule fois, voir
// populate-recipe-bank) remplace maintenant cette recherche live à coût quasi nul.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { mealPlanId } = (await req.json()) as GenerateMenuRequest;
    if (!mealPlanId) throw new Error('mealPlanId requis');

    const supabase = createAdminClient();

    const { data: mealPlan, error: mealPlanError } = await supabase
      .from('meal_plans')
      .select('*, diets(name, slug)')
      .eq('id', mealPlanId)
      .single();
    if (mealPlanError || !mealPlan) throw new Error('Plan de repas introuvable');

    const today = new Date().toISOString().slice(0, 10);
    const { data: activeDeals } = await supabase
      .from('deals')
      .select('product_name, price_cents, price_unit, valid_from, valid_to')
      .lte('valid_from', today)
      .gte('valid_to', today);

    const { data: lockedRecipes } = await supabase
      .from('meal_plan_recipes')
      .select('day_index, meal_type, recipes(title)')
      .eq('meal_plan_id', mealPlanId)
      .eq('is_locked', true);

    const { data: pantryItems } = await supabase
      .from('pantry_items')
      .select('ingredient_name, quantity, unit')
      .eq('user_id', mealPlan.user_id);

    const favorites = await fetchFavoriteRecipes(supabase, mealPlan.user_id);

    const neededMealTypes = [
      mealPlan.num_breakfasts > 0 && 'breakfast',
      mealPlan.num_lunches > 0 && 'lunch',
      mealPlan.num_dinners > 0 && 'dinner',
      mealPlan.num_snacks > 0 && 'snack',
    ].filter((t): t is string => Boolean(t));
    const bank = await fetchBankCandidates(supabase, neededMealTypes, 60);

    const prompt = buildMenuPrompt(mealPlan, activeDeals ?? [], lockedRecipes ?? [], pantryItems ?? [], favorites, bank);
    const raw = await callClaude(prompt, { maxTokens: 16000 });
    const generated = JSON.parse(extractJson(raw));

    for (const item of generated.meals) {
      let recipeId: string;

      const favoriteIndex = item.favorite_index;
      const favorite: FavoriteForPrompt | undefined =
        typeof favoriteIndex === 'number' ? favorites[favoriteIndex] : undefined;
      const bankIndex = item.bank_index;
      const bankRecipe = typeof bankIndex === 'number' ? bank[bankIndex] : undefined;

      if (favorite) {
        recipeId = favorite.recipe_id;
      } else if (bankRecipe) {
        recipeId = await resolveBankRecipeId(supabase, bankRecipe);
      } else {
        const { data: recipe, error: recipeError } = await supabase
          .from('recipes')
          .insert({
            title: item.title,
            ingredients: item.ingredients,
            steps: item.steps,
            prep_time_minutes: item.prep_time_minutes,
            calories_per_serving: item.calories_per_serving ?? null,
            estimated_cost_per_serving_cents: item.estimated_cost_per_serving_cents ?? null,
            diet_tags: item.diet_tags ?? null,
            source: 'ai_generated',
          })
          .select('id')
          .single();
        if (recipeError || !recipe) throw recipeError ?? new Error('Échec de création de la recette');
        recipeId = recipe.id;
      }

      await supabase.from('meal_plan_recipes').upsert(
        {
          meal_plan_id: mealPlanId,
          recipe_id: recipeId,
          day_index: item.day_index,
          meal_type: item.meal_type,
          is_locked: false,
        },
        { onConflict: 'meal_plan_id,day_index,meal_type' },
      );
    }

    await supabase.from('meal_plans').update({ status: 'ready' }).eq('id', mealPlanId);

    return new Response(JSON.stringify({ ok: true, count: generated.meals.length }), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }
});

// deno-lint-ignore no-explicit-any
function buildMenuPrompt(
  // deno-lint-ignore no-explicit-any
  mealPlan: any,
  // deno-lint-ignore no-explicit-any
  deals: any[],
  // deno-lint-ignore no-explicit-any
  lockedRecipes: any[],
  // deno-lint-ignore no-explicit-any
  pantryItems: any[],
  favorites: FavoriteForPrompt[],
  // deno-lint-ignore no-explicit-any
  bank: any[],
): string {
  return `Tu es un assistant de planification de repas. Génère un menu pour une semaine.

Contraintes :
- Régime : ${mealPlan.diets?.name ?? 'omnivore'}
- Portions par repas : ${mealPlan.servings}
- Nombre de déjeuners à générer : ${mealPlan.num_breakfasts}
- Nombre de dîners à générer : ${mealPlan.num_lunches}
- Nombre de soupers à générer : ${mealPlan.num_dinners}
- Nombre de collations à générer : ${mealPlan.num_snacks} (des collations simples : fruit, yogourt,
  muffin, noix, etc. — pas besoin d'étapes de préparation élaborées, "steps" peut être aussi court
  que "Servir tel quel")
- Préférences/restrictions additionnelles : ${mealPlan.preferences ?? 'aucune'}
- Budget maximum par portion : ${(mealPlan.budget_per_portion_cents / 100).toFixed(2)} $ — le coût estimé des
  ingrédients par portion de chaque recette composée doit rester sous cette limite (utilise les prix des
  aubaines ci-dessous quand l'ingrédient y figure, sinon un prix d'épicerie courant raisonnable au Québec)
- Repas déjà verrouillés (ne pas régénérer, ne pas dupliquer ces créneaux) : ${JSON.stringify(lockedRecipes)}

Priorise les ingrédients en aubaine cette semaine quand c'est cohérent avec le régime :
${JSON.stringify(deals)}

Voici ce que l'utilisateur a déjà dans son garde-manger/frigo — priorise aussi des
recettes qui utilisent ces ingrédients pour éviter le gaspillage et réduire les
achats nécessaires (sans t'y limiter si ça nuit à la variété ou au régime) :
${JSON.stringify(pantryItems)}

Voici la banque de recettes favorites de l'utilisateur (recettes déjà aimées les semaines
précédentes). Pour chaque repas, tu PEUX réutiliser une recette favorite telle quelle si ses
ingrédients correspondent bien aux aubaines et/ou au garde-manger ci-dessus et qu'elle convient
au régime et aux préférences — indique alors son index dans "favorite_index" pour ce repas (les
champs title/ingredients/steps/prep_time_minutes/diet_tags sont alors ignorés, laisse-les vides).
Ne réutilise pas la même recette favorite plus d'une fois dans la même semaine. Si aucune ne
convient pour un repas donné, laisse "favorite_index": null :
${formatFavoritesForPrompt(favorites)}

Si aucun favori ne convient pour un repas, voici des recettes réelles (tirées de sites de référence)
disponibles dans une banque locale pour ce type de repas — PRÉFÈRE-en une à une composition par IA si
elle convient bien (ingrédients cohérents avec les aubaines/garde-manger, compatible avec le régime/
préférences, et dont le "meal_type" correspond au créneau à remplir) — indique alors son index dans
"bank_index" pour ce repas (title/ingredients/steps/etc. sont alors ignorés). Ne réutilise pas la même
recette de la banque plus d'une fois dans la même semaine :
${formatBankForPrompt(bank)}

Si ni un favori ni une recette de la banque ne conviennent pour un repas, laisse "favorite_index" et
"bank_index" à null et compose une nouvelle recette normalement. Estime aussi, pour chaque recette
composée, les calories par portion (champ "calories_per_serving") et le coût des ingrédients par
portion en cents canadiens (champ "estimated_cost_per_serving_cents", cohérent avec le budget max
ci-dessus).

Réponds uniquement avec un objet JSON de la forme :
{"meals": [{"day_index": 0-6, "meal_type": "breakfast"|"lunch"|"dinner"|"snack", "favorite_index": number|null, "bank_index": number|null, "title": string, "ingredients": [{"name": string, "quantity": number, "unit": string}], "steps": string, "prep_time_minutes": number, "calories_per_serving": number, "estimated_cost_per_serving_cents": number, "diet_tags": string[]}]}`;
}

function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}
