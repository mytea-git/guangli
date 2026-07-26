export interface ModelInfo {
  id: string;
  provider: string;
  name: string;
  contextWindow?: number;
  description?: string;
}

export type CatalogSource = "anthropic" | "openai-compatible" | "openrouter" | "static";

export interface CatalogCache {
  fetchedAt: string | null;
  source: CatalogSource;
  models: ModelInfo[];
}
