// Outils serveur (web_search / web_fetch) restreints aux sites de recettes
// choisis par l'utilisateur. Partagés entre generate-menu et regenerate-meal.
// Domaines avec et sans "www." pour couvrir les deux formes d'URL.
//
// bbc.co.uk a été demandé mais n'est PAS inclus : l'API Anthropic refuse la
// requête avec "The following domains are not accessible to our user agent"
// (bbc.co.uk bloque le crawler d'Anthropic). Conforme à la règle du projet de
// respecter les robots.txt / règles d'accès de chaque site — voir README.
const ALLOWED_RECIPE_DOMAINS = [
  'soscuisine.com',
  'www.soscuisine.com',
  'ricardocuisine.com',
  'www.ricardocuisine.com',
  'ici.radio-canada.ca',
  'ottolenghi.co.uk',
  'www.ottolenghi.co.uk',
  'jamieoliver.com',
  'www.jamieoliver.com',
];

// Liste lisible pour les prompts.
export const RECIPE_SITES_DESCRIPTION =
  'soscuisine.com, ricardocuisine.com, ici.radio-canada.ca/mordu/recettes, ' +
  'ottolenghi.co.uk et jamieoliver.com';

// Les edge functions Supabase ont une limite de temps d'exécution stricte
// (~150s). Chaque recherche/récupération de page ajoute plusieurs secondes de
// latence côté Anthropic (recherche + lecture + raisonnement), donc le nombre
// d'appels doit rester faible. "Light" pour un seul repas (régénération) :
// assez de recherches pour comparer plus d'une recette candidate sur les
// sites de référence avant de se rabattre sur une recette composée par l'IA,
// sans risquer le timeout.
export const RECIPE_SEARCH_TOOLS_LIGHT = [
  { type: 'web_search_20260209', name: 'web_search', allowed_domains: ALLOWED_RECIPE_DOMAINS, max_uses: 3 },
  { type: 'web_fetch_20260209', name: 'web_fetch', allowed_domains: ALLOWED_RECIPE_DOMAINS, max_uses: 1 },
];

// Pour generate-menu, qui ancre maintenant TOUS les repas composés en
// parallèle (Promise.all) plutôt qu'un seul à la fois : un budget par appel
// plus léger pour limiter le nombre total de recherches concurrentes envoyées
// à l'API Anthropic (et le risque de rate-limit) quand un menu compte
// plusieurs repas.
export const RECIPE_SEARCH_TOOLS_PARALLEL = [
  { type: 'web_search_20260209', name: 'web_search', allowed_domains: ALLOWED_RECIPE_DOMAINS, max_uses: 2 },
  { type: 'web_fetch_20260209', name: 'web_fetch', allowed_domains: ALLOWED_RECIPE_DOMAINS, max_uses: 1 },
];
