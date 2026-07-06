import { DOMParser } from 'https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts';
import type { ScrapedDeal, ScrapeStore } from './types.ts';

const CIRCULAIRE_URL = 'https://marchedessaulles.com/circulaire/';

// Preuve de concept : HTML statique WordPress, pas de navigateur headless requis.
// La structure exacte des sélecteurs devra être ajustée après inspection du DOM
// réel (WP Rocket peut retarder la mise à jour du contenu de 1-2 jours après
// changement de circulaire — un scrape quotidien suffit).
export const scrapeMarcheDessaulles: ScrapeStore = async () => {
  const response = await fetch(CIRCULAIRE_URL);
  if (!response.ok) {
    throw new Error(`Échec du fetch de la circulaire Dessaulles: ${response.status}`);
  }

  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (!doc) {
    throw new Error('Échec du parsing HTML de la circulaire Dessaulles');
  }

  // TODO: ajuster ces sélecteurs une fois la structure réelle de la page
  // inspectée (classes WordPress spécifiques au thème de circulaire).
  const productNodes = doc.querySelectorAll('.circulaire-item, .product-item');

  const deals: ScrapedDeal[] = [];
  for (const node of productNodes) {
    const el = node as unknown as Element;
    const productName = el.querySelector('.product-name, .item-title')?.textContent?.trim();
    const priceText = el.querySelector('.product-price, .item-price')?.textContent?.trim();
    if (!productName || !priceText) continue;

    const { priceCents, priceUnit } = parsePriceText(priceText);
    const hasTax = /\+\s*tx/i.test(priceText);
    const hasDeposit = /\+\s*dpt/i.test(priceText);

    deals.push({
      productName,
      priceCents,
      priceUnit,
      metricEquivalent: extractParenthetical(priceText),
      packageFormat: el.querySelector('.product-format, .item-format')?.textContent?.trim() ?? null,
      hasTax,
      hasDeposit,
      imageUrl: el.querySelector('img')?.getAttribute('src') ?? null,
      validFrom: new Date().toISOString().slice(0, 10),
      validTo: new Date().toISOString().slice(0, 10),
      rawText: el.textContent?.trim() ?? null,
    });
  }

  return deals;
};

function parsePriceText(text: string): { priceCents: number; priceUnit: string | null } {
  // Ex: "3,99 $ lb" -> 399 cents, unité "lb"
  const match = text.match(/(\d+),(\d{2})\s*\$\s*([a-zA-Zà-ü/.]+)?/);
  if (!match) return { priceCents: 0, priceUnit: null };
  const [, dollars, cents, unit] = match;
  return { priceCents: Number(dollars) * 100 + Number(cents), priceUnit: unit?.trim() ?? null };
}

function extractParenthetical(text: string): string | null {
  const match = text.match(/\(([^)]+)\)/);
  return match ? match[1] : null;
}
