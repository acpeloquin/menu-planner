// Extraction du balisage schema.org/Recipe en microdata (itemprop/itemtype),
// utilisé par metro.ca au lieu de JSON-LD (voir recipe-jsonld.ts pour les
// sites qui utilisent JSON-LD comme Ricardo/SOSCuisine/Ottolenghi).

import type { RawRecipeJsonLd } from './recipe-jsonld.ts';

function decodeEntities(text: string): string {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&eacute;/g, 'é')
    .replace(/&egrave;/g, 'è')
    .replace(/&agrave;/g, 'à')
    .replace(/&ccedil;/g, 'ç')
    .trim();
}

function extractProp(html: string, prop: string): string | null {
  const match = html.match(new RegExp(`<span itemprop="${prop}">([^<]*)<\\/span>`));
  return match ? decodeEntities(match[1]) : null;
}

export function extractRecipeMicrodata(html: string): RawRecipeJsonLd | null {
  if (!html.includes('itemtype="http://schema.org/Recipe"') && !html.includes('itemtype="https://schema.org/Recipe"')) {
    return null;
  }

  const name = extractProp(html, 'name');
  const ingredientMatches = [...html.matchAll(/<span itemprop="recipeIngredient">([^<]*)<\/span>/g)];
  const recipeIngredient = ingredientMatches.map((m) => decodeEntities(m[1]));
  if (!name || recipeIngredient.length === 0) return null;

  const instructionsBlock = html.match(/<div itemprop="recipeInstructions">([\s\S]*?)<\/div>/);
  const recipeInstructions = instructionsBlock
    ? [...instructionsBlock[1].matchAll(/<span>([^<]*)<\/span>/g)].map((m) => decodeEntities(m[1])).join('\n')
    : '';

  return {
    name,
    image: extractProp(html, 'image') ?? undefined,
    recipeIngredient,
    recipeInstructions,
    recipeYield: extractProp(html, 'recipeYield') ?? undefined,
    prepTime: extractProp(html, 'prepTime') ?? undefined,
    cookTime: extractProp(html, 'cookTime') ?? undefined,
  };
}
