-- Banque de recettes extraites une fois pour toutes de sites de référence
-- (Ricardo Cuisine, SOSCuisine, Ottolenghi — voir _shared/recipe-bank-sites.ts),
-- avec la source (site + url) conservée. Remplace la recherche web en direct
-- (trop coûteuse en tokens, voir migrations précédentes/historique dans
-- generate-menu) : generate-menu/regenerate-meal piochent maintenant dans
-- cette banque locale au lieu d'appeler des outils de recherche à chaque
-- génération. Alimentée uniquement par la fonction populate-recipe-bank
-- (service role) — jamais par les utilisateurs.
create table recipe_bank (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_site text not null,
  source_url text not null unique,
  image_url text,
  ingredients jsonb not null,
  steps text not null,
  prep_time_minutes integer,
  servings integer,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  diet_tags text[],
  calories_per_serving integer,
  estimated_cost_per_serving_cents integer,
  created_at timestamptz not null default now()
);

alter table recipe_bank enable row level security;

create policy "recipe_bank_select_authenticated" on recipe_bank for select to authenticated using (true);
