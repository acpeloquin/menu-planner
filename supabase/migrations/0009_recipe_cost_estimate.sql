-- Coût estimé des ingrédients par portion, pour comparer avec le budget max
-- par portion défini sur le plan de repas (meal_plans.budget_per_portion_cents).

alter table recipes
  add column estimated_cost_per_serving_cents integer;
