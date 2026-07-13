import type { ScrapeStore } from './types.ts';
import { fetchCirculairesFlyerPages } from './circulaires-flyer.ts';
import { extractDealsFromFlyerImages } from './flyer-vision.ts';

// Super C (superc.ca, groupe Loblaw) est protégé par un anti-bot Akamai qui
// bloque tout fetch serveur-à-serveur. On lit plutôt la circulaire scannée
// hébergée sur circulaires.com par vision IA.
export const scrapeSuperC: ScrapeStore = async () => {
  const { images, validFrom, validTo } = await fetchCirculairesFlyerPages('superc');
  return extractDealsFromFlyerImages(images, 'Super C', validFrom, validTo);
};
