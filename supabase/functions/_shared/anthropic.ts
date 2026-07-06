const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-5';

interface CallClaudeOptions {
  system?: string;
  maxTokens?: number;
}

// Appel direct à l'API Messages d'Anthropic depuis l'edge function.
// La clé API ne quitte jamais le serveur.
export async function callClaude(prompt: string, options: CallClaudeOptions = {}): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY');
  }

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
      messages: [{ role: 'user', content: prompt }],
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
