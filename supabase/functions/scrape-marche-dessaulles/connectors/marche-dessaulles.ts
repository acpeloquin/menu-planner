import { DOMParser, type Element } from 'https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts';
import type { ScrapedDeal, ScrapeStore } from './types.ts';

const CIRCULAIRE_URL = 'https://marchedessaulles.com/circulaire/';

const MONTHS_FR: Record<string, string> = {
  janvier: '01',
  février: '02',
  mars: '03',
  avril: '04',
  mai: '05',
  juin: '06',
  juillet: '07',
  août: '08',
  septembre: '09',
  octobre: '10',
  novembre: '11',
  décembre: '12',
};

// Site WordPress + Divi Builder, HTML statique (pas de navigateur headless
// requis). Chaque produit est une colonne Divi (.et_pb_column) contenant, dans
// l'ordre : un module image, un module texte pour le nom (<h3>), un module
// texte pour le prix, et optionnellement un ou deux modules texte pour le
// format/équivalent métrique. WP Rocket met en cache la page : le contenu peut
// prendre 1-2 jours à refléter un changement de circulaire, un scrape
// quotidien suffit donc largement.
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

  const { validFrom, validTo } = parseValidityWeek(doc.querySelector('h4')?.textContent ?? '');

  const deals: ScrapedDeal[] = [];
  const columns = doc.querySelectorAll('.et_pb_column');

  for (const node of columns) {
    const column = node as unknown as Element;
    const nameEl = column.querySelector('h3');
    if (!nameEl) continue; // colonnes non-produits (bannières, en-têtes, etc.)

    const textInners = [...column.querySelectorAll('.et_pb_text_inner')] as Element[];
    const detailInners = textInners.filter((el) => !el.querySelector('h3'));
    if (detailInners.length === 0) continue; // pas de prix trouvé, on ignore

    const priceText = detailInners[0].textContent?.trim() ?? '';
    const { priceCents, priceUnit } = parsePriceText(priceText);
    if (priceCents === 0) continue; // prix non reconnu, on ignore plutôt que d'insérer une aubaine à 0$

    let metricEquivalent: string | null = null;
    let packageFormat: string | null = null;
    for (const extra of detailInners.slice(1)) {
      const text = extra.textContent?.trim() ?? '';
      if (!text) continue;
      if (/^\d+,\d{2}\s*kg$/i.test(text)) {
        metricEquivalent = text;
      } else {
        packageFormat = packageFormat ? `${packageFormat} | ${text}` : text;
      }
    }

    deals.push({
      productName: nameEl.textContent.replace(/\s+/g, ' ').trim(),
      priceCents,
      priceUnit,
      metricEquivalent,
      packageFormat,
      hasTax: /\+\s*tx/i.test(priceText),
      hasDeposit: /\+\s*dpt/i.test(priceText),
      imageUrl: column.querySelector('.et_pb_image_wrap img')?.getAttribute('src') ?? null,
      validFrom,
      validTo,
      rawText: column.textContent.replace(/\s+/g, ' ').trim(),
    });
  }

  return deals;
};

function parsePriceText(text: string): { priceCents: number; priceUnit: string | null } {
  // Ex: "3,99 $ lb" -> 399 cents, unité "lb"
  const dollarMatch = text.match(/(\d+),(\d{2})\s*\$\s*([a-zà-ü.]+)?/i);
  if (dollarMatch) {
    const [, dollars, cents, unit] = dollarMatch;
    return { priceCents: Number(dollars) * 100 + Number(cents), priceUnit: unit?.trim() || null };
  }

  // Ex: "99 ¢ ch." -> 99 cents, unité "ch."
  const centsMatch = text.match(/(\d+)\s*¢\s*([a-zà-ü.]+)?/i);
  if (centsMatch) {
    const [, cents, unit] = centsMatch;
    return { priceCents: Number(cents), priceUnit: unit?.trim() || null };
  }

  return { priceCents: 0, priceUnit: null };
}

function parseValidityWeek(headingText: string): { validFrom: string; validTo: string } {
  // Ex: "Semaine du 2 juillet au 8 juillet 2026"
  const match = headingText.match(
    /du\s+(\d{1,2})\s+([a-zà-ü]+)\s+au\s+(\d{1,2})\s+([a-zà-ü]+)\s+(\d{4})/i,
  );
  const today = new Date().toISOString().slice(0, 10);
  if (!match) {
    // Repli : semaine commençant aujourd'hui, si le titre n'est pas trouvé/parsable.
    const fallbackEnd = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return { validFrom: today, validTo: fallbackEnd };
  }

  const [, dayFrom, monthFromName, dayTo, monthToName, year] = match;
  const monthFrom = MONTHS_FR[monthFromName.toLowerCase()];
  const monthTo = MONTHS_FR[monthToName.toLowerCase()];
  if (!monthFrom || !monthTo) {
    const fallbackEnd = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return { validFrom: today, validTo: fallbackEnd };
  }

  return {
    validFrom: `${year}-${monthFrom}-${dayFrom.padStart(2, '0')}`,
    validTo: `${year}-${monthTo}-${dayTo.padStart(2, '0')}`,
  };
}
