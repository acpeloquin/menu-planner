import { useEffect, useState, type FormEvent } from 'react';
import { Star } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { listDiets } from '@/lib/api/diets';
import {
  createMealPlan,
  getMealPlan,
  getMealPlanRecipes,
  invokeGenerateMenu,
  invokeGroundRecipe,
  invokeRegenerateMeal,
  listMealPlans,
  setMealLocked,
  type MealPlanRecipeWithRecipe,
} from '@/lib/api/mealPlans';
import { addFavorite, listFavoriteRecipeIds, removeFavorite } from '@/lib/api/favorites';
import type { Diet, MealPlan, MealType } from '@/lib/types';
import { recipeMetaLine } from '@/lib/recipeFormat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Déjeuner',
  lunch: 'Dîner',
  snack: 'Collation',
  dinner: 'Souper',
};
const MEAL_TYPE_ORDER: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner'];

function mondayOfThisWeek(): string {
  const now = new Date();
  const day = now.getDay(); // 0 = dimanche
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

function dayLabel(weekStartDate: string, dayIndex: number): string {
  const date = new Date(`${weekStartDate}T00:00:00`);
  date.setDate(date.getDate() + dayIndex);
  const label = date.toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Traite `items` avec au plus `limit` appels de `fn` en vol en même temps.
// Utilisé pour ancrer les repas d'un menu un par un (chacun a son propre
// budget de 150s côté edge function) sans en lancer trop à la fois — voir
// generate-menu/index.ts pour le contexte (timeout 504 avec trop de front).
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      await fn(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

export default function MealPlanPage() {
  const { user } = useAuth();
  const [diets, setDiets] = useState<Diet[]>([]);
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);
  const [recipes, setRecipes] = useState<MealPlanRecipeWithRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [groundingProgress, setGroundingProgress] = useState<{ done: number; total: number } | null>(null);
  const [regeneratingKey, setRegeneratingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  const [weekStartDate, setWeekStartDate] = useState(mondayOfThisWeek());
  const [dietId, setDietId] = useState('');
  const [servings, setServings] = useState(2);
  const [numBreakfasts, setNumBreakfasts] = useState(0);
  const [numLunches, setNumLunches] = useState(3);
  const [numDinners, setNumDinners] = useState(5);
  const [numSnacks, setNumSnacks] = useState(0);
  const [preferences, setPreferences] = useState('');
  const [budgetPerPortionCents, setBudgetPerPortionCents] = useState(700);

  useEffect(() => {
    if (!user) return;
    listDiets().then(setDiets);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function refresh(preferPlanId?: string) {
    if (!user) return;
    const plans = await listMealPlans(user.id);
    setMealPlans(plans);
    const targetId = preferPlanId ?? mealPlan?.id;
    const plan = plans.find((p) => p.id === targetId) ?? plans[0] ?? null;
    await selectPlan(plan);
    const favIds = await listFavoriteRecipeIds(user.id);
    setFavoriteIds(favIds);
    setLoading(false);
  }

  async function selectPlan(plan: MealPlan | null) {
    setMealPlan(plan);
    if (plan) {
      const r = await getMealPlanRecipes(plan.id);
      setRecipes(r);
      setShowForm(false);
    } else {
      setRecipes([]);
      setShowForm(true);
    }
  }

  async function handleToggleFavorite(recipeId: string) {
    if (!user) return;
    try {
      if (favoriteIds.has(recipeId)) {
        await removeFavorite(user.id, recipeId);
      } else {
        await addFavorite(user.id, recipeId);
      }
      const favIds = await listFavoriteRecipeIds(user.id);
      setFavoriteIds(favIds);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setGenerating(true);
    setError(null);
    try {
      const plan = await createMealPlan({
        userId: user.id,
        weekStartDate,
        dietId: dietId || null,
        servings,
        numBreakfasts,
        numLunches,
        numDinners,
        numSnacks,
        preferences: preferences || null,
        budgetPerPortionCents,
      });
      setMealPlan(plan);
      setRecipes([]);
      const groundingTargets = await invokeGenerateMenu(plan.id);
      await refresh(plan.id);

      // Ancre chaque repas composé dans une vraie recette, un par un (2 en
      // même temps) — voir generate-menu/index.ts pour le pourquoi (ça
      // timeoutait quand c'était fait en groupe dans la même invocation).
      if (groundingTargets.length > 0) {
        const dietName = diets.find((d) => d.id === dietId)?.name ?? null;
        setGroundingProgress({ done: 0, total: groundingTargets.length });
        let done = 0;
        await mapWithConcurrency(groundingTargets, 2, async (target) => {
          try {
            await invokeGroundRecipe(target.recipeId, target.mealType, target.title, servings, dietName);
          } catch {
            // best-effort : la recette composée par l'IA reste en place
          } finally {
            done += 1;
            setGroundingProgress({ done, total: groundingTargets.length });
          }
        });
        setGroundingProgress(null);
        await refresh(plan.id);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleToggleLock(mpr: MealPlanRecipeWithRecipe) {
    try {
      await setMealLocked(mpr.id, !mpr.is_locked);
      await refresh(mealPlan?.id);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleRegenerate(dayIndex: number, mealType: MealType) {
    if (!mealPlan) return;
    const key = `${dayIndex}-${mealType}`;
    setRegeneratingKey(key);
    setError(null);
    try {
      await invokeRegenerateMeal(mealPlan.id, dayIndex, mealType);
      const updatedPlan = await getMealPlan(mealPlan.id);
      setMealPlan(updatedPlan);
      const r = await getMealPlanRecipes(mealPlan.id);
      setRecipes(r);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRegeneratingKey(null);
    }
  }

  if (loading) return <p className="text-muted-foreground">Chargement…</p>;

  const byDay = new Map<number, MealPlanRecipeWithRecipe[]>();
  for (const mpr of recipes) {
    const list = byDay.get(mpr.day_index) ?? [];
    list.push(mpr);
    byDay.set(mpr.day_index, list);
  }
  const dayIndexes = [...byDay.keys()].sort((a, b) => a - b);

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-semibold">Menu de la semaine</h1>
          <p className="text-sm text-muted-foreground">
            Génère un menu qui priorise les aubaines actives selon ton régime.
          </p>
        </div>
        {mealPlan && !showForm && (
          <div className="flex items-center gap-2">
            {mealPlans.length > 1 && (
              <Select
                value={mealPlan.id}
                onValueChange={(id) => {
                  const plan = mealPlans.find((p) => p.id === id);
                  if (plan) selectPlan(plan);
                }}
              >
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {mealPlans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      Semaine du {new Date(`${plan.week_start_date}T00:00:00`).toLocaleDateString('fr-CA')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
              Nouveau menu
            </Button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive print:hidden">{error}</p>}

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Paramètres du menu</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Semaine du</Label>
                  <Input
                    type="date"
                    value={weekStartDate}
                    onChange={(e) => setWeekStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Régime</Label>
                  <Select value={dietId} onValueChange={setDietId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Omnivore (par défaut)" />
                    </SelectTrigger>
                    <SelectContent>
                      {diets.map((diet) => (
                        <SelectItem key={diet.id} value={diet.id}>
                          {diet.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Portions par repas</Label>
                  <Input
                    type="number"
                    min={1}
                    value={servings}
                    onChange={(e) => setServings(Number(e.target.value))}
                  />
                </div>
                <div />
                <div className="space-y-2">
                  <Label>Déjeuners</Label>
                  <Input
                    type="number"
                    min={0}
                    value={numBreakfasts}
                    onChange={(e) => setNumBreakfasts(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Dîners</Label>
                  <Input
                    type="number"
                    min={0}
                    value={numLunches}
                    onChange={(e) => setNumLunches(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Soupers</Label>
                  <Input
                    type="number"
                    min={0}
                    value={numDinners}
                    onChange={(e) => setNumDinners(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Collations</Label>
                  <Input
                    type="number"
                    min={0}
                    value={numSnacks}
                    onChange={(e) => setNumSnacks(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Préférences / restrictions (allergies, temps de prép. max…)</Label>
                <Textarea
                  rows={3}
                  value={preferences}
                  onChange={(e) => setPreferences(e.target.value)}
                  placeholder="Ex: pas d'arachides, max 30 minutes de préparation"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Budget max par portion</Label>
                  <span className="text-sm text-muted-foreground">
                    {(budgetPerPortionCents / 100).toFixed(2)} $
                  </span>
                </div>
                <Slider
                  min={0}
                  max={2500}
                  step={25}
                  value={[budgetPerPortionCents]}
                  onValueChange={([value]) => setBudgetPerPortionCents(value)}
                />
              </div>
              <Button type="submit" disabled={generating}>
                {generating ? 'Génération en cours…' : 'Générer le menu'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {mealPlan && !showForm && (
        <div className="space-y-4">
          {groundingProgress && (
            <p className="text-sm text-muted-foreground print:hidden">
              Recherche de vraies recettes sur les sites de référence… {groundingProgress.done}/
              {groundingProgress.total}
            </p>
          )}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Semaine du {new Date(`${mealPlan.week_start_date}T00:00:00`).toLocaleDateString('fr-CA')} ·{' '}
              {mealPlan.servings} portion(s) · budget max {(mealPlan.budget_per_portion_cents / 100).toFixed(2)} $/portion
              · statut : {mealPlan.status}
            </p>
            {recipes.length > 0 && (
              <Button variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
                Imprimer / Exporter en PDF
              </Button>
            )}
          </div>

          {dayIndexes.map((dayIndex) => (
            <div
              key={dayIndex}
              className="space-y-2 print:break-after-page print:last:break-after-auto"
            >
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {dayLabel(mealPlan.week_start_date, dayIndex)}
              </h2>
              <div className="space-y-2 print:grid print:grid-cols-2 print:gap-3 print:space-y-0">
                {MEAL_TYPE_ORDER.filter((mealType) =>
                  byDay.get(dayIndex)!.some((mpr) => mpr.meal_type === mealType),
                ).map((mealType) => {
                  const mpr = byDay.get(dayIndex)!.find((m) => m.meal_type === mealType)!;
                  const key = `${dayIndex}-${mealType}`;
                  return (
                    <Card key={key} className="print:break-inside-avoid print:shadow-none">
                      <CardContent className="pt-4 space-y-2 print:pt-2 print:space-y-1">
                        <div className="flex gap-3">
                          {mpr.recipes.image_url && (
                            <img
                              src={mpr.recipes.image_url}
                              alt=""
                              className="h-16 w-16 shrink-0 rounded object-cover print:h-14 print:w-14"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <Badge variant="secondary" className="mb-1 print:text-[10px]">
                                {MEAL_TYPE_LABELS[mealType]}
                              </Badge>
                              <button
                                type="button"
                                className="print:hidden shrink-0"
                                title={
                                  favoriteIds.has(mpr.recipe_id)
                                    ? 'Retirer des favoris'
                                    : 'Ajouter aux favoris'
                                }
                                onClick={() => handleToggleFavorite(mpr.recipe_id)}
                              >
                                <Star
                                  className={cn(
                                    'h-4 w-4',
                                    favoriteIds.has(mpr.recipe_id)
                                      ? 'fill-yellow-400 text-yellow-500'
                                      : 'text-muted-foreground',
                                  )}
                                />
                              </button>
                            </div>
                            <p className="font-medium print:text-sm">{mpr.recipes.title}</p>
                            {recipeMetaLine(mpr.recipes) && (
                              <p className="text-xs text-muted-foreground print:text-[10px]">
                                {recipeMetaLine(mpr.recipes)}
                              </p>
                            )}
                            {mpr.recipes.source_url && (
                              <a
                                href={mpr.recipes.source_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-primary underline print:hidden"
                              >
                                Voir la recette originale
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 print:hidden">
                          <Button
                            size="sm"
                            variant={mpr.is_locked ? 'secondary' : 'outline'}
                            onClick={() => handleToggleLock(mpr)}
                          >
                            {mpr.is_locked ? 'Verrouillé' : 'Verrouiller'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={mpr.is_locked || regeneratingKey === key}
                            onClick={() => handleRegenerate(dayIndex, mealType)}
                          >
                            {regeneratingKey === key ? '…' : 'Régénérer'}
                          </Button>
                        </div>
                        <ul className="text-sm list-disc list-inside text-muted-foreground print:text-[10px]">
                          {mpr.recipes.ingredients.map((ing, i) => (
                            <li key={i}>
                              {ing.quantity} {ing.unit} {ing.name}
                            </li>
                          ))}
                        </ul>
                        <p className="text-sm print:text-[10px]">{mpr.recipes.steps}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
