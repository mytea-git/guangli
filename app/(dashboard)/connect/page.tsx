"use client";

import Link from "next/link";
import { Settings as SettingsIcon } from "lucide-react";
import { EmbedFrame } from "@/components/connect/EmbedFrame";
import { useSettingsStore } from "@/stores/settingsStore";

export default function ConnectPage() {
  const settings = useSettingsStore((s) => s.settings);

  if (!settings) {
    return <p className="text-sm text-neutral-400">加载设置中…</p>;
  }

  if (!settings.connect.enabled) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-neutral-500">连接功能未启用</p>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          <SettingsIcon size={14} />
          前往设置开启
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-lg font-semibold">连接</h1>
      <EmbedFrame url={settings.connect.url} />
    </div>
  );
}
