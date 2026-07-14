import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface Step {
  number: number;
  title: string;
  description: string;
  to: string;
  cta: string;
}

const STEPS: Step[] = [
  {
    number: 1,
    title: 'Choisis tes magasins',
    description:
      "Suis les magasins où tu magasines. Certains (Marché Dessaulles, IGA, Maxi, Super C) ont un scraping automatique de circulaire — les autres, tu peux quand même y ajouter des aubaines manuellement.",
    to: '/stores',
    cta: 'Aller aux magasins',
  },
  {
    number: 2,
    title: 'Liste les aubaines de la semaine',
    description:
      "Les magasins avec scraping automatique se remplissent seuls chaque jour. Pour les autres, colle le texte d'une circulaire et l'IA en extrait les aubaines.",
    to: '/aubaines',
    cta: 'Voir les aubaines',
  },
  {
    number: 3,
    title: 'Note ton garde-manger (optionnel)',
    description:
      "Indique ce que tu as déjà — à la main ou en photo. L'IA en tient compte pour éviter le gaspillage et réduire ce qu'il reste à acheter.",
    to: '/garde-manger',
    cta: 'Ouvrir le garde-manger',
  },
  {
    number: 4,
    title: 'Génère ton menu',
    description:
      'Choisis régime, portions, budget par portion et préférences — le menu priorise les aubaines actives et ce que tu as déjà. Tu peux verrouiller ou régénérer chaque repas.',
    to: '/menu',
    cta: 'Générer un menu',
  },
  {
    number: 5,
    title: 'Génère ta liste d\'épicerie',
    description:
      "Une fois le menu prêt, la liste agrège les ingrédients de toutes les recettes, groupés par magasin et catégorie, avec les prix des aubaines quand ils s'appliquent.",
    to: '/epicerie',
    cta: "Voir la liste d'épicerie",
  },
];

export default function Home() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Bienvenue sur Menu Planner</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Planifie ton menu de la semaine autour des aubaines, puis génère ta liste
          d'épicerie automatiquement. Voici la marche à suivre, dans l'ordre.
        </p>
      </div>

      <div className="space-y-4">
        {STEPS.map((step) => (
          <Card key={step.number}>
            <CardContent className="flex items-start gap-4 pt-6">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {step.number}
              </div>
              <div className="flex-1 space-y-2">
                <h2 className="font-medium">{step.title}</h2>
                <p className="text-sm text-muted-foreground">{step.description}</p>
                <Button asChild size="sm" variant="outline">
                  <Link to={step.to}>{step.cta}</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
