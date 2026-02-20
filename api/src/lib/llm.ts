import OpenAI from 'openai'

let client: OpenAI | null = null

function getClient(): OpenAI {
  if (client) return client

  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT
  const azureKey = process.env.AZURE_OPENAI_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY

  if (azureEndpoint && azureKey) {
    client = new OpenAI({
      apiKey: azureKey,
      baseURL: `${azureEndpoint}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o'}`,
      defaultQuery: { 'api-version': '2024-08-01-preview' },
      defaultHeaders: { 'api-key': azureKey },
    })
  } else if (openaiKey) {
    client = new OpenAI({ apiKey: openaiKey })
  } else {
    throw new Error(
      'No LLM credentials configured. Set AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY, or OPENAI_API_KEY.'
    )
  }

  return client
}

const MAX_RETRIES = 2

export async function callLLM(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const api = getClient()
  const model = process.env.OPENAI_MODEL ?? process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o'

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await api.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      })

      const content = response.choices[0]?.message?.content
      if (!content) {
        throw new Error('Empty response from LLM')
      }

      return content
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      console.warn(`LLM attempt ${attempt + 1} failed:`, lastError.message)

      if (attempt < MAX_RETRIES) {
        // Exponential backoff
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
      }
    }
  }

  throw new Error(`LLM call failed after ${MAX_RETRIES + 1} attempts: ${lastError?.message}`)
}
