export interface AIProviderChoice {
  value: string;
  label: string;
  kind: "built-in" | "compatible" | "custom";
  baseUrl?: string;
  note: string;
}

// Built-in providers use their native SDK path. The other choices use the
// OpenAI-compatible chat-completions API, so users can add more providers
// without expanding the server's provider switch for every vendor.
export const AI_PROVIDER_CHOICES: AIProviderChoice[] = [
  { value: "google", label: "Google Gemini", kind: "built-in", note: "Free and paid plans depend on model and account." },
  { value: "openai", label: "OpenAI", kind: "built-in", note: "Usage billed by OpenAI." },
  { value: "anthropic", label: "Anthropic Claude", kind: "built-in", note: "Usage billed by Anthropic." },
  { value: "Grok (xAI)", label: "Grok (xAI)", kind: "compatible", baseUrl: "https://api.x.ai/v1", note: "Grok models through xAI's API." },
  { value: "DeepSeek", label: "DeepSeek", kind: "compatible", baseUrl: "https://api.deepseek.com/v1", note: "DeepSeek models." },
  { value: "MiMo (Xiaomi)", label: "MiMo (Xiaomi)", kind: "compatible", baseUrl: "https://api.xiaomimimo.com/v1", note: "MiMo API; token-plan users can enter their own endpoint." },
  { value: "OpenRouter", label: "OpenRouter", kind: "compatible", baseUrl: "https://openrouter.ai/api/v1", note: "One key for models from many providers, including free models." },
  { value: "Groq", label: "Groq", kind: "compatible", baseUrl: "https://api.groq.com/openai/v1", note: "Some models may have free usage; check current limits." },
  { value: "Mistral AI", label: "Mistral AI", kind: "compatible", baseUrl: "https://api.mistral.ai/v1", note: "Mistral models." },
  { value: "Together AI", label: "Together AI", kind: "compatible", baseUrl: "https://api.together.xyz/v1", note: "Hosted open models." },
  { value: "Fireworks AI", label: "Fireworks AI", kind: "compatible", baseUrl: "https://api.fireworks.ai/inference/v1", note: "Hosted open models." },
  { value: "Cerebras", label: "Cerebras", kind: "compatible", baseUrl: "https://api.cerebras.ai/v1", note: "Fast inference; availability depends on plan." },
  { value: "Perplexity", label: "Perplexity", kind: "compatible", baseUrl: "https://api.perplexity.ai", note: "Perplexity models." },
  { value: "Hugging Face", label: "Hugging Face", kind: "compatible", baseUrl: "https://router.huggingface.co/v1", note: "Models via Inference Providers." },
  { value: "__custom", label: "Other OpenAI-compatible API…", kind: "custom", note: "Add any provider that supports /v1/chat/completions." },
];

export const DIRECT_AI_PROVIDER_VALUES = new Set(
  AI_PROVIDER_CHOICES.filter((choice) => choice.kind === "built-in").map((choice) => choice.value),
);
