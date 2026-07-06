import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  addPantryItem,
  analyzePantryPhoto,
  listPantryItems,
  removePantryItem,
  type ParsedPantryItem,
} from '@/lib/api/pantry';
import { resizeImageToBase64 } from '@/lib/image';
import type { PantryItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DraftPantryItem extends ParsedPantryItem {
  tempId: string;
}

export default function PantryPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<PantryItem[]>([]);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<DraftPantryItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnalyzing(true);
    setError(null);
    setDrafts([]);
    try {
      const { base64, mediaType } = await resizeImageToBase64(file);
      const parsed = await analyzePantryPhoto(base64, mediaType);
      setDrafts(parsed.map((item, i) => ({ ...item, tempId: `${Date.now()}-${i}` })));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function updateDraft(tempId: string, patch: Partial<DraftPantryItem>) {
    setDrafts((current) => current.map((d) => (d.tempId === tempId ? { ...d, ...patch } : d)));
  }

  function removeDraft(tempId: string) {
    setDrafts((current) => current.filter((d) => d.tempId !== tempId));
  }

  async function handleSaveDrafts() {
    if (!user || drafts.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      for (const draft of drafts) {
        await addPantryItem(user.id, draft.ingredient_name, draft.quantity, draft.unit);
      }
      setDrafts([]);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
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
          <CardTitle className="text-base">Analyser une photo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Prends une photo de ton garde-manger ou de ton frigo — l'IA identifie les aliments visibles.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoSelected}
            disabled={analyzing}
            className="text-sm"
          />
          {analyzing && <p className="text-sm text-muted-foreground">Analyse en cours…</p>}
        </CardContent>
      </Card>

      {drafts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Items détectés ({drafts.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {drafts.map((draft) => (
              <div key={draft.tempId} className="flex flex-wrap items-center gap-2">
                <Input
                  value={draft.ingredient_name}
                  onChange={(e) => updateDraft(draft.tempId, { ingredient_name: e.target.value })}
                  className="flex-1 min-w-[160px]"
                />
                <Input
                  type="number"
                  placeholder="Quantité"
                  value={draft.quantity ?? ''}
                  onChange={(e) =>
                    updateDraft(draft.tempId, {
                      quantity: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="w-28"
                />
                <Input
                  placeholder="Unité"
                  value={draft.unit ?? ''}
                  onChange={(e) => updateDraft(draft.tempId, { unit: e.target.value || null })}
                  className="w-24"
                />
                <Button variant="ghost" size="sm" onClick={() => removeDraft(draft.tempId)}>
                  Retirer
                </Button>
              </div>
            ))}
            <Button onClick={handleSaveDrafts} disabled={saving}>
              {saving ? 'Ajout…' : `Ajouter ${drafts.length} item(s) au garde-manger`}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ajouter un item manuellement</CardTitle>
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
