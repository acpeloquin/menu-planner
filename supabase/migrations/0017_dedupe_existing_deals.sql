-- Nettoyage ponctuel : avant le fix dans scrape-store/index.ts (qui vide les
-- aubaines scrapées d'un magasin avant d'en réinsérer des fraîches), chaque
-- run ajoutait sans jamais retirer les anciennes lignes, donc plusieurs runs
-- de test le même jour ont pu dupliquer des aubaines. On garde une seule
-- ligne par (magasin, produit, prix, période de validité), on retire le reste.
delete from deals a using deals b
where a.id < b.id
  and a.store_id = b.store_id
  and a.product_name = b.product_name
  and a.price_cents = b.price_cents
  and a.valid_from = b.valid_from
  and a.valid_to = b.valid_to;
