-- Les nouveaux connecteurs IGA/Maxi/Super C font de la vision IA sur ~16
-- pages de circulaire chacun — bien plus lent que le parsing HTML de
-- Dessaulles. Le dispatcher scrape-store traite tous les connecteurs
-- enregistrés de façon séquentielle DANS une seule invocation quand aucun
-- storeSlug n'est fourni ; avec 4 connecteurs (dont 3 lourds en vision), une
-- seule invocation dépasserait largement la limite d'inactivité de ~150s des
-- edge functions Supabase. On déclenche donc un appel net.http_post séparé
-- par connecteur (chacun borné par son propre budget de 150s) plutôt qu'un
-- seul appel sans storeSlug.
select cron.unschedule('scrape-stores-daily');

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
    body := jsonb_build_object('storeSlug', slug)
  )
  from unnest(array['marche_dessaulles', 'iga', 'maxi', 'superc']) as slug;
  $$
);
