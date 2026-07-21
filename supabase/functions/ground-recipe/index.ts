import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase-admin.ts';
import { callClaude } from '../_shared/anthropic.ts';
import { RECIPE_SEARCH_TOOLS_LIGHT, RECIPE_SITES_DESCRIPTION } from '../_shared/recipe-search.ts';

interface GroundRecipeRequest {
  recipeId: string;
  mealType: string;
  title: string;
  servings: number;
  dietName: string | null;
}

// Ancre UNE recette déjà composée (par generate-menu ou ailleurs) dans une
// vraie recette trouvée sur les sites de référence, si possible — sinon la
// laisse telle quelle (composée par l'IA). Appelée une fois par repas depuis
// le frontend (au lieu de faire l'ancrage de plusieurs repas dans la même
// invocation de generate-menu, qui provoquait un timeout 504 : chaque appel
// ici a son propre budget de ~150s, complètement indépendant des autres).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { recipeId, mealType, title, servings, dietName } = (await req.json()) as GroundRecipeRequest;
    if (!recipeId || !mealType || !title || !servings) {
      throw new Error('recipeId, mealType, title, servings requis');
    }

    const supabase = createAdminClient();

    const prompt = `Fais des recherches web pour trouver PLUSIEURS vraies recettes candidates (pas
juste la première trouvée) de type "${mealType}" pour ${servings} portions, régime
"${dietName ?? 'omnivore'}", sur l'un de ces sites : ${RECIPE_SITES_DESCRIPTION}.
Le repas prévu était "${title}" — utilise ça comme simple inspiration/thème pour orienter ta
recherche (ex: type de protéine, cuisine, saison), mais la recette trouvée n'a PAS besoin de
porter ce nom ni d'être identique : n'importe quelle vraie recette de ce type de repas, adaptée au
régime, est une bonne candidate. Essaie plusieurs formulations de recherche si les premières ne
donnent rien (ex: par ingrédient principal, par style de cuisine, plus générique) avant de
conclure qu'il n'y a rien d'adéquat. Compare les candidates trouvées puis choisis la meilleure.
Si les résumés de recherche donnent déjà assez de détails, construis la recette directement à
partir du résumé de la meilleure candidate, sans ouvrir de page complète. N'utilise l'outil de
récupération de page qu'en dernier recours, pour confirmer les détails de la candidate choisie ou
trouver sa photo. Si la page source affiche une photo, inclus son URL dans "image_url" (sinon
null — n'invente jamais une URL d'image). Estime aussi les calories par portion et le coût des
ingrédients par portion (en cents canadiens). Réponds uniquement avec un objet JSON (aucun texte
avant/après), ou {"source_url": null} seulement si vraiment aucune recherche n'a rien donné :
{"title": string, "ingredients": [{"name": string, "quantity": number, "unit": string}], "steps": string, "prep_time_minutes": number, "calories_per_serving": number, "estimated_cost_per_serving_cents": number, "diet_tags": string[], "source_url": string|null, "image_url": string|null}`;

    const raw = await callClaude(prompt, { maxTokens: 4096, tools: RECIPE_SEARCH_TOOLS_LIGHT });
    const found = JSON.parse(extractJson(raw));

    if (!found.source_url) {
      return new Response(JSON.stringify({ ok: true, outcome: 'no-match' }), {
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      });
    }

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

    return new Response(JSON.stringify({ ok: true, outcome: 'grounded', source_url: found.source_url }), {
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
