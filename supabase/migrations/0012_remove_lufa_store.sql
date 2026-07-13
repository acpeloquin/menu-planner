-- Retrait du connecteur Lufa (0011) : son catalogue n'est pas dans le HTML
-- servi au navigateur mais peuplé en JS côté client dans le localStorage
-- après coup — inaccessible à un simple fetch depuis une edge function, donc
-- pas de scraping automatique possible sans un vrai navigateur headless.
-- Les aubaines Lufa repassent par la saisie manuelle (parse-deal-text).
delete from stores where connector_slug = 'lufa';
