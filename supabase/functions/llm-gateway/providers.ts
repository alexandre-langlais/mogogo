// --- Interfaces communes ---

export interface LLMCallParams {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature: number;
  maxTokens: number;
  jsonMode?: boolean;
}

export interface LLMCallResult {
  content: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  model: string;
}

export interface LLMProvider {
  call(params: LLMCallParams): Promise<LLMCallResult>;
}

// --- OpenAI-compatible provider ---

class OpenAIProvider implements LLMProvider {
  constructor(
    private apiUrl: string,
    private apiKey: string,
  ) {}

  async call(params: LLMCallParams): Promise<LLMCallResult> {
    const resp = await fetch(`${this.apiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        ...(params.jsonMode !== false ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      throw new OpenAIProviderError(`LLM API ${resp.status}: ${errorText.slice(0, 300)}`, resp.status);
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Empty LLM response");
    }

    const usage = data.usage
      ? {
          prompt_tokens: data.usage.prompt_tokens,
          completion_tokens: data.usage.completion_tokens,
          total_tokens: data.usage.total_tokens,
        }
      : undefined;

    return { content, usage, model: params.model };
  }
}

export class OpenAIProviderError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "OpenAIProviderError";
  }
}

// --- Gemini native provider (with context caching) ---

// Module-level cache state (persists across requests in Edge Function)
let cachedContentName: string | null = null;
let cachedContentExpiry = 0;
let cachedSystemPrompt: string | null = null;

const LLM_CACHE_TTL = parseInt(Deno.env.get("LLM_CACHE_TTL") ?? "3600", 10);

class GeminiProvider implements LLMProvider {
  private currentModel = "";

  constructor(
    private apiUrl: string,
    private apiKey: string,
  ) {}

  private get baseUrl(): string {
    // Ensure base URL without trailing slash
    return this.apiUrl.replace(/\/+$/, "");
  }

  private async ensureCache(systemPrompt: string): Promise<string | null> {
    // Skip cache if TTL is 0 or system prompt is too short
    if (LLM_CACHE_TTL <= 0) return null;

    // If we have a valid cache for the same system prompt, reuse it
    const now = Date.now();
    if (
      cachedContentName &&
      cachedContentExpiry > now + 60_000 &&
      cachedSystemPrompt === systemPrompt
    ) {
      return cachedContentName;
    }

    // Create a new cached content
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/cachedContents`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": this.apiKey,
          },
          body: JSON.stringify({
            model: `models/${this.currentModel}`,
            systemInstruction: { parts: [{ text: systemPrompt }] },
            ttl: `${LLM_CACHE_TTL}s`,
            displayName: "mogogo-system-prompt",
          }),
        },
      );

      if (!resp.ok) {
        const errText = await resp.text();
        console.warn(`Gemini cache creation failed (${resp.status}): ${errText.slice(0, 200)}`);
        return null;
      }

      const data = await resp.json();
      cachedContentName = data.name;
      cachedContentExpiry = new Date(data.expireTime).getTime();
      cachedSystemPrompt = systemPrompt;
      console.log(`Gemini context cache created: ${cachedContentName}`);
      return cachedContentName;
    } catch (err) {
      console.warn("Gemini cache creation error:", err);
      return null;
    }
  }

  async call(params: LLMCallParams): Promise<LLMCallResult> {
    // Separate system messages from conversation messages
    const systemParts: string[] = [];
    const rawContents: Array<{ role: string; text: string }> = [];

    for (const msg of params.messages) {
      if (msg.role === "system") {
        systemParts.push(msg.content);
      } else {
        rawContents.push({
          role: msg.role === "assistant" ? "model" : "user",
          text: msg.content,
        });
      }
    }

    // Gemini requires strictly alternating user/model turns.
    // Merge consecutive messages of the same role into one.
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    for (const msg of rawContents) {
      const last = contents[contents.length - 1];
      if (last && last.role === msg.role) {
        last.parts.push({ text: msg.text });
      } else {
        contents.push({ role: msg.role, parts: [{ text: msg.text }] });
      }
    }

    // Ensure conversation starts with a user message (Gemini requirement)
    if (contents.length > 0 && contents[0].role !== "user") {
      contents.unshift({ role: "user", parts: [{ text: "Commence." }] });
    }

    const systemPrompt = systemParts.join("\n\n");
    this.currentModel = params.model;

    // Try to use context cache for the system prompt
    const cacheName = await this.ensureCache(systemPrompt);

    // Build request body
    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: params.temperature,
        maxOutputTokens: params.maxTokens,
        ...(params.jsonMode !== false ? { responseMimeType: "application/json" } : {}),
      },
    };

    if (cacheName) {
      body.cachedContent = cacheName;
      // When using cached content, don't send systemInstruction
    } else if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const url = `${this.baseUrl}/models/${params.model}:generateContent`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errorText = await resp.text();

      // If cache-related error, invalidate and retry without cache
      if (cacheName && (resp.status === 400 || resp.status === 404)) {
        console.warn(`Gemini cache error (${resp.status}), retrying without cache`);
        cachedContentName = null;
        cachedContentExpiry = 0;
        cachedSystemPrompt = null;

        delete body.cachedContent;
        body.systemInstruction = { parts: [{ text: systemPrompt }] };

        const retryResp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": this.apiKey,
          },
          body: JSON.stringify(body),
        });

        if (!retryResp.ok) {
          const retryErr = await retryResp.text();
          throw new Error(`Gemini API ${retryResp.status}: ${retryErr.slice(0, 300)}`);
        }

        return this.parseGeminiResponse(await retryResp.json(), params.model);
      }

      throw new Error(`Gemini API ${resp.status}: ${errorText.slice(0, 300)}`);
    }

    return this.parseGeminiResponse(await resp.json(), params.model);
  }

  private parseGeminiResponse(data: Record<string, unknown>, model: string): LLMCallResult {
    const candidates = data.candidates as Array<Record<string, unknown>> | undefined;
    const candidate = candidates?.[0];

    if (!candidate) {
      // Check for prompt-level block
      const blockReason = (data as Record<string, unknown>).promptFeedback;
      throw new Error(`Gemini returned no candidates${blockReason ? ` (promptFeedback: ${JSON.stringify(blockReason)})` : ""}`);
    }

    const finishReason = candidate.finishReason as string | undefined;
    const contentObj = candidate.content as { parts?: Array<{ text?: string }> } | undefined;
    const text = contentObj?.parts?.[0]?.text;

    if (!text) {
      throw new Error(`Empty Gemini response (finishReason: ${finishReason ?? "unknown"})`);
    }

    // Warn on non-STOP finish reasons (truncation, safety, etc.)
    if (finishReason && finishReason !== "STOP") {
      console.warn(`Gemini finishReason: ${finishReason} (response may be truncated)`);
    }

    const usageMeta = data.usageMetadata as Record<string, number> | undefined;
    const usage = usageMeta
      ? {
          prompt_tokens: usageMeta.promptTokenCount ?? 0,
          completion_tokens: usageMeta.candidatesTokenCount ?? 0,
          total_tokens: usageMeta.totalTokenCount ?? 0,
        }
      : undefined;

    return { content: text, usage, model };
  }
}

// --- Factory ---

export function createProvider(apiUrl: string, model: string, apiKey: string): LLMProvider {
  const providerOverride = Deno.env.get("LLM_PROVIDER");

  if (providerOverride === "gemini") {
    return new GeminiProvider(apiUrl, apiKey);
  }
  if (providerOverride === "openai") {
    return new OpenAIProvider(apiUrl, apiKey);
  }

  // Auto-detect based on model name or API URL
  if (model.startsWith("gemini-") || apiUrl.includes("googleapis.com")) {
    return new GeminiProvider(apiUrl, apiKey);
  }

  return new OpenAIProvider(apiUrl, apiKey);
}
