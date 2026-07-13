const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-5';

interface CallClaudeOptions {
  system?: string;
  maxTokens?: number;
  image?: {
    base64: string;
    mediaType: string;
  };
  // Pour envoyer plusieurs images dans le même message (ex: les pages d'une
  // circulaire) plutôt qu'un seul appel par image.
  images?: {
    base64: string;
    mediaType: string;
  }[];
  // deno-lint-ignore no-explicit-any
  tools?: any[];
  // Pour les tâches d'extraction/agrégation simples sans recherche web, passer
  // { type: 'disabled' } : sans ça, claude-sonnet-5 réfléchit par défaut, et
  // sur un gros volume de données (ex: agrégation de beaucoup d'ingrédients)
  // ça peut consommer tout le budget de max_tokens en réflexion sans jamais
  // produire de texte final (réponse vide, JSON.parse échoue).
  thinking?: { type: 'disabled' | 'adaptive' };
}

// Appel direct à l'API Messages d'Anthropic depuis l'edge function.
// La clé API ne quitte jamais le serveur.
export async function callClaude(prompt: string, options: CallClaudeOptions = {}): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY');
  }

  const content: unknown[] = [];
  if (options.image) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: options.image.mediaType, data: options.image.base64 },
    });
  }
  for (const image of options.images ?? []) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: image.mediaType, data: image.base64 },
    });
  }
  content.push({ type: 'text', text: prompt });

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: options.maxTokens ?? 4096,
      system: options.system,
      tools: options.tools,
      thinking: options.thinking,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${body}`);
  }

  const data = await response.json();
  // claude-sonnet-5 can emit a leading "thinking" block, and with server-side
  // tools (web_search/web_fetch) the response interleaves several text blocks
  // with tool-use/tool-result blocks — the final synthesized answer is always
  // the LAST text block, not the first.
  const textBlocks = (data.content ?? []).filter((block: { type: string; text?: string }) => block.type === 'text');
  return textBlocks.length > 0 ? textBlocks[textBlocks.length - 1].text ?? '' : '';
}
