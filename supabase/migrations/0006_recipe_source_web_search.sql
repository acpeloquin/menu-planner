-- Ajoute 'web_search' aux valeurs permises de recipes.source, pour distinguer
-- une recette vraiment composée par l'IA (source_url = null) d'une recette
-- trouvée via recherche web sur un vrai site (source_url renseigné). Avant ce
-- changement, generate-menu et regenerate-meal marquaient toujours 'ai_generated'
-- même quand la recette venait d'une vraie source.

alter table recipes drop constraint recipes_source_check;
alter table recipes add constraint recipes_source_check
  check (source in ('ai_generated', 'web_search', 'manual'));
