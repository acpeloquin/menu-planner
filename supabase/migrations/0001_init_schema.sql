-- Menu Planner: schema initial
-- Voir la proposition de conception pour le détail des choix (prix en cents,
-- stores/deals non scopés par utilisateur, user_stores pour les préférences).

create extension if not exists "pgcrypto";

-- Magasins (entité globale, partagée entre utilisateurs)
create table stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  connector_slug text,
  website_url text,
  created_by uuid references auth.users,
  created_at timestamptz not null default now()
);

-- Magasins suivis par un utilisateur + magasin par défaut
create table user_stores (
  user_id uuid not null references auth.users on delete cascade,
  store_id uuid not null references stores on delete cascade,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, store_id)
);

-- Aubaines (saisie manuelle ou scraping)
create table deals (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores on delete cascade,
  product_name text not null,
  price_cents integer not null,
  price_unit text,
  metric_equivalent text,
  package_format text,
  has_tax boolean not null default false,
  has_deposit boolean not null default false,
  image_url text,
  valid_from date not null,
  valid_to date not null,
  source text not null check (source in ('manual', 'scraping')),
  raw_text text,
  created_by uuid references auth.users,
  created_at timestamptz not null default now(),
  constraint deals_validity_check check (valid_to >= valid_from)
);
create index deals_store_validity_idx on deals (store_id, valid_from, valid_to);

-- Régimes alimentaires (prédéfinis + custom par utilisateur)
create table diets (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  is_predefined boolean not null default false,
  created_by uuid references auth.users,
  created_at timestamptz not null default now()
);

insert into diets (slug, name, is_predefined) values
  ('omnivore', 'Omnivore', true),
  ('vegetarien', 'Végétarien', true),
  ('vegetalien', 'Végétalien', true),
  ('mediterraneen', 'Méditerranéen', true),
  ('faible_glucides', 'Faible en glucides', true),
  ('sans_gluten', 'Sans gluten', true);

-- Plan de repas (une semaine)
create table meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  week_start_date date not null,
  diet_id uuid references diets,
  servings integer not null default 2,
  num_breakfasts integer not null default 0,
  num_lunches integer not null default 0,
  num_dinners integer not null default 0,
  preferences text,
  status text not null default 'draft' check (status in ('draft', 'generating', 'ready')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Recettes (générées par IA ou manuelles)
create table recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  ingredients jsonb not null,
  steps text not null,
  prep_time_minutes integer,
  diet_tags text[],
  source text not null default 'ai_generated' check (source in ('ai_generated', 'manual')),
  created_by uuid references auth.users,
  created_at timestamptz not null default now()
);

-- Association recette <-> plan de repas (jour + type de repas)
create table meal_plan_recipes (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid not null references meal_plans on delete cascade,
  recipe_id uuid not null references recipes on delete cascade,
  day_index integer not null check (day_index between 0 and 6),
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner')),
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  unique (meal_plan_id, day_index, meal_type)
);

-- Liste d'épicerie générée (une par plan de repas)
create table grocery_lists (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid not null unique references meal_plans on delete cascade,
  generated_at timestamptz not null default now()
);

-- Items agrégés de la liste d'épicerie
create table grocery_list_items (
  id uuid primary key default gen_random_uuid(),
  grocery_list_id uuid not null references grocery_lists on delete cascade,
  ingredient_name text not null,
  total_quantity numeric,
  unit text,
  category text,
  store_id uuid references stores,
  deal_id uuid references deals,
  estimated_price_cents integer,
  is_checked boolean not null default false,
  created_at timestamptz not null default now()
);

-- Row Level Security
alter table stores enable row level security;
alter table user_stores enable row level security;
alter table deals enable row level security;
alter table diets enable row level security;
alter table meal_plans enable row level security;
alter table recipes enable row level security;
alter table meal_plan_recipes enable row level security;
alter table grocery_lists enable row level security;
alter table grocery_list_items enable row level security;

-- stores / deals / diets : lecture publique authentifiée, écriture par le propriétaire
create policy "stores_select_authenticated" on stores for select to authenticated using (true);
create policy "stores_insert_own" on stores for insert to authenticated with check (created_by = auth.uid());
create policy "stores_update_own" on stores for update to authenticated using (created_by = auth.uid());

create policy "deals_select_authenticated" on deals for select to authenticated using (true);
create policy "deals_insert_own" on deals for insert to authenticated with check (created_by = auth.uid());
create policy "deals_update_own" on deals for update to authenticated using (created_by = auth.uid());

create policy "diets_select_authenticated" on diets for select to authenticated using (true);
create policy "diets_insert_own" on diets for insert to authenticated with check (created_by = auth.uid());
create policy "diets_update_own" on diets for update to authenticated using (created_by = auth.uid());

-- user_stores : uniquement le propriétaire
create policy "user_stores_all_own" on user_stores for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- meal_plans : uniquement le propriétaire
create policy "meal_plans_all_own" on meal_plans for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- recipes : lecture publique authentifiée (bibliothèque partagée), écriture par le créateur
create policy "recipes_select_authenticated" on recipes for select to authenticated using (true);
create policy "recipes_insert_own" on recipes for insert to authenticated with check (created_by = auth.uid());
create policy "recipes_update_own" on recipes for update to authenticated using (created_by = auth.uid());

-- meal_plan_recipes / grocery_lists / grocery_list_items : via le meal_plan parent
create policy "meal_plan_recipes_all_own" on meal_plan_recipes for all to authenticated
  using (exists (select 1 from meal_plans mp where mp.id = meal_plan_id and mp.user_id = auth.uid()))
  with check (exists (select 1 from meal_plans mp where mp.id = meal_plan_id and mp.user_id = auth.uid()));

create policy "grocery_lists_all_own" on grocery_lists for all to authenticated
  using (exists (select 1 from meal_plans mp where mp.id = meal_plan_id and mp.user_id = auth.uid()))
  with check (exists (select 1 from meal_plans mp where mp.id = meal_plan_id and mp.user_id = auth.uid()));

create policy "grocery_list_items_all_own" on grocery_list_items for all to authenticated
  using (exists (
    select 1 from grocery_lists gl
    join meal_plans mp on mp.id = gl.meal_plan_id
    where gl.id = grocery_list_id and mp.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from grocery_lists gl
    join meal_plans mp on mp.id = gl.meal_plan_id
    where gl.id = grocery_list_id and mp.user_id = auth.uid()
  ));
