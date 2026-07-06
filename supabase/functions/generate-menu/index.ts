import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase-admin.ts';
import { callClaude } from '../_shared/anthropic.ts';

interface GenerateMenuRequest {
  mealPlanId: string;
}

// Génère un menu complet pour un meal_plan existant : lit les aubaines actives,
// le régime et les préférences, appelle Claude, puis insère recipes +
// meal_plan_recipes. Les repas verrouillés (is_locked=true) ne sont jamais
// régénérés par cette fonction.
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

    const prompt = buildMenuPrompt(mealPlan, activeDeals ?? [], lockedRecipes ?? [], pantryItems ?? []);
    const raw = await callClaude(prompt, { maxTokens: 8192 });
    const generated = JSON.parse(extractJson(raw));

    for (const item of generated.meals) {
      const { data: recipe, error: recipeError } = await supabase
        .from('recipes')
        .insert({
          title: item.title,
          ingredients: item.ingredients,
          steps: item.steps,
          prep_time_minutes: item.prep_time_minutes,
          diet_tags: item.diet_tags ?? null,
          source: 'ai_generated',
        })
        .select('id')
        .single();
      if (recipeError || !recipe) throw recipeError ?? new Error('Échec de création de la recette');

      await supabase.from('meal_plan_recipes').upsert(
        {
          meal_plan_id: mealPlanId,
          recipe_id: recipe.id,
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
function buildMenuPrompt(mealPlan: any, deals: any[], lockedRecipes: any[], pantryItems: any[]): string {
  return `Tu es un assistant de planification de repas. Génère un menu pour une semaine.

Contraintes :
- Régime : ${mealPlan.diets?.name ?? 'omnivore'}
- Portions par repas : ${mealPlan.servings}
- Nombre de déjeuners à générer : ${mealPlan.num_breakfasts}
- Nombre de dîners à générer : ${mealPlan.num_lunches}
- Nombre de soupers à générer : ${mealPlan.num_dinners}
- Préférences/restrictions additionnelles : ${mealPlan.preferences ?? 'aucune'}
- Repas déjà verrouillés (ne pas régénérer, ne pas dupliquer ces créneaux) : ${JSON.stringify(lockedRecipes)}

Priorise les ingrédients en aubaine cette semaine quand c'est cohérent avec le régime :
${JSON.stringify(deals)}

Voici ce que l'utilisateur a déjà dans son garde-manger/frigo — priorise aussi des
recettes qui utilisent ces ingrédients pour éviter le gaspillage et réduire les
achats nécessaires (sans t'y limiter si ça nuit à la variété ou au régime) :
${JSON.stringify(pantryItems)}

Réponds uniquement avec un objet JSON de la forme :
{"meals": [{"day_index": 0-6, "meal_type": "breakfast"|"lunch"|"dinner", "title": string, "ingredients": [{"name": string, "quantity": number, "unit": string}], "steps": string, "prep_time_minutes": number, "diet_tags": string[]}]}`;
}

function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}
