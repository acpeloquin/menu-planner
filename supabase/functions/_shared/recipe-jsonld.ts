// Extraction du bloc JSON-LD schema.org/Recipe d'une page HTML de recette.
// Les 3 sites de la banque (Ricardo, SOSCuisine, Ottolenghi) l'embarquent tous
// pour le rich-snippet Google — ça évite de faire analyser le HTML par Claude.

export interface RawRecipeJsonLd {
  name?: string;
  image?: string | string[];
  recipeIngredient?: string[];
  recipeInstructions?: unknown;
  recipeYield?: string | number;
  prepTime?: string;
  cookTime?: string;
  nutrition?: { calories?: string | number };
  recipeCategory?: string | string[];
  suitableForDiet?: string | string[];
}

export function extractRecipeJsonLd(html: string): RawRecipeJsonLd | null {
  const scriptMatches = html.matchAll(/<script[^>]*type=['"]application\/ld\+json['"][^>]*>([\s\S]*?)<\/script>/g);
  for (const match of scriptMatches) {
    try {
      const parsed = JSON.parse(match[1]);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const candidate of candidates) {
        if (candidate['@type'] === 'Recipe') return candidate as RawRecipeJsonLd;
        // Ottolenghi/Ricardo mettent parfois le Recipe dans un @graph.
        if (Array.isArray(candidate['@graph'])) {
          const recipe = candidate['@graph'].find((n: { '@type'?: string }) => n['@type'] === 'Recipe');
          if (recipe) return recipe as RawRecipeJsonLd;
        }
      }
    } catch {
      // bloc JSON-LD non-Recipe ou malformé, on continue
    }
  }
  return null;
}

// Aplati recipeInstructions (string[], HowToStep[], ou HowToSection[] imbriquées) en texte simple.
export function flattenInstructions(instructions: unknown): string {
  if (!instructions) return '';
  if (typeof instructions === 'string') return instructions;
  if (!Array.isArray(instructions)) return '';

  const steps: string[] = [];
  for (const item of instructions) {
    if (typeof item === 'string') {
      steps.push(item);
    } else if (item && typeof item === 'object') {
      const obj = item as { '@type'?: string; text?: string; name?: string; itemListElement?: unknown[] };
      if (obj['@type'] === 'HowToSection' && Array.isArray(obj.itemListElement)) {
        if (obj.name) steps.push(`${obj.name} :`);
        for (const sub of obj.itemListElement) {
          const subText = (sub as { text?: string })?.text;
          if (subText) steps.push(subText);
        }
      } else if (obj.text) {
        steps.push(obj.text);
      }
    }
  }
  return steps.join('\n');
}

export function firstImage(image: string | string[] | undefined): string | null {
  if (!image) return null;
  const url = Array.isArray(image) ? image[0] : image;
  if (!url) return null;
  return url.startsWith('//') ? `https:${url}` : url;
}

// PT25M / PT1H10M -> minutes
export function parseIsoDurationMinutes(duration: string | undefined): number | null {
  if (!duration) return null;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return null;
  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  return hours * 60 + minutes || null;
}
