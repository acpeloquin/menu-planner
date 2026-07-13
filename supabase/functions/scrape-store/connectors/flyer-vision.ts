import { callClaude } from '../../_shared/anthropic.ts';
import type { ScrapedDeal } from './types.ts';
import type { FlyerImage } from './circulaires-flyer.ts';

// Les pages de circulaire sont des images scannées (pas de HTML structuré à
// parser, contrairement à Marché Dessaulles) — on lit donc les prix par
// vision IA, même principe que analyze-pantry-photo.
//
// Une circulaire complète (souvent 12-16 pages) produit trop de produits
// pour un seul appel Claude dans le budget de temps d'une edge function
// (~150s) : la réponse devient trop longue à générer et finit tronquée avant
// la fin du JSON. On découpe donc les images en petits lots envoyés EN
// PARALLÈLE (Promise.all) plutôt qu'un seul gros appel séquentiel — chaque
// lot produit une réponse courte et rapide, et le temps total reste borné
// par le lot le plus lent plutôt que par la somme de tous les lots.
const BATCH_SIZE = 4;

export async function extractDealsFromFlyerImages(
  images: FlyerImage[],
  storeName: string,
  validFrom: string,
  validTo: string,
): Promise<ScrapedDeal[]> {
  const batches: FlyerImage[][] = [];
  for (let i = 0; i < images.length; i += BATCH_SIZE) {
    batches.push(images.slice(i, i + BATCH_SIZE));
  }

  const batchResults = await Promise.all(
    batches.map((batch) =>
      extractDealsFromBatch(batch, storeName, validFrom, validTo).catch(() => [] as ScrapedDeal[]),
    ),
  );

  return batchResults.flat();
}

async function extractDealsFromBatch(
  images: FlyerImage[],
  storeName: string,
  validFrom: string,
  validTo: string,
): Promise<ScrapedDeal[]> {
  const prompt = `Voici ${images.length} pages scannées de la circulaire de "${storeName}", valide du
${validFrom} au ${validTo}. Identifie chaque produit en aubaine visible, avec son prix.

Pour chaque produit : nom, prix (en dollars canadiens, le prix RÉGULIER/COURANT affiché en gros,
pas un prix barré), l'unité si indiquée (ex: "lb", "kg", "ch.", "100g"), le format/emballage si
indiqué (ex: "454g", "paquet de 4"), et s'il y a un équivalent métrique affiché (ex: poids en kg
pour un prix au lb). Ignore les publicités qui ne sont pas des produits alimentaires avec un prix.
Si le même produit apparaît plusieurs fois, garde une seule entrée. Sois concis.

Réponds uniquement avec un objet JSON de la forme :
{"items": [{"product_name": string, "price": number, "unit": string|null, "package_format": string|null, "metric_equivalent": string|null, "has_tax": boolean, "has_deposit": boolean}]}`;

  const raw = await callClaude(prompt, {
    images,
    maxTokens: 8000,
    thinking: { type: 'disabled' },
  });
  const parsed = JSON.parse(extractJson(raw)) as {
    items: {
      product_name: string;
      price: number;
      unit: string | null;
      package_format: string | null;
      metric_equivalent: string | null;
      has_tax: boolean;
      has_deposit: boolean;
    }[];
  };

  return parsed.items
    .filter((item) => item.product_name && typeof item.price === 'number' && item.price > 0)
    .map((item) => ({
      productName: item.product_name.trim(),
      priceCents: Math.round(item.price * 100),
      priceUnit: item.unit,
      metricEquivalent: item.metric_equivalent,
      packageFormat: item.package_format,
      hasTax: Boolean(item.has_tax),
      hasDeposit: Boolean(item.has_deposit),
      imageUrl: null,
      validFrom,
      validTo,
      rawText: JSON.stringify(item),
    }));
}

function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}
