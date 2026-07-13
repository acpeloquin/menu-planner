-- Photo de la recette, récupérée depuis la page source quand une recherche
-- web en trouve une (jamais générée/inventée pour une recette composée par l'IA).

alter table recipes
  add column image_url text;
