// Récupère les pages-images d'une circulaire hébergée sur circulaires.com,
// utilisé pour les magasins dont le site officiel bloque le fetch direct
// (IGA/Sobeys et Maxi/Super C/Loblaw sont tous deux derrière une protection
// anti-bot Akamai qui renvoie systématiquement "Access Denied" à un fetch
// serveur-à-serveur — confirmé en testant, même avec des en-têtes de
// navigateur réalistes). circulaires.com héberge séparément des pages
// scannées de la circulaire (pas de protection anti-bot), qu'on lit ensuite
// par vision IA plutôt que par parsing HTML (voir extractDealsFromFlyerImages
// dans flyer-vision.ts).
//
// Chaîne de liens propre à ce site (pas d'API JSON) : page du magasin -> lien
// "circulaire format image" (paramètres de session à relire à chaque fois,
// non réutilisables) -> page de visionnement (une "page nav" = 2 images de
// circulaire) -> jeton "imageform" par image -> page intermédiaire contenant
// l'URL finale de l'image plein format. Chaque jeton est un hash unique par
// requête, impossible à deviner : il faut suivre la chaîne à chaque scrape.

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE_URL = 'https://www.circulaires.com';

export interface FlyerImage {
  base64: string;
  mediaType: string;
}

export interface FlyerPages {
  images: FlyerImage[];
  validFrom: string;
  validTo: string;
}

const MONTHS_FR: Record<string, string> = {
  janvier: '01',
  février: '02',
  mars: '03',
  avril: '04',
  mai: '05',
  juin: '06',
  juillet: '07',
  août: '08',
  septembre: '09',
  octobre: '10',
  novembre: '11',
  décembre: '12',
};

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!response.ok) throw new Error(`Échec du fetch de ${url}: ${response.status}`);
  return response.text();
}

export async function fetchCirculairesFlyerPages(storeSlug: string, maxPages = 24): Promise<FlyerPages> {
  const listingHtml = await fetchText(`${BASE_URL}/${storeSlug}/`);
  // Le lien "circulaire format image" est parfois relatif (/slug/circulaire/?...)
  // et parfois absolu (https://www.circulaires.com/slug/circulaire/?...) selon
  // le magasin — on tolère les deux plutôt que de supposer un seul format.
  const circularLinkMatch = listingHtml.match(
    new RegExp(`href="(?:https?://(?:www\\.)?circulaires\\.com)?(/${storeSlug}/circulaire/\\?[^"]*)"`, 'i'),
  );
  if (!circularLinkMatch) {
    throw new Error(`Lien "circulaire format image" introuvable pour ${storeSlug} sur circulaires.com`);
  }

  const firstNavPageHtml = await fetchText(`${BASE_URL}${circularLinkMatch[1]}`);
  const { validFrom, validTo } = parseValidityLine(firstNavPageHtml);

  const navPageUrlsByNumber = extractNavPageUrls(firstNavPageHtml);
  const navPageNumbers = [...navPageUrlsByNumber.keys()].filter((n) => n <= maxPages);

  const otherNavPageHtmls = await Promise.all(
    navPageNumbers.filter((page) => page !== 1).map((page) => fetchText(navPageUrlsByNumber.get(page)!)),
  );
  const navPageHtmls = [firstNavPageHtml, ...otherNavPageHtmls];

  const imageFormUrls = new Set<string>();
  for (const html of navPageHtmls) {
    for (const url of extractImageFormUrls(html)) imageFormUrls.add(url);
  }

  const fetchedImages = await Promise.all([...imageFormUrls].map((url) => fetchFlyerPageImage(url)));
  const images = fetchedImages.filter((image): image is FlyerImage => image !== null);

  if (images.length === 0) {
    throw new Error(
      `Aucune page de circulaire trouvée pour ${storeSlug} (structure de circulaires.com a peut-être changé)`,
    );
  }

  return { images, validFrom, validTo };
}

// Chaque page de navigation (1..N) montre 2 images de circulaire ; l'URL de
// chaque page nav (sauf la 1re, déjà en main) est capturée avec son numéro
// visible dans le même passage de regex, plus robuste que de chercher le
// lien puis le numéro séparément.
function extractNavPageUrls(html: string): Map<number, string> {
  const byNumber = new Map<number, string>();
  // L'ordre des paramètres de query (flyer, str) varie selon le magasin —
  // on ne suppose pas que "flyer=" est le premier.
  const pattern = /href="([^"]*index\.do\?[^"]*)"[^>]*>&nbsp;(\d+)&nbsp;</g;
  for (const match of html.matchAll(pattern)) {
    const [, href, numberStr] = match;
    const page = Number(numberStr);
    if (!byNumber.has(page)) {
      byNumber.set(page, href.startsWith('http') ? href : `${BASE_URL}${href}`);
    }
  }
  return byNumber;
}

function extractImageFormUrls(html: string): string[] {
  return [...html.matchAll(/window\.open\('([^']*index\.do\?[^']*)'/g)].map((m) =>
    m[1].startsWith('http') ? m[1] : `${BASE_URL}${m[1]}`,
  );
}

async function fetchFlyerPageImage(imageFormUrl: string): Promise<FlyerImage | null> {
  const wrapperHtml = await fetchText(imageFormUrl);
  const fullImageMatch = wrapperHtml.match(/id="fullimage"[^>]*src="([^"]*)"/);
  if (!fullImageMatch) return null;

  const imageUrl = fullImageMatch[1].startsWith('http')
    ? fullImageMatch[1]
    : `${BASE_URL}${fullImageMatch[1]}`;
  const response = await fetch(imageUrl, { headers: { 'user-agent': USER_AGENT } });
  if (!response.ok) return null;

  const mediaType = response.headers.get('content-type') ?? 'image/jpeg';
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { base64: bytesToBase64(bytes), mediaType };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function parseValidityLine(html: string): { validFrom: string; validTo: string } {
  const match = html.match(
    /Valide du\s+\S+\s+(\d{1,2})\s+([a-zà-ü]+)\s+au\s+\S+\s+(\d{1,2})\s+([a-zà-ü]+)\s+(\d{4})/i,
  );
  const today = new Date().toISOString().slice(0, 10);
  const fallbackEnd = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (!match) return { validFrom: today, validTo: fallbackEnd };

  const [, dayFrom, monthFromName, dayTo, monthToName, year] = match;
  const monthFrom = MONTHS_FR[monthFromName.toLowerCase()];
  const monthTo = MONTHS_FR[monthToName.toLowerCase()];
  if (!monthFrom || !monthTo) return { validFrom: today, validTo: fallbackEnd };

  return {
    validFrom: `${year}-${monthFrom}-${dayFrom.padStart(2, '0')}`,
    validTo: `${year}-${monthTo}-${dayTo.padStart(2, '0')}`,
  };
}
