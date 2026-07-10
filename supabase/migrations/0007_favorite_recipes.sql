-- Banque de recettes favorites par utilisateur. Une recette "aimée" reste
-- disponible d'une semaine à l'autre : la génération de menu peut la
-- réutiliser telle quelle (même recipe_id) plutôt que d'en composer une
-- nouvelle, notamment quand ses ingrédients correspondent aux aubaines de
-- la semaine.

create table favorite_recipes (
  user_id uuid not null references auth.users on delete cascade,
  recipe_id uuid not null references recipes on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

alter table favorite_recipes enable row level security;

create policy "favorite_recipes_all_own" on favorite_recipes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
