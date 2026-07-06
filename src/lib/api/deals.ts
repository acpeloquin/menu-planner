import { supabase } from '@/lib/supabase';
import type { Deal } from '@/lib/types';

export type NewDeal = Omit<Deal, 'id' | 'created_at' | 'created_by'>;

export async function createDeals(deals: NewDeal[], userId: string): Promise<void> {
  const rows = deals.map((deal) => ({ ...deal, created_by: userId }));
  const { error } = await supabase.from('deals').insert(rows);
  if (error) throw error;
}

export interface DealWithStore extends Deal {
  stores: { name: string } | null;
}

export async function listActiveDeals(): Promise<DealWithStore[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('deals')
    .select('*, stores(name)')
    .lte('valid_from', today)
    .gte('valid_to', today)
    .order('product_name');
  if (error) throw error;
  return data as unknown as DealWithStore[];
}
