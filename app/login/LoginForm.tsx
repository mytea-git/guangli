"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}) as { error?: string });
        setError(data.error || "登录失败");
        return;
      }
      const next = params.get("next") || "/workflow";
      router.replace(next);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
      >
        <h1 className="mb-1 text-xl font-semibold">光离</h1>
        <p className="mb-6 text-sm text-neutral-500">请输入管理员密码登录后台</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="管理员密码"
          className="mb-3 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700"
        />
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={loading || !password} className="w-full">
          {loading ? "登录中…" : "登录"}
        </Button>
      </form>
    </main>
  );
}
