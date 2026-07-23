import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase-admin.ts';
import { callClaude } from '../_shared/anthropic.ts';
import {
  extractRecipeJsonLd,
  flattenInstructions,
  firstImage,
  parseIsoDurationMinutes,
} from '../_shared/recipe-jsonld.ts';
import { extractRecipeMicrodata } from '../_shared/recipe-microdata.ts';

interface PopulateRequest {
  site: 'ricardo' | 'soscuisine' | 'ottolenghi' | 'metro';
  urls: string[];
}

interface RawRecipe {
  url: string;
  name: string;
  ingredients: string[];
  steps: string;
  prepMinutes: number | null;
  image: string | null;
  servings: number | null;
  nutritionCalories: string | number | null;
  category: string | null;
  diet: string | null;
}

// Alimente une fois pour toutes la banque de recettes (recipe_bank) à partir
// d'URLs de recettes déjà repérées (harvesting fait hors-ligne — voir
// scripts/harvest-recipe-urls, pas dans cette fonction, pour rester sous le
// budget ~150s des edge functions). Pour chaque lot d'URLs :
//   1. fetch + extraction du schema.org/Recipe, en JSON-LD (Ricardo/SOSCuisine/
//      Ottolenghi) ou en microdata (metro.ca) — pas de Claude ici
//   2. UN seul appel Claude pour tout le lot, qui normalise les ingrédients
//      au format {name,quantity,unit} et classe meal_type/diet_tags/calories/
//      coût — pas un appel par recette, pour rester très peu coûteux (c'est
//      une extraction ponctuelle, pas une recherche à chaque génération de menu).
// Appeler avec des lots de ~10-15 URLs pour rester dans le budget de la fonction.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { site, urls } = (await req.json()) as PopulateRequest;
    if (!site || !urls?.length) throw new Error('site et urls requis');

    const supabase = createAdminClient();

    const { data: existing } = await supabase.from('recipe_bank').select('source_url').in('source_url', urls);
    const existingUrls = new Set((existing ?? []).map((r: { source_url: string }) => r.source_url));
    const newUrls = urls.filter((u) => !existingUrls.has(u));

    const raw: RawRecipe[] = [];

    for (const url of newUrls) {
      try {
        const res = await fetch(url, {
          headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        });
        if (!res.ok) continue;
        const html = await res.text();
        // JSON-LD d'abord (Ricardo/SOSCuisine/Ottolenghi), sinon microdata (metro.ca).
        const recipe = extractRecipeJsonLd(html) ?? extractRecipeMicrodata(html);
        if (!recipe?.name || !recipe.recipeIngredient?.length) continue;

        const totalMinutes =
          (parseIsoDurationMinutes(recipe.prepTime) ?? 0) + (parseIsoDurationMinutes(recipe.cookTime) ?? 0) || null;

        raw.push({
          url,
          name: recipe.name.trim(),
          ingredients: recipe.recipeIngredient,
          steps: flattenInstructions(recipe.recipeInstructions),
          prepMinutes: totalMinutes,
          image: firstImage(recipe.image),
          servings: recipe.recipeYield ? parseInt(String(recipe.recipeYield), 10) || null : null,
          nutritionCalories: recipe.nutrition?.calories ?? null,
          category: recipe.recipeCategory ? String(recipe.recipeCategory) : null,
          diet: recipe.suitableForDiet ? String(recipe.suitableForDiet) : null,
        });
      } catch {
        // page inaccessible ou JSON-LD absent, on l'ignore
      }
    }

    if (raw.length === 0) {
      return new Response(JSON.stringify({ ok: true, inserted: 0, skippedExisting: existingUrls.size, fetched: 0 }), {
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      });
    }

    const prompt = buildNormalizationPrompt(raw);
    const response = await callClaude(prompt, { maxTokens: 16000, thinking: { type: 'disabled' } });
    const normalized = JSON.parse(extractJson(response)) as NormalizedRecipe[];
    if (normalized.length !== raw.length) {
      throw new Error(`Désalignement: ${raw.length} recettes envoyées, ${normalized.length} reçues`);
    }

    const rows = normalized.map((item, i) => ({
      title: raw[i].name,
      source_site: site,
      source_url: raw[i].url,
      image_url: raw[i].image,
      ingredients: item.ingredients,
      steps: raw[i].steps,
      prep_time_minutes: raw[i].prepMinutes,
      servings: raw[i].servings,
      meal_type: item.meal_type,
      diet_tags: item.diet_tags,
      calories_per_serving: item.calories_per_serving,
      estimated_cost_per_serving_cents: item.estimated_cost_per_serving_cents,
    }));

    const { error: insertError } = await supabase.from('recipe_bank').insert(rows);
    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({ ok: true, inserted: rows.length, skippedExisting: existingUrls.size, fetched: raw.length }),
      { headers: { ...corsHeaders, 'content-type': 'application/json' } },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }
});

interface NormalizedRecipe {
  ingredients: { name: string; quantity: number; unit: string }[];
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  diet_tags: string[];
  calories_per_serving: number | null;
  estimated_cost_per_serving_cents: number | null;
}

function buildNormalizationPrompt(raw: RawRecipe[]): string {
  const items = raw
    .map(
      (r, i) =>
        `[${i}] "${r.name}" — ingrédients bruts: ${JSON.stringify(r.ingredients)} — catégorie source: ${r.category ?? 'inconnue'} — régime indiqué: ${r.diet ?? 'aucun'} — calories indiquées: ${r.nutritionCalories ?? 'inconnues'}`,
    )
    .join('\n');

  return `Tu normalises un lot de recettes extraites de sites web pour une banque de recettes d'une appli de planification de menus québécoise. Pour CHAQUE recette ci-dessous (dans le même ordre, même nombre d'éléments), produis :
- "ingredients": la liste d'ingrédients bruts convertie au format [{"name": string, "quantity": number, "unit": string}] (déduis quantité/unité du texte, ex. "675 g (1 1/2 lb) d'agneau haché" -> {"name": "agneau haché", "quantity": 675, "unit": "g"} ; si pas de quantité claire, quantity: 1, unit: "au goût")
- "meal_type": un seul choix parmi "breakfast"|"lunch"|"dinner"|"snack" (le plus approprié selon le nom/catégorie/ingrédients — la plupart des plats principaux sont "dinner")
- "diet_tags": tableau de tags parmi ex. "vegetarien", "vegan", "sans gluten", "omnivore" etc. déduits des ingrédients et du régime indiqué (tableau vide si omnivore sans restriction particulière)
- "calories_per_serving": estimation en nombre entier (utilise les calories indiquées si présentes, sinon estime à partir des ingrédients/portions)
- "estimated_cost_per_serving_cents": estimation raisonnable du coût des ingrédients par portion en cents canadiens

Recettes :
${items}

Réponds uniquement avec un tableau JSON de ${raw.length} objets dans le même ordre, sans texte avant/après :
[{"ingredients": [...], "meal_type": string, "diet_tags": string[], "calories_per_serving": number, "estimated_cost_per_serving_cents": number}]`;
}

function extractJson(text: string): string {
  const match = text.match(/\[[\s\S]*\]/);
  return match ? match[0] : text;
}
