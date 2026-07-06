const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-5';

interface CallClaudeOptions {
  system?: string;
  maxTokens?: number;
  image?: {
    base64: string;
    mediaType: string;
  };
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
      messages: [{ role: 'user', content }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${body}`);
  }

  const data = await response.json();
  // claude-sonnet-5 can emit a leading "thinking" content block before the
  // actual text block, so pick the first block of type "text" rather than
  // assuming index 0.
  const textBlock = data.content?.find((block: { type: string; text?: string }) => block.type === 'text');
  return textBlock?.text ?? '';
}
