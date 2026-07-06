import { supabase } from '@/lib/supabase';
import type { Store, UserStore } from '@/lib/types';

export async function listStores(): Promise<Store[]> {
  const { data, error } = await supabase.from('stores').select('*').order('name');
  if (error) throw error;
  return data;
}

export async function listUserStores(userId: string): Promise<UserStore[]> {
  const { data, error } = await supabase.from('user_stores').select('*').eq('user_id', userId);
  if (error) throw error;
  return data;
}

export async function createStore(name: string, websiteUrl: string | null, userId: string): Promise<Store> {
  const { data, error } = await supabase
    .from('stores')
    .insert({ name, website_url: websiteUrl, created_by: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function followStore(userId: string, storeId: string): Promise<void> {
  const { error } = await supabase.from('user_stores').insert({ user_id: userId, store_id: storeId });
  if (error) throw error;
}

export async function unfollowStore(userId: string, storeId: string): Promise<void> {
  const { error } = await supabase
    .from('user_stores')
    .delete()
    .eq('user_id', userId)
    .eq('store_id', storeId);
  if (error) throw error;
}

export async function setDefaultStore(userId: string, storeId: string): Promise<void> {
  const { error: clearError } = await supabase
    .from('user_stores')
    .update({ is_default: false })
    .eq('user_id', userId);
  if (clearError) throw clearError;

  const { error: setError } = await supabase
    .from('user_stores')
    .update({ is_default: true })
    .eq('user_id', userId)
    .eq('store_id', storeId);
  if (setError) throw setError;
}
