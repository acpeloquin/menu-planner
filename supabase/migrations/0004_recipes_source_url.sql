-- Permet de tracer la recette d'origine quand elle vient d'une recherche web
-- sur un site de recettes (soscuisine.com, ricardocuisine.com, ici.radio-canada.ca,
-- ottolenghi.co.uk, jamieoliver.com) plutôt que d'être générée de toutes pièces.

alter table recipes add column source_url text;
