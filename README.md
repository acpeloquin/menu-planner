# Menu Planner

Appli personnelle de planification de menus et de liste d'épicerie basée sur les
aubaines en épicerie. React + TypeScript + Vite + Tailwind + shadcn/ui, backend
Supabase (Postgres, Auth, Edge Functions), IA via l'API Anthropic (Claude).

## Mise en place

### 1. Frontend

```bash
npm install
cp .env.example .env.local
# remplir VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm run dev
```

### 2. Supabase

```bash
npx supabase init      # déjà fait (voir supabase/config.toml)
npx supabase link --project-ref <ref-du-projet>
npx supabase db push   # applique supabase/migrations/0001_init_schema.sql
```

Secrets des edge functions (jamais dans le code ni côté client) :

```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

Déployer les fonctions :

```bash
npx supabase functions deploy parse-deal-text
npx supabase functions deploy generate-menu
npx supabase functions deploy regenerate-meal
npx supabase functions deploy analyze-pantry-photo
npx supabase functions deploy generate-grocery-list
npx supabase functions deploy scrape-store --no-verify-jwt
```

### 3. Cron des scrapers de circulaires

`scrape-store` est un dispatcher générique : il scrape tous les magasins qui ont
un `connector_slug` enregistré dans `supabase/functions/scrape-store/connectors/registry.ts`
(un seul appel, pas une fonction par magasin). `supabase/migrations/0005_generic_scraper_cron.sql`
active `pg_cron`/`pg_net` et planifie `scrape-store` à 10h00 UTC (6h HAE) chaque
jour via `net.http_post`. La plupart des sites de circulaires mettent 1-2 jours
à refléter un changement (cache), donc un scrape quotidien suffit largement.

La clé service_role utilisée par le cron job est lue depuis Supabase Vault,
jamais commitée en clair. Étape manuelle unique par projet (avant de pousser
la migration 0002) :

```sql
select vault.create_secret('<service_role_key>', 'service_role_key');
```

À exécuter une fois via le SQL Editor du Dashboard Supabase (ou l'API Management
`POST /v1/projects/{ref}/database/query`).

### 4. Déploiement Netlify

Connecter le repo GitHub à Netlify (`netlify.toml` déjà configuré). Ajouter
`VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans les variables d'environnement
Netlify (build only, ces valeurs publiques sont protégées par RLS côté Supabase).

## Structure

- `src/` — frontend React
- `supabase/migrations/` — schéma DB (voir `0001_init_schema.sql`)
- `supabase/functions/` — edge functions (parsing IA, génération de menu,
  connecteurs de scraping par magasin)

## Ajouter un nouveau connecteur de scraping (nouvelle épicerie)

Pas besoin de créer une nouvelle edge function ni une nouvelle entrée de cron —
le dispatcher générique `scrape-store` s'en charge pour tous les magasins
enregistrés :

1. Vérifier le `robots.txt` du site avant d'ajouter le connecteur
2. Créer `supabase/functions/scrape-store/connectors/<magasin>.ts` implémentant
   `ScrapeStore` (voir `connectors/types.ts` pour l'interface commune, et
   `connectors/marche-dessaulles.ts` comme exemple)
3. L'enregistrer dans `connectors/registry.ts` : `{ mon_magasin: scrapeMonMagasin }`
4. Ajouter une entrée dans `stores` avec `connector_slug = 'mon_magasin'`
5. Redéployer : `npx supabase functions deploy scrape-store --no-verify-jwt`

Pour tester un seul connecteur sans attendre le cron :
`curl -X POST .../functions/v1/scrape-store -d '{"storeSlug": "mon_magasin"}'`

