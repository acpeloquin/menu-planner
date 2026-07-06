-- Inventaire du garde-manger/frigo de l'utilisateur : sert à la fois à
-- orienter la génération de menu (utiliser ce qu'on a déjà) et à réduire la
-- liste d'épicerie (ne pas racheter ce qui est déjà en stock).

create table pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  ingredient_name text not null,
  quantity numeric,
  unit text,
  created_at timestamptz not null default now()
);

alter table pantry_items enable row level security;

create policy "pantry_items_all_own" on pantry_items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
