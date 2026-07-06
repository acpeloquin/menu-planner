import { supabase } from '@/lib/supabase';

export interface ParsedDeal {
  product_name: string;
  price_cents: number;
  price_unit: string | null;
  metric_equivalent: string | null;
  package_format: string | null;
  has_tax: boolean;
  has_deposit: boolean;
  valid_from: string | null;
  valid_to: string | null;
}

export async function parseDealText(text: string): Promise<ParsedDeal[]> {
  const { data, error } = await supabase.functions.invoke<{ deals: ParsedDeal[] }>('parse-deal-text', {
    body: { text },
  });
  if (error) throw error;
  return data?.deals ?? [];
}
