import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getLatestMealPlan } from '@/lib/api/mealPlans';
import {
  getGroceryList,
  getGroceryListItems,
  invokeGenerateGroceryList,
  setItemChecked,
  type GroceryListItemWithStore,
} from '@/lib/api/groceryList';
import type { MealPlan } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';

const CATEGORY_LABELS: Record<string, string> = {
  fruits_legumes: 'Fruits et légumes',
  proteines: 'Protéines',
  produits_laitiers: 'Produits laitiers',
  boulangerie: 'Boulangerie',
  epicerie: 'Épicerie',
  autre: 'Autre',
};
const CATEGORY_ORDER = ['fruits_legumes', 'proteines', 'produits_laitiers', 'boulangerie', 'epicerie', 'autre'];
const NO_STORE_LABEL = 'Sans magasin assigné';

function formatPrice(cents: number | null): string {
  return cents === null ? '' : `${(cents / 100).toFixed(2)} $`;
}

export default function GroceryListPage() {
  const { user } = useAuth();
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);
  const [items, setItems] = useState<GroceryListItemWithStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function refresh() {
    if (!user) return;
    const plan = await getLatestMealPlan(user.id);
    setMealPlan(plan);
    if (plan) {
      const list = await getGroceryList(plan.id);
      if (list) {
        const groceryItems = await getGroceryListItems(list.id);
        setItems(groceryItems);
      } else {
        setItems([]);
      }
    }
    setLoading(false);
  }

  async function handleGenerate() {
    if (!mealPlan) return;
    setGenerating(true);
    setError(null);
    try {
      await invokeGenerateGroceryList(mealPlan.id);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleToggle(item: GroceryListItemWithStore) {
    setItems((current) =>
      current.map((i) => (i.id === item.id ? { ...i, is_checked: !i.is_checked } : i)),
    );
    try {
      await setItemChecked(item.id, !item.is_checked);
    } catch (err) {
      setError((err as Error).message);
      await refresh();
    }
  }

  function handleCopyText() {
    const text = formatItemsAsText(items);
    navigator.clipboard.writeText(text);
  }

  if (loading) return <p className="text-muted-foreground">Chargement…</p>;

  if (!mealPlan) {
    return (
      <p className="text-sm text-muted-foreground">
        Génère d'abord un menu dans l'onglet Menu pour pouvoir créer une liste d'épicerie.
      </p>
    );
  }

  const byStore = new Map<string, GroceryListItemWithStore[]>();
  for (const item of items) {
    const storeName = item.stores?.name ?? NO_STORE_LABEL;
    const list = byStore.get(storeName) ?? [];
    list.push(item);
    byStore.set(storeName, list);
  }
  const storeNames = [...byStore.keys()].sort((a, b) =>
    a === NO_STORE_LABEL ? 1 : b === NO_STORE_LABEL ? -1 : a.localeCompare(b),
  );
  const grandTotalCents = items.reduce((sum, i) => sum + (i.estimated_price_cents ?? 0), 0);

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-semibold">Liste d'épicerie</h1>
          <p className="text-sm text-muted-foreground">
            Générée à partir du menu de la semaine du{' '}
            {new Date(`${mealPlan.week_start_date}T00:00:00`).toLocaleDateString('fr-CA')}.
          </p>
        </div>
        <Button onClick={handleGenerate} disabled={generating}>
          {generating ? 'Génération…' : items.length > 0 ? 'Régénérer' : 'Générer la liste'}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive print:hidden">{error}</p>}

      {items.length > 0 && (
        <>
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={handleCopyText}>
              Copier en texte
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Imprimer
            </Button>
          </div>

          <p className="text-sm font-medium">Total estimé : {formatPrice(grandTotalCents)}</p>

          {storeNames.map((storeName) => {
            const storeItems = byStore.get(storeName)!;
            const storeTotal = storeItems.reduce((sum, i) => sum + (i.estimated_price_cents ?? 0), 0);
            const byCategory = new Map<string, GroceryListItemWithStore[]>();
            for (const item of storeItems) {
              const list = byCategory.get(item.category ?? 'autre') ?? [];
              list.push(item);
              byCategory.set(item.category ?? 'autre', list);
            }

            return (
              <Card key={storeName}>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-baseline justify-between">
                    <h2 className="font-semibold">{storeName}</h2>
                    <span className="text-sm text-muted-foreground">{formatPrice(storeTotal)}</span>
                  </div>
                  {CATEGORY_ORDER.filter((cat) => byCategory.has(cat)).map((category) => (
                    <div key={category} className="space-y-1">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {CATEGORY_LABELS[category] ?? category}
                      </h3>
                      {byCategory.get(category)!.map((item) => (
                        <label
                          key={item.id}
                          className={`flex items-center gap-2 text-sm ${
                            item.is_checked ? 'text-muted-foreground line-through' : ''
                          }`}
                        >
                          <Checkbox checked={item.is_checked} onCheckedChange={() => handleToggle(item)} />
                          <span className="flex-1">
                            {item.total_quantity} {item.unit} {item.ingredient_name}
                          </span>
                          {item.estimated_price_cents !== null && (
                            <span className="text-muted-foreground">{formatPrice(item.estimated_price_cents)}</span>
                          )}
                        </label>
                      ))}
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}

function formatItemsAsText(items: GroceryListItemWithStore[]): string {
  const byStore = new Map<string, GroceryListItemWithStore[]>();
  for (const item of items) {
    const storeName = item.stores?.name ?? NO_STORE_LABEL;
    const list = byStore.get(storeName) ?? [];
    list.push(item);
    byStore.set(storeName, list);
  }

  const lines: string[] = [];
  for (const [storeName, storeItems] of byStore) {
    lines.push(`# ${storeName}`);
    for (const item of storeItems) {
      const checkbox = item.is_checked ? '[x]' : '[ ]';
      const price = item.estimated_price_cents !== null ? ` (${formatPrice(item.estimated_price_cents)})` : '';
      lines.push(`${checkbox} ${item.total_quantity} ${item.unit} ${item.ingredient_name}${price}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}
