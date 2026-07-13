import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase-admin.ts';
import { callClaude } from '../_shared/anthropic.ts';
import { RECIPE_SEARCH_TOOLS_LIGHT, RECIPE_SITES_DESCRIPTION } from '../_shared/recipe-search.ts';
import { fetchFavoriteRecipes, formatFavoritesForPrompt } from '../_shared/favorites.ts';

interface RegenerateMealRequest {
  mealPlanId: string;
  dayIndex: number;
  mealType: 'breakfast' | 'lunch' | 'dinner';
}

// Régénère un seul repas d'un plan existant, sans toucher aux autres.
// Refuse si le créneau est verrouillé (is_locked).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { mealPlanId, dayIndex, mealType } = (await req.json()) as RegenerateMealRequest;
    if (!mealPlanId || dayIndex === undefined || !mealType) {
      throw new Error('mealPlanId, dayIndex et mealType requis');
    }

    const supabase = createAdminClient();

    const { data: existing } = await supabase
      .from('meal_plan_recipes')
      .select('id, is_locked')
      .eq('meal_plan_id', mealPlanId)
      .eq('day_index', dayIndex)
      .eq('meal_type', mealType)
      .maybeSingle();

    if (existing?.is_locked) {
      throw new Error('Ce repas est verrouillé, impossible de le régénérer');
    }

    const { data: mealPlan } = await supabase
      .from('meal_plans')
      .select('*, diets(name)')
      .eq('id', mealPlanId)
      .single();
    if (!mealPlan) throw new Error('Plan de repas introuvable');

    const today = new Date().toISOString().slice(0, 10);
    const { data: activeDeals } = await supabase
      .from('deals')
      .select('product_name, price_cents, price_unit')
      .lte('valid_from', today)
      .gte('valid_to', today);

    const { data: pantryItems } = await supabase
      .from('pantry_items')
      .select('ingredient_name, quantity, unit')
      .eq('user_id', mealPlan.user_id);

    const favorites = await fetchFavoriteRecipes(supabase, mealPlan.user_id);

    const prompt = `Fais des recherches web pour trouver PLUSIEURS vraies recettes candidates (pas juste
la première trouvée) de type "${mealType}" pour ${mealPlan.servings} portions, régime
"${mealPlan.diets?.name ?? 'omnivore'}", préférences: ${mealPlan.preferences ?? 'aucune'}, sur l'un de
ces sites : ${RECIPE_SITES_DESCRIPTION}. Compare-les puis choisis la meilleure candidate.
Budget maximum par portion : ${(mealPlan.budget_per_portion_cents / 100).toFixed(2)} $ — le coût estimé
des ingrédients par portion doit rester sous cette limite.
Priorise ces aubaines si pertinent: ${JSON.stringify(activeDeals ?? [])}.
Voici ce que l'utilisateur a déjà dans son garde-manger/frigo — priorise cette recette pour utiliser ces
ingrédients si c'est cohérent avec le type de repas et le régime: ${JSON.stringify(pantryItems ?? [])}.

Voici la banque de recettes favorites de l'utilisateur. Si l'une d'elles convient bien pour un
repas de type "${mealType}" (ingrédients cohérents avec les aubaines/garde-manger ci-dessus,
compatible avec le régime), PRÉFÈRE-la à une nouvelle recherche ou composition — réponds alors
uniquement avec {"favorite_index": number} (aucun autre champ) et ne fais AUCUN appel de recherche :
${formatFavoritesForPrompt(favorites)}

Si aucun favori ne convient, fais les recherches web comme demandé plus haut. Important pour la
rapidité : si les résumés de recherche donnent déjà assez de détails (ingrédients et étapes),
n'ouvre PAS de page complète — construis la recette directement à partir du résumé de la
meilleure candidate. N'utilise l'outil de récupération de page qu'en dernier recours, pour
confirmer les détails de la candidate choisie ou trouver sa photo si le résumé ne suffit pas.
Si aucune des recettes trouvées ne convient vraiment (aubaines/garde-manger/régime/budget),
compose une recette toi-même sans chercher davantage (laisse alors "source_url" et "image_url"
à null). Si la page source de la recette choisie affiche une photo, inclus son URL dans
"image_url" (sinon null — n'invente jamais une URL d'image). Estime aussi les calories par
portion et le coût des ingrédients par portion en cents canadiens (cohérent avec le budget max
ci-dessus).
Réponds uniquement avec un objet JSON (aucun texte avant ou après), soit la forme favori ci-dessus,
soit :
{"favorite_index": null, "title": string, "ingredients": [{"name": string, "quantity": number, "unit": string}], "steps": string, "prep_time_minutes": number, "calories_per_serving": number, "estimated_cost_per_serving_cents": number, "diet_tags": string[], "source_url": string|null, "image_url": string|null}`;

    const raw = await callClaude(prompt, { maxTokens: 4096, tools: RECIPE_SEARCH_TOOLS_LIGHT });
    const item = JSON.parse(extractJson(raw));

    const favorite = typeof item.favorite_index === 'number' ? favorites[item.favorite_index] : undefined;
    let recipeId: string;

    if (favorite) {
      recipeId = favorite.recipe_id;
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
          source: item.source_url ? 'web_search' : 'ai_generated',
          source_url: item.source_url ?? null,
          image_url: item.image_url ?? null,
        })
        .select('id')
        .single();
      if (recipeError || !recipe) throw recipeError ?? new Error('Échec de création de la recette');
      recipeId = recipe.id;
    }

    await supabase.from('meal_plan_recipes').upsert(
      { meal_plan_id: mealPlanId, recipe_id: recipeId, day_index: dayIndex, meal_type: mealType, is_locked: false },
      { onConflict: 'meal_plan_id,day_index,meal_type' },
    );

    return new Response(JSON.stringify({ ok: true, recipeId }), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }
});

function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}
