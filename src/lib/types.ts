// Types partagés, en miroir du schéma défini dans supabase/migrations/0001_init_schema.sql.
// À régénérer avec `supabase gen types typescript` une fois le projet Supabase lié.

export type DealSource = 'manual' | 'scraping';
export type MealType = 'breakfast' | 'lunch' | 'dinner';
export type MealPlanStatus = 'draft' | 'generating' | 'ready';
export type RecipeSource = 'ai_generated' | 'web_search' | 'manual';

export interface PantryItem {
  id: string;
  user_id: string;
  ingredient_name: string;
  quantity: number | null;
  unit: string | null;
  created_at: string;
}

export interface Store {
  id: string;
  name: string;
  connector_slug: string | null;
  website_url: string | null;
  created_by: string | null;
  created_at: string;
}

export interface UserStore {
  user_id: string;
  store_id: string;
  is_default: boolean;
  created_at: string;
}

export interface Deal {
  id: string;
  store_id: string;
  product_name: string;
  price_cents: number;
  price_unit: string | null;
  metric_equivalent: string | null;
  package_format: string | null;
  has_tax: boolean;
  has_deposit: boolean;
  image_url: string | null;
  valid_from: string;
  valid_to: string;
  source: DealSource;
  raw_text: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Diet {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_predefined: boolean;
  created_by: string | null;
  created_at: string;
}

export interface MealPlan {
  id: string;
  user_id: string;
  week_start_date: string;
  diet_id: string | null;
  servings: number;
  num_breakfasts: number;
  num_lunches: number;
  num_dinners: number;
  preferences: string | null;
  budget_per_portion_cents: number;
  status: MealPlanStatus;
  created_at: string;
  updated_at: string;
}

export interface RecipeIngredient {
  name: string;
  quantity: number;
  unit: string;
  deal_id?: string | null;
}

export interface Recipe {
  id: string;
  title: string;
  ingredients: RecipeIngredient[];
  steps: string;
  prep_time_minutes: number | null;
  calories_per_serving: number | null;
  estimated_cost_per_serving_cents: number | null;
  diet_tags: string[] | null;
  source: RecipeSource;
  source_url: string | null;
  created_by: string | null;
  created_at: string;
}

export interface FavoriteRecipe {
  user_id: string;
  recipe_id: string;
  created_at: string;
}

export interface MealPlanRecipe {
  id: string;
  meal_plan_id: string;
  recipe_id: string;
  day_index: number;
  meal_type: MealType;
  is_locked: boolean;
  created_at: string;
}

export interface GroceryList {
  id: string;
  meal_plan_id: string;
  generated_at: string;
}

export interface GroceryListItem {
  id: string;
  grocery_list_id: string;
  ingredient_name: string;
  total_quantity: number | null;
  unit: string | null;
  category: string | null;
  store_id: string | null;
  deal_id: string | null;
  estimated_price_cents: number | null;
  is_checked: boolean;
  created_at: string;
}
