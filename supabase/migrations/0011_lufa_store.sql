-- Ajoute Lufa (Montréal) comme magasin avec scraping automatique, en plus de
-- Marché Dessaulles. Contrairement à Dessaulles (circulaire publique
-- statique), le catalogue Lufa n'est visible qu'une fois connecté à un
-- compte avec une zone de livraison active — le connecteur `lufa` se
-- connecte avec les secrets LUFA_EMAIL / LUFA_PASSWORD (Supabase secrets)
-- pour lire uniquement le catalogue, jamais d'action sur le panier/la commande.
insert into stores (name, connector_slug, website_url)
values ('Marché des Fermes Lufa (Montréal)', 'lufa', 'https://montreal.lufa.com');
