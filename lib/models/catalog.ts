import { readJson, writeJson } from "@/lib/store/jsonStore";
import { getSettings } from "@/lib/store/settings";
import { STATIC_CATALOG } from "./staticCatalog";
import type { CatalogCache, ModelInfo } from "./types";

const FILE = "models.json";
const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

const DEFAULT_CACHE: CatalogCache = { fetchedAt: null, source: "static", models: STATIC_CATALOG };

export async function getCachedCatalog(): Promise<CatalogCache> {
  return readJson<CatalogCache>(FILE, DEFAULT_CACHE);
}

// 统一的"带超时 + 响应体大小上限"抓取，防止联网获取卡死或被诱导下载
// 超大响应（SSRF/滥用防护的一部分，M10 安全清单也会复查这里）。
async function boundedFetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentLength = res.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
      throw new Error("响应过大，已拒绝");
    }
    const text = await res.text();
    if (text.length > MAX_RESPONSE_BYTES) throw new Error("响应过大，已拒绝");
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

interface OpenRouterModel {
  id?: string;
  name?: string;
  description?: string;
  context_length?: number;
}

async function fetchOpenRouterModels(): Promise<ModelInfo[]> {
  const json = (await boundedFetchJson("https://openrouter.ai/api/v1/models", {})) as {
    data?: OpenRouterModel[];
  };
  const list = Array.isArray(json.data) ? json.data : [];
  return list.slice(0, 300).map((m) => ({
    id: String(m.id ?? "unknown"),
    provider: String(m.id ?? "").split("/")[0] || "unknown",
    name: String(m.name ?? m.id ?? "unknown"),
    contextWindow: typeof m.context_length === "number" ? m.context_length : undefined,
    description: typeof m.description === "string" ? m.description.slice(0, 200) : undefined,
  }));
}

interface AnthropicModel {
  id?: string;
  display_name?: string;
}

async function fetchAnthropicModels(apiKey: string): Promise<ModelInfo[]> {
  const json = (await boundedFetchJson("https://api.anthropic.com/v1/models", {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  })) as { data?: AnthropicModel[] };
  const list = Array.isArray(json.data) ? json.data : [];
  return list.map((m) => ({
    id: String(m.id ?? "unknown"),
    provider: "anthropic",
    name: String(m.display_name ?? m.id ?? "unknown"),
  }));
}

interface OpenAIModel {
  id?: string;
}

async function fetchOpenAICompatibleModels(baseUrl: string, apiKey: string): Promise<ModelInfo[]> {
  const url = baseUrl.replace(/\/+$/, "") + "/models";
  const json = (await boundedFetchJson(url, { Authorization: `Bearer ${apiKey}` })) as {
    data?: OpenAIModel[];
  };
  const list = Array.isArray(json.data) ? json.data : [];
  return list.map((m) => ({ id: String(m.id ?? "unknown"), provider: "openai-compatible", name: String(m.id ?? "unknown") }));
}

export async function refreshCatalog(): Promise<CatalogCache> {
  const settings = await getSettings();
  const { assistant } = settings;

  const attempts: Array<{ source: CatalogCache["source"]; run: () => Promise<ModelInfo[]> }> = [];
  if (assistant.apiKey && assistant.provider === "anthropic") {
    attempts.push({ source: "anthropic", run: () => fetchAnthropicModels(assistant.apiKey) });
  }
  if (assistant.apiKey && assistant.provider === "openai-compatible" && assistant.baseUrl) {
    attempts.push({
      source: "openai-compatible",
      run: () => fetchOpenAICompatibleModels(assistant.baseUrl, assistant.apiKey),
    });
  }
  // OpenRouter 的公开目录端点不需要密钥，作为无密钥场景下的联网获取来源。
  attempts.push({ source: "openrouter", run: fetchOpenRouterModels });

  for (const attempt of attempts) {
    try {
      const models = await attempt.run();
      if (models.length > 0) {
        const cache: CatalogCache = { fetchedAt: new Date().toISOString(), source: attempt.source, models };
        await writeJson(FILE, cache);
        return cache;
      }
    } catch (err) {
      console.error(`[models] 联网获取源 ${attempt.source} 失败，尝试下一个来源`, err);
    }
  }

  const cache: CatalogCache = { fetchedAt: new Date().toISOString(), source: "static", models: STATIC_CATALOG };
  await writeJson(FILE, cache);
  return cache;
}
