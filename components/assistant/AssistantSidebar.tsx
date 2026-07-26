"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, X, Send, Plus, History, Loader2, Wrench } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import { cn } from "@/lib/utils/cn";
import type { ChatMessage, ConversationSummary, Conversation } from "@/lib/assistant/types";

interface DisplayMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  pending?: boolean;
}

interface AssistantSettingsView {
  enabled: boolean;
  provider: "anthropic" | "openai-compatible";
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
}

function isConfigReady(a: AssistantSettingsView | undefined): boolean {
  if (!a) return false;
  if (!a.enabled || !a.hasApiKey || !a.model) return false;
  if (a.provider === "openai-compatible" && !a.baseUrl) return false;
  return true;
}

export function AssistantSidebar({ initialEnabled }: { initialEnabled: boolean }) {
  const storeSettings = useSettingsStore((s) => s.settings);
  const enabled = storeSettings ? storeSettings.assistant.enabled : initialEnabled;

  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [configReady, setConfigReady] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data: { assistant?: AssistantSettingsView }) => setConfigReady(isConfigReady(data.assistant)))
      .catch(() => setConfigReady(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/assistant/conversations")
      .then((res) => res.json())
      .then((data: { conversations?: ConversationSummary[] }) => setConversations(data.conversations ?? []))
      .catch(() => setConversations([]));
  }, [open, conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function ensureConversation(): Promise<string> {
    if (conversationId) return conversationId;
    const res = await fetch("/api/assistant/conversations", { method: "POST" });
    const conv: Conversation = await res.json();
    setConversationId(conv.id);
    return conv.id;
  }

  async function loadConversation(id: string) {
    const res = await fetch(`/api/assistant/conversations/${id}`);
    if (!res.ok) return;
    const conv: Conversation = await res.json();
    setConversationId(conv.id);
    setMessages(
      conv.messages.map((m: ChatMessage) => ({
        id: m.id,
        role: m.role,
        content: m.role === "tool" ? `${m.toolName} → ${m.content.slice(0, 200)}` : m.content,
      })),
    );
    setHistoryOpen(false);
  }

  function handleNewConversation() {
    setConversationId(null);
    setMessages([]);
    setHistoryOpen(false);
  }

  async function handleDeleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/assistant/conversations/${id}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (id === conversationId) handleNewConversation();
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    const userDisplay: DisplayMessage = { id: `local-user-${crypto.randomUUID()}`, role: "user", content: text };
    const assistantId = `local-assistant-${crypto.randomUUID()}`;
    setMessages((prev) => [...prev, userDisplay, { id: assistantId, role: "assistant", content: "", pending: true }]);
    setStreaming(true);

    const convId = await ensureConversation();

    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId, message: text }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}) as { error?: string });
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: data.error || "请求失败", pending: false } : m)),
        );
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          let eventType = "";
          let dataLine = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("event:")) eventType = line.slice(6).trim();
            if (line.startsWith("data:")) dataLine = line.slice(5).trim();
          }
          if (!dataLine) continue;

          let data: Record<string, unknown>;
          try {
            data = JSON.parse(dataLine);
          } catch {
            continue;
          }

          if (eventType === "text") {
            const delta = String(data.delta ?? "");
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + delta, pending: false } : m)),
            );
          } else if (eventType === "tool_call") {
            const id = String(data.id ?? "");
            const name = String(data.name ?? "");
            setMessages((prev) => [...prev, { id: `tool-${id}`, role: "tool", content: `调用工具 ${name}…`, toolCallId: id }]);
          } else if (eventType === "tool_result") {
            const id = String(data.id ?? "");
            const name = String(data.name ?? "");
            const result = String(data.result ?? "");
            setMessages((prev) =>
              prev.map((m) =>
                m.toolCallId === id ? { ...m, content: `${name} → ${result.slice(0, 200)}` } : m,
              ),
            );
          } else if (eventType === "done") {
            if (typeof data.conversationId === "string") setConversationId(data.conversationId);
          } else if (eventType === "error") {
            const message = String(data.message ?? "助手响应出错");
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: m.content || message, pending: false } : m)),
            );
          }
        }
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: "网络错误，请重试", pending: false } : m)),
      );
    } finally {
      setStreaming(false);
    }
  }

  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="AI 助手"
        aria-label="AI 助手"
        className={cn(
          "fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-900 text-white shadow-lg transition-transform hover:scale-105 dark:bg-neutral-100 dark:text-neutral-900",
          open && "hidden",
        )}
      >
        <Bot size={20} />
      </button>

      {open && (
        <div className="fixed bottom-0 right-0 top-14 z-40 flex w-full max-w-sm flex-col border-l border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex items-center justify-between border-b border-neutral-200 p-3 dark:border-neutral-800">
            <div className="flex items-center gap-2">
              <Bot size={16} />
              <span className="text-sm font-medium">AI 助手</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleNewConversation}
                title="新建会话"
                className="rounded p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <Plus size={15} />
              </button>
              <button
                type="button"
                onClick={() => setHistoryOpen((v) => !v)}
                title="历史会话"
                className="rounded p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <History size={15} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                title="关闭"
                className="rounded p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {historyOpen && (
            <div className="max-h-48 overflow-y-auto border-b border-neutral-200 dark:border-neutral-800">
              {conversations.length === 0 && <p className="p-3 text-xs text-neutral-400">暂无历史会话</p>}
              {conversations.map((c) => (
                <div
                  key={c.id}
                  onClick={() => loadConversation(c.id)}
                  className="flex cursor-pointer items-center justify-between px-3 py-2 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <span className="truncate">{c.title}</span>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteConversation(c.id, e)}
                    className="shrink-0 rounded p-0.5 text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
            {configReady === false && (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-neutral-400">
                <Bot size={24} />
                <p>AI 助手尚未配置完整</p>
                <a href="/settings" className="text-blue-500 hover:underline">
                  前往设置页配置模型
                </a>
              </div>
            )}
            {configReady !== false &&
              messages.map((m) => (
                <div key={m.id} className={cn("mb-3 flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  {m.role === "tool" ? (
                    <div className="flex items-center gap-1.5 rounded-md bg-neutral-100 px-2 py-1 text-xs text-neutral-500 dark:bg-neutral-800">
                      <Wrench size={11} />
                      {m.content}
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
                        m.role === "user"
                          ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                          : "bg-neutral-100 dark:bg-neutral-800",
                      )}
                    >
                      {m.pending && !m.content ? <Loader2 size={14} className="animate-spin" /> : m.content}
                    </div>
                  )}
                </div>
              ))}
            {configReady !== false && messages.length === 0 && (
              <p className="text-center text-xs text-neutral-400">
                向助手描述你遇到的问题，它可以读写工作区文件来帮你排查。
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-neutral-200 p-3 dark:border-neutral-800">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={configReady === false ? "请先在设置页配置模型…" : "输入消息…"}
              disabled={configReady === false || streaming}
              className="flex-1 rounded-md border border-neutral-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-neutral-500 disabled:opacity-50 dark:border-neutral-700"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || streaming || configReady === false}
              className="rounded-md bg-neutral-900 p-2 text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
