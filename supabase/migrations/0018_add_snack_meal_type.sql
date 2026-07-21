-- Ajoute les collations comme 4e type de repas (en plus de déjeuner/dîner/
-- souper) : fruits, yogourts, muffins, etc. Même modèle qu'un repas normal
-- (une collation par jour au maximum, comme pour les autres types).
alter table meal_plans add column num_snacks integer not null default 0;

alter table meal_plan_recipes drop constraint meal_plan_recipes_meal_type_check;
alter table meal_plan_recipes add constraint meal_plan_recipes_meal_type_check
  check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack'));
