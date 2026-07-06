// Registre des connecteurs de scraping disponibles, indexé par connector_slug
// (colonne stores.connector_slug). Pour ajouter un nouveau magasin :
//   1. Créer connectors/<magasin>.ts qui implémente ScrapeStore (voir types.ts)
//   2. Vérifier le robots.txt du site avant de l'ajouter (voir README)
//   3. L'ajouter ici avec son connector_slug
//   4. Ajouter une entrée dans la table stores avec ce même connector_slug
// Aucune nouvelle edge function ni entrée de cron n'est nécessaire : le
// dispatcher générique scrape-store gère tous les connecteurs enregistrés ici.
import type { ScrapeStore } from './types.ts';
import { scrapeMarcheDessaulles } from './marche-dessaulles.ts';

export const CONNECTORS: Record<string, ScrapeStore> = {
  marche_dessaulles: scrapeMarcheDessaulles,
};
