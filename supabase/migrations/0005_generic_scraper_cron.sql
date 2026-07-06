-- Remplace le cron dédié à Marché Dessaulles par un cron générique qui appelle
-- le dispatcher scrape-store (sans storeSlug -> scrape tous les magasins ayant
-- un connecteur enregistré). Voir supabase/functions/scrape-store/connectors/registry.ts
-- pour ajouter un nouveau magasin sans créer de nouvelle fonction ni de nouveau cron.

do $$
begin
  perform cron.unschedule('scrape-marche-dessaulles-daily');
exception when others then
  null; -- le job n'existe pas encore sur un environnement neuf, ce n'est pas une erreur
end $$;

select cron.schedule(
  'scrape-stores-daily',
  '0 10 * * *', -- 10:00 UTC = 6h HAE / 5h HNE
  $$
  select net.http_post(
    url := 'https://lmvclyoqfctyyzhftuzq.supabase.co/functions/v1/scrape-store',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
