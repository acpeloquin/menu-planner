import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase-admin.ts';
import { callClaude } from '../_shared/anthropic.ts';
import { RECIPE_SEARCH_TOOLS_PARALLEL, RECIPE_SITES_DESCRIPTION } from '../_shared/recipe-search.ts';
import { fetchFavoriteRecipes, formatFavoritesForPrompt, type FavoriteForPrompt } from '../_shared/favorites.ts';

interface GenerateMenuRequest {
  mealPlanId: string;
}

// Génère un menu complet pour un meal_plan existant : lit les aubaines actives,
// le régime et les préférences, appelle Claude, puis insère recipes +
// meal_plan_recipes. Les repas verrouillés (is_locked=true) ne sont jamais
// régénérés par cette fonction.
//
// La composition initiale se fait SANS recherche web (rapide et fiable —
// décide de la répartition jour/type de repas, de la variété, de l'usage des
// aubaines/garde-manger/favoris). Chaque repas composé par l'IA (donc pas déjà
// une recette favorite réutilisée) est ensuite "ancré" au mieux dans une
// vraie recette trouvée sur les sites de référence — même logique que
// regenerate-meal, une vraie recette est toujours essayée avant de se
// contenter d'une recette composée par l'IA. Ces ancrages tournent EN
// PARALLÈLE (Promise.all), chacun indépendamment best-effort (échec d'un seul
// repas n'affecte pas les autres).
//
// Limité à MAX_PARALLEL_GROUNDINGS repas par génération : un premier essai
// sans plafond a provoqué un timeout (504) sur un menu de plusieurs repas —
// même en parallèle, trop d'appels simultanés avec outils de recherche
// dépasse la limite d'inactivité de ~150s des edge functions Supabase
// (l'API Anthropic elle-même ne traite qu'un nombre limité d'appels
// concurrents avec outils avant de mettre les autres en attente). Les repas
// au-delà du plafond restent composés par l'IA ; l'utilisateur peut cliquer
// "Régénérer" sur chacun pour obtenir le même traitement de recherche
// individuellement (budget de 150s par repas, déjà fiable).
const MAX_PARALLEL_GROUNDINGS = 6;

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

    const prompt = buildMenuPrompt(mealPlan, activeDeals ?? [], lockedRecipes ?? [], pantryItems ?? [], favorites);
    const raw = await callClaude(prompt, { maxTokens: 16000 });
    const generated = JSON.parse(extractJson(raw));

    // Chaque repas composé par l'IA (pas réutilisé d'un favori) est un candidat
    // pour l'ancrage dans une vraie recette plus bas — une recette favorite est
    // déjà "connue", elle n'a pas besoin d'être ancrée.
    const groundingCandidates: { recipeId: string; meal: unknown }[] = [];

    for (const item of generated.meals) {
      let recipeId: string;

      const favoriteIndex = item.favorite_index;
      const favorite: FavoriteForPrompt | undefined =
        typeof favoriteIndex === 'number' ? favorites[favoriteIndex] : undefined;

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
            source: 'ai_generated',
          })
          .select('id')
          .single();
        if (recipeError || !recipe) throw recipeError ?? new Error('Échec de création de la recette');
        recipeId = recipe.id;
        groundingCandidates.push({ recipeId, meal: item });
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

    // Ancre jusqu'à MAX_PARALLEL_GROUNDINGS repas composés dans une vraie
    // recette trouvée par recherche web, EN PARALLÈLE — chacun best-effort
    // indépendamment : si l'un échoue ou ne trouve rien, on garde sa recette
    // composée par l'IA sans affecter les autres ni faire échouer la
    // génération du menu.
    await Promise.all(
      groundingCandidates.slice(0, MAX_PARALLEL_GROUNDINGS).map((candidate) =>
        groundOneRecipeInRealSource(supabase, candidate.recipeId, candidate.meal, mealPlan).catch(() => {
          // best-effort : on garde la recette composée par l'IA pour ce repas
        }),
      ),
    );

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
async function groundOneRecipeInRealSource(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  recipeId: string,
  // deno-lint-ignore no-explicit-any
  meal: any,
  // deno-lint-ignore no-explicit-any
  mealPlan: any,
): Promise<void> {
  const prompt = `Fais des recherches web pour trouver PLUSIEURS vraies recettes candidates (pas
juste la première trouvée) de type "${meal.meal_type}" similaires à "${meal.title}", pour
${mealPlan.servings} portions, régime "${mealPlan.diets?.name ?? 'omnivore'}", sur l'un de ces
sites : ${RECIPE_SITES_DESCRIPTION}. Compare-les puis choisis la meilleure candidate.
Si les résumés de recherche donnent déjà assez de détails, construis la recette directement à
partir du résumé de la meilleure candidate, sans ouvrir de page complète. N'utilise l'outil de
récupération de page qu'en dernier recours, pour confirmer les détails de la candidate choisie ou
trouver sa photo. Si la page source affiche une photo, inclus son URL dans "image_url" (sinon
null — n'invente jamais une URL d'image). Estime aussi les calories par portion et le coût des
ingrédients par portion (en cents canadiens). Réponds uniquement avec un objet JSON (aucun texte
avant/après), ou {"source_url": null} si rien d'adéquat n'est trouvé :
{"title": string, "ingredients": [{"name": string, "quantity": number, "unit": string}], "steps": string, "prep_time_minutes": number, "calories_per_serving": number, "estimated_cost_per_serving_cents": number, "diet_tags": string[], "source_url": string|null, "image_url": string|null}`;

  const raw = await callClaude(prompt, { maxTokens: 4096, tools: RECIPE_SEARCH_TOOLS_PARALLEL });
  const found = JSON.parse(extractJson(raw));
  if (!found.source_url) return;

  await supabase
    .from('recipes')
    .update({
      title: found.title,
      ingredients: found.ingredients,
      steps: found.steps,
      prep_time_minutes: found.prep_time_minutes,
      calories_per_serving: found.calories_per_serving ?? null,
      estimated_cost_per_serving_cents: found.estimated_cost_per_serving_cents ?? null,
      diet_tags: found.diet_tags ?? null,
      source: 'web_search',
      source_url: found.source_url,
      image_url: found.image_url ?? null,
    })
    .eq('id', recipeId);
}

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
convient pour un repas donné, laisse "favorite_index": null et compose une nouvelle recette
normalement :
${formatFavoritesForPrompt(favorites)}

Estime aussi, pour chaque recette composée, les calories par portion (champ "calories_per_serving")
et le coût des ingrédients par portion en cents canadiens (champ "estimated_cost_per_serving_cents",
cohérent avec le budget max ci-dessus).

Réponds uniquement avec un objet JSON de la forme :
{"meals": [{"day_index": 0-6, "meal_type": "breakfast"|"lunch"|"dinner"|"snack", "favorite_index": number|null, "title": string, "ingredients": [{"name": string, "quantity": number, "unit": string}], "steps": string, "prep_time_minutes": number, "calories_per_serving": number, "estimated_cost_per_serving_cents": number, "diet_tags": string[]}]}`;
}

function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}
