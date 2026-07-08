import { corsHeaders } from '../_shared/cors.ts';
import { callClaude } from '../_shared/anthropic.ts';

// Reçoit du texte libre collé (flyer/site) et renvoie une liste d'aubaines
// structurées, à confirmer/éditer par l'utilisateur avant insertion en DB.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();
    if (!text || typeof text !== 'string') {
      throw new Error('Corps de requête invalide: champ "text" requis');
    }

    const prompt = `Voici un texte collé d'une circulaire ou d'un site d'épicerie. Extrais chaque aubaine sous forme de tableau JSON, avec les champs :
- product_name (string)
- price_cents (integer, prix en cents)
- price_unit (string ou null, ex: "lb", "kg", "ea")
- metric_equivalent (string ou null, ex: "8,80 kg")
- package_format (string ou null, ex: "170 g", "12 x 355 ml")
- has_tax (boolean)
- has_deposit (boolean)
- valid_from (date ISO ou null si absente du texte)
- valid_to (date ISO ou null si absente du texte)

Réponds uniquement avec le tableau JSON, sans texte additionnel.

Texte à parser :
"""
${text}
"""`;

    const raw = await callClaude(prompt, { maxTokens: 4096, thinking: { type: 'disabled' } });
    const deals = JSON.parse(extractJson(raw));

    return new Response(JSON.stringify({ deals }), {
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
  const match = text.match(/\[[\s\S]*\]/);
  return match ? match[0] : text;
}
