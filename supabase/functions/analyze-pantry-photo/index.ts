import { corsHeaders } from '../_shared/cors.ts';
import { callClaude } from '../_shared/anthropic.ts';

interface AnalyzePantryPhotoRequest {
  imageBase64: string;
  mediaType: string;
}

// Analyse une photo de garde-manger/frigo et identifie les aliments visibles.
// Ne touche pas la DB : renvoie une liste à réviser/confirmer côté client
// avant insertion dans pantry_items (même pattern que parse-deal-text).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { imageBase64, mediaType } = (await req.json()) as AnalyzePantryPhotoRequest;
    if (!imageBase64 || !mediaType) {
      throw new Error('imageBase64 et mediaType requis');
    }

    const prompt = `Voici une photo d'un garde-manger, d'un frigo ou d'un congélateur. Identifie chaque
aliment ou produit alimentaire visible sur la photo.

Pour chaque item, estime une quantité si c'est raisonnablement visible (ex: nombre d'unités,
ou poids/volume approximatif indiqué sur l'emballage), sinon laisse quantity et unit à null.
Ignore les objets non alimentaires. Regroupe les doublons évidents (ex: 3 pots de yogourt
identiques -> un seul item avec quantity 3, unit "pot").

Réponds uniquement avec un objet JSON de la forme :
{"items": [{"ingredient_name": string, "quantity": number|null, "unit": string|null}]}`;

    const raw = await callClaude(prompt, {
      image: { base64: imageBase64, mediaType },
      maxTokens: 4096,
      thinking: { type: 'disabled' },
    });
    const parsed = JSON.parse(extractJson(raw));

    return new Response(JSON.stringify(parsed), {
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
