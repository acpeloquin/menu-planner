// Interface commune à tous les connecteurs de scraping par magasin.
// Chaque nouveau site (Dessaulles, puis d'autres) implémente `scrapeStore`.

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

export type ScrapeStore = (config: StoreConfig) => Promise<ScrapedDeal[]>;
