import type { ScrapeStore } from './types.ts';
import { fetchCirculairesFlyerPages } from './circulaires-flyer.ts';
import { extractDealsFromFlyerImages } from './flyer-vision.ts';

// IGA (iga.ca) est protégé par un anti-bot Akamai qui bloque tout fetch
// serveur-à-serveur (confirmé : 403 même avec des en-têtes de navigateur
// réalistes). On lit plutôt la circulaire scannée hébergée sur
// circulaires.com par vision IA (voir circulaires-flyer.ts / flyer-vision.ts).
export const scrapeIga: ScrapeStore = async () => {
  const { images, validFrom, validTo } = await fetchCirculairesFlyerPages('supermarche-iga');
  return extractDealsFromFlyerImages(images, 'IGA', validFrom, validTo);
};
