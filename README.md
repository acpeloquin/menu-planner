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
npx supabase functions deploy scrape-marche-dessaulles --no-verify-jwt
```

### 3. Cron du scraper Dessaulles

Planifier `scrape-marche-dessaulles` 1x/jour via `pg_cron` (Supabase Dashboard >
Database > Cron Jobs) ou un Netlify Scheduled Function qui l'appelle par HTTP.
Le site Dessaulles utilise un cache WP Rocket : le contenu peut prendre 1-2
jours à se mettre à jour après un changement de circulaire, donc un scrape
quotidien est largement suffisant.

### 4. Déploiement Netlify

Connecter le repo GitHub à Netlify (`netlify.toml` déjà configuré). Ajouter
`VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans les variables d'environnement
Netlify (build only, ces valeurs publiques sont protégées par RLS côté Supabase).

## Structure

- `src/` — frontend React
- `supabase/migrations/` — schéma DB (voir `0001_init_schema.sql`)
- `supabase/functions/` — edge functions (parsing IA, génération de menu,
  connecteurs de scraping par magasin)

## Ajouter un nouveau connecteur de scraping

1. Créer `supabase/functions/scrape-<magasin>/connectors/<magasin>.ts`
   implémentant `ScrapeStore` (voir `scrape-marche-dessaulles/connectors/types.ts`)
2. Vérifier le `robots.txt` du site avant d'ajouter le connecteur
3. Ajouter une entrée dans `stores` avec le `connector_slug` correspondant
4. Ajouter la fonction au cron
