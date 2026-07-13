-- Ajoute IGA, Maxi et Super C comme magasins avec scraping automatique.
-- Leurs sites officiels sont protégés par un anti-bot Akamai qui bloque tout
-- fetch serveur-à-serveur (403 confirmé, même avec des en-têtes de navigateur
-- réalistes) — leurs connecteurs lisent plutôt les circulaires scannées
-- hébergées sur circulaires.com par vision IA (voir connectors/iga.ts,
-- maxi.ts, superc.ts).
insert into stores (name, connector_slug, website_url) values
  ('IGA', 'iga', 'https://www.iga.ca'),
  ('Maxi', 'maxi', 'https://www.maxi.ca'),
  ('Super C', 'superc', 'https://www.superc.ca');
