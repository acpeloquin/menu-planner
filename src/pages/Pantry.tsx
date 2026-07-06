import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { addPantryItem, listPantryItems, removePantryItem } from '@/lib/api/pantry';
import type { PantryItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function PantryPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<PantryItem[]>([]);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function refresh() {
    if (!user) return;
    const data = await listPantryItems(user.id);
    setItems(data);
    setLoading(false);
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!user || !name.trim()) return;
    try {
      await addPantryItem(
        user.id,
        name.trim(),
        quantity.trim() ? Number(quantity) : null,
        unit.trim() || null,
      );
      setName('');
      setQuantity('');
      setUnit('');
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleRemove(id: string) {
    try {
      await removePantryItem(id);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (loading) return <p className="text-muted-foreground">Chargement…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Garde-manger / frigo</h1>
        <p className="text-sm text-muted-foreground">
          Ce que tu as déjà en note pour orienter le menu et réduire la liste d'épicerie.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ajouter un item</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="flex flex-wrap gap-2">
            <Input
              placeholder="Ingrédient (ex: Poulet, riz…)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 min-w-[160px]"
            />
            <Input
              type="number"
              placeholder="Quantité (optionnel)"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-40"
            />
            <Input
              placeholder="Unité (ex: g, ml…)"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-32"
            />
            <Button type="submit">Ajouter</Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            Laisse quantité/unité vide si tu veux juste indiquer "j'en ai déjà" sans précision.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-md border p-3">
            <span>
              {item.ingredient_name}
              {item.quantity !== null && (
                <span className="text-muted-foreground">
                  {' '}
                  — {item.quantity} {item.unit ?? ''}
                </span>
              )}
            </span>
            <Button size="sm" variant="ghost" onClick={() => handleRemove(item.id)}>
              Retirer
            </Button>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucun item pour l'instant.</p>
        )}
      </div>
    </div>
  );
}
