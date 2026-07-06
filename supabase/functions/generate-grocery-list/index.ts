import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase-admin.ts';
import { callClaude } from '../_shared/anthropic.ts';

interface GenerateGroceryListRequest {
  mealPlanId: string;
}

interface RecipeIngredient {
  name: string;
  quantity: number;
  unit: string;
}

interface AggregatedItem {
  ingredient_name: string;
  total_quantity: number;
  unit: string;
  category: string;
  matched_deal_index: number | null;
}

// Agrège les ingrédients de tous les repas d'un meal_plan, les catégorise et
// les associe à une aubaine active quand c'est pertinent. La correspondance
// aubaine se fait par index plutôt que par UUID transcrit par Claude, pour
// éviter les erreurs de copie d'identifiants.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { mealPlanId } = (await req.json()) as GenerateGroceryListRequest;
    if (!mealPlanId) throw new Error('mealPlanId requis');

    const supabase = createAdminClient();

    const { data: mealPlan, error: mealPlanError } = await supabase
      .from('meal_plans')
      .select('user_id')
      .eq('id', mealPlanId)
      .single();
    if (mealPlanError || !mealPlan) throw new Error('Plan de repas introuvable');

    const { data: mealPlanRecipes, error: recipesError } = await supabase
      .from('meal_plan_recipes')
      .select('recipes(ingredients)')
      .eq('meal_plan_id', mealPlanId);
    if (recipesError) throw recipesError;

    const allIngredients: RecipeIngredient[] = (mealPlanRecipes ?? []).flatMap(
      (mpr) => (mpr.recipes as unknown as { ingredients: RecipeIngredient[] })?.ingredients ?? [],
    );
    if (allIngredients.length === 0) {
      throw new Error('Aucun ingrédient trouvé pour ce plan de repas');
    }

    const today = new Date().toISOString().slice(0, 10);
    const { data: activeDeals } = await supabase
      .from('deals')
      .select('id, product_name, price_cents, price_unit, store_id, stores(name)')
      .lte('valid_from', today)
      .gte('valid_to', today);
    const deals = activeDeals ?? [];

    const { data: defaultUserStore } = await supabase
      .from('user_stores')
      .select('store_id')
      .eq('user_id', mealPlan.user_id)
      .eq('is_default', true)
      .maybeSingle();
    const defaultStoreId: string | null = defaultUserStore?.store_id ?? null;

    const prompt = buildAggregationPrompt(allIngredients, deals);
    const raw = await callClaude(prompt, { maxTokens: 8192 });
    const parsed = JSON.parse(extractJson(raw)) as { items: AggregatedItem[] };

    const itemRows = parsed.items.map((item) => {
      const deal =
        item.matched_deal_index !== null && item.matched_deal_index !== undefined
          ? deals[item.matched_deal_index]
          : undefined;

      return {
        ingredient_name: item.ingredient_name,
        total_quantity: item.total_quantity,
        unit: item.unit,
        category: item.category,
        store_id: deal?.store_id ?? defaultStoreId,
        deal_id: deal?.id ?? null,
        estimated_price_cents: deal?.price_cents ?? null,
        is_checked: false,
      };
    });

    // Une liste par meal_plan (contrainte unique) : régénérer remplace les items existants.
    const { data: existingList } = await supabase
      .from('grocery_lists')
      .select('id')
      .eq('meal_plan_id', mealPlanId)
      .maybeSingle();

    let groceryListId: string;
    if (existingList) {
      groceryListId = existingList.id;
      await supabase.from('grocery_list_items').delete().eq('grocery_list_id', groceryListId);
      await supabase.from('grocery_lists').update({ generated_at: new Date().toISOString() }).eq('id', groceryListId);
    } else {
      const { data: newList, error: newListError } = await supabase
        .from('grocery_lists')
        .insert({ meal_plan_id: mealPlanId })
        .select('id')
        .single();
      if (newListError || !newList) throw newListError ?? new Error('Échec de création de la liste');
      groceryListId = newList.id;
    }

    const { error: insertError } = await supabase
      .from('grocery_list_items')
      .insert(itemRows.map((row) => ({ ...row, grocery_list_id: groceryListId })));
    if (insertError) throw insertError;

    return new Response(JSON.stringify({ groceryListId, count: itemRows.length }), {
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
function buildAggregationPrompt(ingredients: RecipeIngredient[], deals: any[]): string {
  const dealsForPrompt = deals.map((d, i) => ({
    index: i,
    product_name: d.product_name,
    price_unit: d.price_unit,
    store: d.stores?.name,
  }));

  return `Voici tous les ingrédients requis pour les repas d'une semaine (avant agrégation) :
${JSON.stringify(ingredients)}

Voici les aubaines actives cette semaine, chacune avec un index :
${JSON.stringify(dealsForPrompt)}

Tâche : agrège les ingrédients identiques ou équivalents (ex: "Ail" et "Ail (gousses)" sont le
même ingrédient), additionne leurs quantités quand les unités sont compatibles (sinon garde
l'entrée la plus fréquente et ajuste raisonnablement), normalise le nom (singulier, capitalisation
propre), et assigne une catégorie parmi : fruits_legumes, proteines, produits_laitiers,
boulangerie, epicerie, autre.

Pour chaque ingrédient agrégé, si son nom correspond clairement à une aubaine de la liste
ci-dessus (même produit), indique son index dans "matched_deal_index". Sinon, mets null.

Réponds uniquement avec un objet JSON de la forme :
{"items": [{"ingredient_name": string, "total_quantity": number, "unit": string, "category": string, "matched_deal_index": number|null}]}`;
}

function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}
