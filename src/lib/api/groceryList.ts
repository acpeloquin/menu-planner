import { supabase } from '@/lib/supabase';
import type { GroceryList, GroceryListItem } from '@/lib/types';

export interface GroceryListItemWithStore extends GroceryListItem {
  stores: { name: string } | null;
}

export async function invokeGenerateGroceryList(mealPlanId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('generate-grocery-list', {
    body: { mealPlanId },
  });
  if (error) throw error;
}

export async function getGroceryList(mealPlanId: string): Promise<GroceryList | null> {
  const { data, error } = await supabase
    .from('grocery_lists')
    .select('*')
    .eq('meal_plan_id', mealPlanId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getGroceryListItems(groceryListId: string): Promise<GroceryListItemWithStore[]> {
  const { data, error } = await supabase
    .from('grocery_list_items')
    .select('*, stores(name)')
    .eq('grocery_list_id', groceryListId)
    .order('ingredient_name');
  if (error) throw error;
  return data as unknown as GroceryListItemWithStore[];
}

export async function setItemChecked(itemId: string, isChecked: boolean): Promise<void> {
  const { error } = await supabase.from('grocery_list_items').update({ is_checked: isChecked }).eq('id', itemId);
  if (error) throw error;
}
