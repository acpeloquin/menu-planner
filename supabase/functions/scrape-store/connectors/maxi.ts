import type { VisionFlyerConnector } from './types.ts';
import { fetchCirculairesFlyerPages } from './circulaires-flyer.ts';
import { extractDealsFromFlyerImages } from './flyer-vision.ts';

// Maxi (maxi.ca, groupe Loblaw) est protégé par un anti-bot Akamai qui
// bloque tout fetch serveur-à-serveur. On lit plutôt la circulaire scannée
// hébergée sur circulaires.com par vision IA.
export const scrapeMaxi: VisionFlyerConnector = {
  kind: 'vision-flyer',
  fetchFlyer: () => fetchCirculairesFlyerPages('maxi'),
  extractDeals: (images, validFrom, validTo) => extractDealsFromFlyerImages(images, 'Maxi', validFrom, validTo),
};
