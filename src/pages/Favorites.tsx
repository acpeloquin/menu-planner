import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { listFavoriteRecipes, removeFavorite, type FavoriteRecipeWithRecipe } from '@/lib/api/favorites';
import { recipeMetaLine } from '@/lib/recipeFormat';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function FavoritesPage() {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<FavoriteRecipeWithRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function refresh() {
    if (!user) return;
    try {
      const data = await listFavoriteRecipes(user.id);
      setFavorites(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(recipeId: string) {
    if (!user) return;
    try {
      await removeFavorite(user.id, recipeId);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (loading) return <p className="text-muted-foreground">Chargement…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Recettes favorites</h1>
        <p className="text-sm text-muted-foreground">
          Les recettes que tu as aimées. L'IA peut les réutiliser d'une semaine à l'autre quand
          leurs ingrédients correspondent aux aubaines du moment.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {favorites.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Aucune recette favorite pour l'instant — clique sur l'étoile d'une recette dans ton menu
          pour l'ajouter ici.
        </p>
      )}

      <div className="space-y-3">
        {favorites.map(({ recipe_id, recipes }) => (
          <Card key={recipe_id}>
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex gap-3">
                  {recipes.image_url && (
                    <img
                      src={recipes.image_url}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded object-cover"
                    />
                  )}
                  <div>
                    <p className="font-medium">{recipes.title}</p>
                    {recipeMetaLine(recipes) && (
                      <p className="text-xs text-muted-foreground">{recipeMetaLine(recipes)}</p>
                    )}
                    {recipes.diet_tags && recipes.diet_tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {recipes.diet_tags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {recipes.source_url && (
                      <a
                        href={recipes.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary underline"
                      >
                        Voir la recette originale
                      </a>
                    )}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => handleRemove(recipe_id)}>
                  Retirer des favoris
                </Button>
              </div>
              <details>
                <summary className="cursor-pointer text-sm text-muted-foreground">
                  Ingrédients et préparation
                </summary>
                <div className="mt-2 space-y-2">
                  <ul className="list-disc pl-5 text-sm">
                    {recipes.ingredients.map((ing, i) => (
                      <li key={i}>
                        {ing.quantity} {ing.unit} {ing.name}
                      </li>
                    ))}
                  </ul>
                  <p className="whitespace-pre-line text-sm">{recipes.steps}</p>
                </div>
              </details>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
