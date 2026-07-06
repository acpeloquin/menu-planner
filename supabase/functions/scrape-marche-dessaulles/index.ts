import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase-admin.ts';
import { scrapeMarcheDessaulles } from './connectors/marche-dessaulles.ts';

// Déclenché par un cron Supabase (pg_cron / Scheduled Function), 1x/jour.
// Peut aussi être appelé manuellement pour tester le connecteur.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createAdminClient();

    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('id, connector_slug')
      .eq('connector_slug', 'marche_dessaulles')
      .single();

    if (storeError || !store) {
      throw new Error('Magasin Marché Dessaulles introuvable (connector_slug: marche_dessaulles)');
    }

    const scraped = await scrapeMarcheDessaulles({ storeId: store.id, connectorSlug: 'marche_dessaulles' });

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

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from('deals').insert(rows);
      if (insertError) throw insertError;
    }

    return new Response(JSON.stringify({ inserted: rows.length }), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }
});
