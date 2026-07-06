import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase-admin.ts';
import { callClaude } from '../_shared/anthropic.ts';

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

    const prompt = `Génère une seule recette de type "${mealType}" pour ${mealPlan.servings} portions, régime "${mealPlan.diets?.name ?? 'omnivore'}", préférences: ${mealPlan.preferences ?? 'aucune'}. Priorise ces aubaines si pertinent: ${JSON.stringify(activeDeals ?? [])}.
Réponds uniquement avec un objet JSON: {"title": string, "ingredients": [{"name": string, "quantity": number, "unit": string}], "steps": string, "prep_time_minutes": number, "diet_tags": string[]}`;

    const raw = await callClaude(prompt, { maxTokens: 2048 });
    const item = JSON.parse(extractJson(raw));

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
      { meal_plan_id: mealPlanId, recipe_id: recipe.id, day_index: dayIndex, meal_type: mealType, is_locked: false },
      { onConflict: 'meal_plan_id,day_index,meal_type' },
    );

    return new Response(JSON.stringify({ ok: true, recipe }), {
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
