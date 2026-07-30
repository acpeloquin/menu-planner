// Interface commune à tous les connecteurs de scraping par magasin.
// Chaque nouveau site (Dessaulles, puis d'autres) implémente `scrapeStore`.

import type { FlyerImage } from './circulaires-flyer.ts';

export interface ScrapedDeal {
  productName: string;
  priceCents: number;
  priceUnit: string | null;
  metricEquivalent: string | null;
  packageFormat: string | null;
  hasTax: boolean;
  hasDeposit: boolean;
  imageUrl: string | null;
  validFrom: string; // ISO date
  validTo: string; // ISO date
  rawText: string | null;
}

export interface StoreConfig {
  storeId: string;
  connectorSlug: string;
}

// Connecteur "simple" : scrape et retourne les aubaines en un seul appel (ex:
// marche-dessaulles, HTML statique, pas d'appel Claude coûteux à ménager).
export type ScrapeStore = (config: StoreConfig) => Promise<ScrapedDeal[]>;

// Connecteur basé sur une circulaire scannée lue par vision IA (IGA, Maxi,
// Super C). Sépare la récupération de la fenêtre de validité (de simples
// requêtes HTTP vers circulaires.com, aucun appel Claude) de l'extraction des
// aubaines par vision (coûteuse en tokens), pour que le dispatcher (voir
// index.ts) puisse sauter cette dernière étape si la circulaire n'a pas
// changé depuis le dernier scrape réussi pour ce magasin.
export interface VisionFlyerConnector {
  kind: 'vision-flyer';
  fetchFlyer: () => Promise<{ validFrom: string; validTo: string; images: FlyerImage[] }>;
  extractDeals: (images: FlyerImage[], validFrom: string, validTo: string) => Promise<ScrapedDeal[]>;
}

export type Connector = ScrapeStore | VisionFlyerConnector;
