import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  createStore,
  deleteStore,
  followStore,
  listStores,
  listUserStores,
  setDefaultStore,
  unfollowStore,
} from '@/lib/api/stores';
import type { Store, UserStore } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function Stores() {
  const { user } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [userStores, setUserStores] = useState<UserStore[]>([]);
  const [newStoreName, setNewStoreName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!user) return;
    const [storesData, userStoresData] = await Promise.all([listStores(), listUserStores(user.id)]);
    setStores(storesData);
    setUserStores(userStoresData);
    setLoading(false);
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [user]);

  const followedIds = new Set(userStores.map((us) => us.store_id));
  const defaultId = userStores.find((us) => us.is_default)?.store_id;

  async function handleAddStore(e: FormEvent) {
    e.preventDefault();
    if (!user || !newStoreName.trim()) return;
    try {
      await createStore(newStoreName.trim(), null, user.id);
      setNewStoreName('');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function toggleFollow(storeId: string) {
    if (!user) return;
    try {
      if (followedIds.has(storeId)) {
        await unfollowStore(user.id, storeId);
      } else {
        await followStore(user.id, storeId);
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleSetDefault(storeId: string) {
    if (!user) return;
    try {
      await setDefaultStore(user.id, storeId);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleDelete(store: Store) {
    if (!confirm(`Retirer "${store.name}" ? Ses aubaines seront aussi supprimées.`)) return;
    try {
      await deleteStore(store.id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (loading) return <p className="text-muted-foreground">Chargement…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Magasins</h1>
        <p className="text-sm text-muted-foreground">
          Suis les magasins où tu magasines et choisis-en un par défaut.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ajouter un magasin</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddStore} className="flex gap-2">
            <Input
              placeholder="Nom du magasin"
              value={newStoreName}
              onChange={(e) => setNewStoreName(e.target.value)}
            />
            <Button type="submit">Ajouter</Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {stores.map((store) => (
          <div
            key={store.id}
            className="flex items-center justify-between rounded-md border p-3"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">{store.name}</span>
              {store.connector_slug && <Badge variant="secondary">scraping auto</Badge>}
              {defaultId === store.id && <Badge>défaut</Badge>}
            </div>
            <div className="flex gap-2">
              {followedIds.has(store.id) && defaultId !== store.id && (
                <Button size="sm" variant="outline" onClick={() => handleSetDefault(store.id)}>
                  Définir par défaut
                </Button>
              )}
              <Button
                size="sm"
                variant={followedIds.has(store.id) ? 'secondary' : 'default'}
                onClick={() => toggleFollow(store.id)}
              >
                {followedIds.has(store.id) ? 'Ne plus suivre' : 'Suivre'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleDelete(store)}>
                Retirer
              </Button>
            </div>
          </div>
        ))}
        {stores.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucun magasin pour l'instant.</p>
        )}
      </div>
    </div>
  );
}
