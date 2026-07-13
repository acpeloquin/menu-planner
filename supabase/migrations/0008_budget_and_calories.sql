-- Budget max par portion (contrainte de génération) et estimation de calories
-- par portion (affichée sur chaque recette).

alter table meal_plans
  add column budget_per_portion_cents integer not null default 700
  check (budget_per_portion_cents between 0 and 2500);

alter table recipes
  add column calories_per_serving integer;
