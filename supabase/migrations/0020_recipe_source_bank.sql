-- Ajoute 'recipe_bank' aux valeurs permises de recipes.source : une recette
-- créée à partir d'un match dans recipe_bank (voir 0019_recipe_bank.sql),
-- distincte d'une recette composée par l'IA ou trouvée par recherche web live.
alter table recipes drop constraint recipes_source_check;
alter table recipes add constraint recipes_source_check
  check (source in ('ai_generated', 'web_search', 'manual', 'recipe_bank'));
