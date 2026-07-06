import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { listDiets } from '@/lib/api/diets';
import {
  createMealPlan,
  getLatestMealPlan,
  getMealPlan,
  getMealPlanRecipes,
  invokeGenerateMenu,
  invokeRegenerateMeal,
  setMealLocked,
  type MealPlanRecipeWithRecipe,
} from '@/lib/api/mealPlans';
import type { Diet, MealPlan, MealType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Déjeuner',
  lunch: 'Dîner',
  dinner: 'Souper',
};
const MEAL_TYPE_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner'];

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

export default function MealPlanPage() {
  const { user } = useAuth();
  const [diets, setDiets] = useState<Diet[]>([]);
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);
  const [recipes, setRecipes] = useState<MealPlanRecipeWithRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [regeneratingKey, setRegeneratingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [weekStartDate, setWeekStartDate] = useState(mondayOfThisWeek());
  const [dietId, setDietId] = useState('');
  const [servings, setServings] = useState(2);
  const [numBreakfasts, setNumBreakfasts] = useState(0);
  const [numLunches, setNumLunches] = useState(3);
  const [numDinners, setNumDinners] = useState(5);
  const [preferences, setPreferences] = useState('');

  useEffect(() => {
    if (!user) return;
    listDiets().then(setDiets);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function refresh() {
    if (!user) return;
    const plan = await getLatestMealPlan(user.id);
    setMealPlan(plan);
    if (plan) {
      const r = await getMealPlanRecipes(plan.id);
      setRecipes(r);
      setShowForm(false);
    } else {
      setShowForm(true);
    }
    setLoading(false);
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
        preferences: preferences || null,
      });
      setMealPlan(plan);
      setRecipes([]);
      await invokeGenerateMenu(plan.id);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleToggleLock(mpr: MealPlanRecipeWithRecipe) {
    try {
      await setMealLocked(mpr.id, !mpr.is_locked);
      await refresh();
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Menu de la semaine</h1>
          <p className="text-sm text-muted-foreground">
            Génère un menu qui priorise les aubaines actives selon ton régime.
          </p>
        </div>
        {mealPlan && !showForm && (
          <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
            Nouveau menu
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

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
              <Button type="submit" disabled={generating}>
                {generating ? 'Génération en cours… (peut prendre une minute)' : 'Générer le menu'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {mealPlan && !showForm && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Semaine du {new Date(`${mealPlan.week_start_date}T00:00:00`).toLocaleDateString('fr-CA')} ·{' '}
            {mealPlan.servings} portion(s) · statut : {mealPlan.status}
          </p>

          {dayIndexes.map((dayIndex) => (
            <div key={dayIndex} className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {dayLabel(mealPlan.week_start_date, dayIndex)}
              </h2>
              {MEAL_TYPE_ORDER.filter((mealType) =>
                byDay.get(dayIndex)!.some((mpr) => mpr.meal_type === mealType),
              ).map((mealType) => {
                const mpr = byDay.get(dayIndex)!.find((m) => m.meal_type === mealType)!;
                const key = `${dayIndex}-${mealType}`;
                return (
                  <Card key={key}>
                    <CardContent className="pt-4 space-y-2">
                      <div className="flex flex-col gap-2">
                        <div>
                          <Badge variant="secondary" className="mb-1">
                            {MEAL_TYPE_LABELS[mealType]}
                          </Badge>
                          <p className="font-medium">{mpr.recipes.title}</p>
                          {mpr.recipes.prep_time_minutes && (
                            <p className="text-xs text-muted-foreground">
                              ~{mpr.recipes.prep_time_minutes} min
                            </p>
                          )}
                          {mpr.recipes.source_url && (
                            <a
                              href={mpr.recipes.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-primary underline"
                            >
                              Voir la recette originale
                            </a>
                          )}
                        </div>
                        <div className="flex gap-2">
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
                      </div>
                      <ul className="text-sm list-disc list-inside text-muted-foreground">
                        {mpr.recipes.ingredients.map((ing, i) => (
                          <li key={i}>
                            {ing.quantity} {ing.unit} {ing.name}
                          </li>
                        ))}
                      </ul>
                      <p className="text-sm">{mpr.recipes.steps}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
