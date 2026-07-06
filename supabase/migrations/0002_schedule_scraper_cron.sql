-- Planifie le scraping quotidien de Marché Dessaulles via pg_cron + pg_net.
-- WP Rocket met le site en cache : le contenu peut prendre 1-2 jours à
-- refléter un changement de circulaire, un scrape 1x/jour suffit.
--
-- Prérequis manuel (non versionné, à faire une fois par projet Supabase) :
--   select vault.create_secret('<service_role_key>', 'service_role_key');
-- La clé service_role ne doit jamais apparaître dans une migration commitée.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'scrape-marche-dessaulles-daily',
  '0 10 * * *', -- 10:00 UTC = 6h HAE / 5h HNE
  $$
  select net.http_post(
    url := 'https://lmvclyoqfctyyzhftuzq.supabase.co/functions/v1/scrape-marche-dessaulles',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
