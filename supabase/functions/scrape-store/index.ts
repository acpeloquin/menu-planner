import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase-admin.ts';
import { CONNECTORS } from './connectors/registry.ts';
import type { ScrapedDeal } from './connectors/types.ts';

interface ScrapeStoreRequest {
  storeSlug?: string;
}

// Dispatcher générique de scraping : au lieu d'une edge function par magasin,
// une seule fonction qui délègue au connecteur enregistré pour le
// connector_slug de chaque magasin (voir connectors/registry.ts). Ajouter un
// nouveau magasin ne demande donc plus de nouvelle fonction ni de nouvelle
// entrée de cron — juste un nouveau connecteur + une ligne dans `stores`.
//
// Appelée par le cron quotidien sans storeSlug (scrape tous les magasins
// enregistrés), ou manuellement avec { "storeSlug": "..." } pour tester un
// connecteur en particulier.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const text = await req.text();
    const { storeSlug } = (text ? (JSON.parse(text) as ScrapeStoreRequest) : {}) ?? {};
    const supabase = createAdminClient();

    const connectorSlugs = storeSlug ? [storeSlug] : Object.keys(CONNECTORS);

    const { data: stores, error: storesError } = await supabase
      .from('stores')
      .select('id, name, connector_slug')
      .in('connector_slug', connectorSlugs);
    if (storesError) throw storesError;
    if (!stores || stores.length === 0) {
      throw new Error(`Aucun magasin trouvé pour connector_slug: ${connectorSlugs.join(', ')}`);
    }

    const results: { store: string; inserted?: number; error?: string }[] = [];

    for (const store of stores) {
      const connector = store.connector_slug ? CONNECTORS[store.connector_slug] : undefined;
      if (!connector) {
        results.push({ store: store.name, error: `Aucun connecteur enregistré pour "${store.connector_slug}"` });
        continue;
      }

      try {
        const scraped: ScrapedDeal[] = await connector({
          storeId: store.id,
          connectorSlug: store.connector_slug!,
        });

        const rows = scraped.map((deal) => ({
          store_id: store.id,
          product_name: deal.productName,
          price_cents: deal.priceCents,
          price_unit: deal.priceUnit,
          metric_equivalent: deal.metricEquivalent,
          package_format: deal.packageFormat,
          has_tax: deal.hasTax,
          has_deposit: deal.hasDeposit,
          image_url: deal.imageUrl,
          valid_from: deal.validFrom,
          valid_to: deal.validTo,
          source: 'scraping' as const,
          raw_text: deal.rawText,
        }));

        // On repart d'une ardoise propre pour ce magasin à chaque scrape (on
        // ne touche pas aux aubaines saisies manuellement) : sans ça, la même
        // circulaire re-scrapée chaque jour pendant sa semaine de validité
        // s'accumule en doublons plutôt que d'être simplement rafraîchie.
        const { error: deleteError } = await supabase
          .from('deals')
          .delete()
          .eq('store_id', store.id)
          .eq('source', 'scraping');
        if (deleteError) throw deleteError;

        if (rows.length > 0) {
          const { error: insertError } = await supabase.from('deals').insert(rows);
          if (insertError) throw insertError;
        }

        results.push({ store: store.name, inserted: rows.length });
      } catch (error) {
        results.push({ store: store.name, error: (error as Error).message });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }
});
