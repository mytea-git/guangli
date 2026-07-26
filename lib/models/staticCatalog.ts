import type { ModelInfo } from "./types";

// 内置静态目录：联网获取失败时的兜底，保证模型页永远有内容可看。
export const STATIC_CATALOG: ModelInfo[] = [
  { id: "claude-fable-5", provider: "anthropic", name: "Claude Fable 5", contextWindow: 300000 },
  { id: "claude-opus-5", provider: "anthropic", name: "Claude Opus 5", contextWindow: 300000 },
  { id: "claude-sonnet-5", provider: "anthropic", name: "Claude Sonnet 5", contextWindow: 300000 },
  { id: "claude-haiku-4-5", provider: "anthropic", name: "Claude Haiku 4.5", contextWindow: 200000 },
  { id: "claude-sonnet-4-5", provider: "anthropic", name: "Claude Sonnet 4.5", contextWindow: 200000 },
  { id: "gpt-5", provider: "openai", name: "GPT-5", contextWindow: 256000 },
  { id: "gpt-5-mini", provider: "openai", name: "GPT-5 mini", contextWindow: 128000 },
  { id: "gemini-2.5-pro", provider: "google", name: "Gemini 2.5 Pro", contextWindow: 1000000 },
  { id: "gemini-2.5-flash", provider: "google", name: "Gemini 2.5 Flash", contextWindow: 1000000 },
];
