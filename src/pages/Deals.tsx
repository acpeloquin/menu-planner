import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { listStores } from '@/lib/api/stores';
import { parseDealText, type ParsedDeal } from '@/lib/api/parseDealText';
import { createDeals, listActiveDeals, type DealWithStore } from '@/lib/api/deals';
import type { Store } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface DraftDeal extends ParsedDeal {
  tempId: string;
}

const today = new Date().toISOString().slice(0, 10);
const inWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

function formatValidityRange(validFrom: string, validTo: string): string {
  const opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
  const from = new Date(`${validFrom}T00:00:00`).toLocaleDateString('fr-CA', opts);
  const to = new Date(`${validTo}T00:00:00`).toLocaleDateString('fr-CA', opts);
  return `${from} au ${to}`;
}

export default function Deals() {
  const { user } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>('');
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<DraftDeal[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeDeals, setActiveDeals] = useState<DealWithStore[]>([]);

  async function refreshDeals() {
    const data = await listActiveDeals();
    setActiveDeals(data);
  }

  useEffect(() => {
    listStores().then((data) => {
      setStores(data);
      if (data.length > 0) setStoreId((current) => current || data[0].id);
    });
    refreshDeals().catch((e) => setError(e.message));
  }, []);

  async function handleParse() {
    if (!text.trim()) return;
    setParsing(true);
    setError(null);
    try {
      const parsed = await parseDealText(text);
      setDrafts(
        parsed.map((deal, i) => ({
          ...deal,
          valid_from: deal.valid_from ?? today,
          valid_to: deal.valid_to ?? inWeek,
          tempId: `${Date.now()}-${i}`,
        })),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setParsing(false);
    }
  }

  function updateDraft(tempId: string, patch: Partial<DraftDeal>) {
    setDrafts((current) => current.map((d) => (d.tempId === tempId ? { ...d, ...patch } : d)));
  }

  function removeDraft(tempId: string) {
    setDrafts((current) => current.filter((d) => d.tempId !== tempId));
  }

  async function handleSave() {
    if (!user || !storeId || drafts.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await createDeals(
        drafts.map((d) => ({
          store_id: storeId,
          product_name: d.product_name,
          price_cents: d.price_cents,
          price_unit: d.price_unit,
          metric_equivalent: d.metric_equivalent,
          package_format: d.package_format,
          has_tax: d.has_tax,
          has_deposit: d.has_deposit,
          image_url: null,
          valid_from: d.valid_from ?? today,
          valid_to: d.valid_to ?? inWeek,
          source: 'manual',
          raw_text: text,
        })),
        user.id,
      );
      setDrafts([]);
      setText('');
      await refreshDeals();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Aubaines</h1>
        <p className="text-sm text-muted-foreground">
          Colle le texte d'une circulaire pour en extraire les aubaines automatiquement.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saisie manuelle</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Magasin</label>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir un magasin" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((store) => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {stores.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Ajoute d'abord un magasin dans l'onglet Magasins.
              </p>
            )}
          </div>

          <Textarea
            placeholder="Colle ici le texte de la circulaire (ex: Tomates roses, rouges, sur vignes ou Roma 3,99 $ lb (8,80 kg))"
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          <Button onClick={handleParse} disabled={parsing || !text.trim() || !storeId}>
            {parsing ? 'Analyse en cours…' : 'Parser le texte'}
          </Button>
        </CardContent>
      </Card>

      {drafts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aubaines détectées ({drafts.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {drafts.map((draft) => (
              <div key={draft.tempId} className="space-y-2 rounded-md border p-3">
                <div className="flex gap-2">
                  <Input
                    value={draft.product_name}
                    onChange={(e) => updateDraft(draft.tempId, { product_name: e.target.value })}
                    className="flex-1"
                  />
                  <Button variant="ghost" size="sm" onClick={() => removeDraft(draft.tempId)}>
                    Retirer
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <Input
                    type="number"
                    step="0.01"
                    className="w-24"
                    value={(draft.price_cents / 100).toFixed(2)}
                    onChange={(e) =>
                      updateDraft(draft.tempId, { price_cents: Math.round(Number(e.target.value) * 100) })
                    }
                  />
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input
                    className="w-24"
                    placeholder="unité (lb, kg…)"
                    value={draft.price_unit ?? ''}
                    onChange={(e) => updateDraft(draft.tempId, { price_unit: e.target.value || null })}
                  />
                  <Input
                    className="w-32"
                    placeholder="format"
                    value={draft.package_format ?? ''}
                    onChange={(e) => updateDraft(draft.tempId, { package_format: e.target.value || null })}
                  />
                  <label className="flex items-center gap-1 text-sm">
                    <Checkbox
                      checked={draft.has_tax}
                      onCheckedChange={(checked) => updateDraft(draft.tempId, { has_tax: checked === true })}
                    />
                    +tx
                  </label>
                  <label className="flex items-center gap-1 text-sm">
                    <Checkbox
                      checked={draft.has_deposit}
                      onCheckedChange={(checked) =>
                        updateDraft(draft.tempId, { has_deposit: checked === true })
                      }
                    />
                    +dpt
                  </label>
                </div>
                <div className="flex gap-2 items-center text-sm">
                  <span className="text-muted-foreground">Valide du</span>
                  <Input
                    type="date"
                    className="w-40"
                    value={draft.valid_from ?? today}
                    onChange={(e) => updateDraft(draft.tempId, { valid_from: e.target.value })}
                  />
                  <span className="text-muted-foreground">au</span>
                  <Input
                    type="date"
                    className="w-40"
                    value={draft.valid_to ?? inWeek}
                    onChange={(e) => updateDraft(draft.tempId, { valid_to: e.target.value })}
                  />
                </div>
              </div>
            ))}
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Enregistrement…' : `Enregistrer ${drafts.length} aubaine(s)`}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Aubaines actives</h2>
        {activeDeals.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucune aubaine active pour l'instant.</p>
        )}
        {activeDeals.map((deal) => (
          <div key={deal.id} className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="font-medium">{deal.product_name}</p>
              <p className="text-sm text-muted-foreground">
                {deal.stores?.name} · {(deal.price_cents / 100).toFixed(2)} $
                {deal.price_unit ? ` ${deal.price_unit}` : ''}
                {deal.package_format ? ` · ${deal.package_format}` : ''}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatValidityRange(deal.valid_from, deal.valid_to)}
              </p>
            </div>
            <div className="flex gap-1">
              {deal.has_tax && <Badge variant="secondary">+tx</Badge>}
              {deal.has_deposit && <Badge variant="secondary">+dpt</Badge>}
              {deal.source === 'scraping' && <Badge variant="outline">auto</Badge>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
