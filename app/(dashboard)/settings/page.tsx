"use client";

import { useEffect, useState } from "react";
import { Pause, Play, RotateCcw, KeyRound } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { Input, Select, Field } from "@/components/ui/Input";
import { useToastStore } from "@/stores/toastStore";
import { useSettingsStore, type ClientSettings } from "@/stores/settingsStore";

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </Card>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<ClientSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const pushToast = useToastStore((s) => s.push);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data: ClientSettings) => setSettings(data))
      .catch(() => pushToast("加载设置失败", "error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(patch: Record<string, unknown>, successMsg = "已保存") {
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}) as { error?: string });
      if (!res.ok) {
        pushToast((data as { error?: string }).error || "保存失败", "error");
        return false;
      }
      const next = data as ClientSettings;
      setSettings(next);
      useSettingsStore.getState().setSettings(next);
      pushToast(successMsg, "success");
      return true;
    } catch {
      pushToast("网络错误，保存失败", "error");
      return false;
    }
  }

  if (loading || !settings) {
    return <p className="text-sm text-neutral-400">加载中…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">设置</h1>

      <ConnectSection settings={settings} save={save} />
      <WorkspaceSection settings={settings} save={save} />
      <TimezoneSection settings={settings} save={save} />
      <MockControlSection settings={settings} />
      <AssistantSection settings={settings} save={save} />
      <PasswordSection />
      <DisasterRecoverySection />
    </div>
  );
}

type SaveFn = (patch: Record<string, unknown>, successMsg?: string) => Promise<boolean>;

function ConnectSection({ settings, save }: { settings: ClientSettings; save: SaveFn }) {
  const [enabled, setEnabled] = useState(settings.connect.enabled);
  const [url, setUrl] = useState(settings.connect.url);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await save({ connect: { enabled, url } });
    setSaving(false);
  }

  return (
    <SettingsSection title="连接区">
      <div className="flex items-center justify-between">
        <span className="text-sm">启用连接区（在顶部导航显示「连接」）</span>
        <Switch checked={enabled} onChange={setEnabled} label="启用连接区" />
      </div>
      <Field label="OpenClaw 网页端地址" hint="必须是 http:// 或 https:// 开头">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://127.0.0.1:18789" />
      </Field>
      <Button onClick={handleSave} disabled={saving} className="self-start">
        {saving ? "保存中…" : "保存"}
      </Button>
    </SettingsSection>
  );
}

function WorkspaceSection({ settings, save }: { settings: ClientSettings; save: SaveFn }) {
  const [root, setRoot] = useState(settings.workspaceRoot);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const ok = await save({ workspaceRoot: root });
    setSaving(false);
    if (ok) window.location.reload(); // 工作区根变化后，文件树/Soul 扫描需要重新加载
  }

  return (
    <SettingsSection title="工作区">
      <Field label="工作区根目录" hint="代码管理 / Soul 扫描的沙箱根路径；修改后会刷新页面">
        <Input value={root} onChange={(e) => setRoot(e.target.value)} />
      </Field>
      <Button onClick={handleSave} disabled={saving} className="self-start">
        {saving ? "保存中…" : "保存"}
      </Button>
    </SettingsSection>
  );
}

function TimezoneSection({ settings, save }: { settings: ClientSettings; save: SaveFn }) {
  const [timezone, setTimezone] = useState(settings.timezone);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await save({ timezone });
    setSaving(false);
  }

  return (
    <SettingsSection title="时区">
      <Field label="时区" hint="影响 token 用量按天归档的日期边界">
        <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Asia/Shanghai" />
      </Field>
      <Button onClick={handleSave} disabled={saving} className="self-start">
        {saving ? "保存中…" : "保存"}
      </Button>
    </SettingsSection>
  );
}

const SPEED_OPTIONS = [0.5, 1, 2, 4] as const;

function MockControlSection({ settings }: { settings: ClientSettings }) {
  const [paused, setPaused] = useState(settings.mock.paused);
  const [speed, setSpeed] = useState(settings.mock.speed);
  const pushToast = useToastStore((s) => s.push);
  const [busy, setBusy] = useState(false);

  async function callMock(action: string, extra?: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/mock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json().catch(() => ({}) as { error?: string });
      if (!res.ok) {
        pushToast((data as { error?: string }).error || "操作失败", "error");
        return false;
      }
      return true;
    } catch {
      pushToast("网络错误", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function togglePause() {
    const next = !paused;
    if (await callMock(next ? "pause" : "resume")) {
      setPaused(next);
      pushToast(next ? "已暂停模拟引擎" : "已继续模拟引擎", "success");
    }
  }

  async function changeSpeed(newSpeed: number) {
    if (await callMock("setSpeed", { speed: newSpeed })) {
      setSpeed(newSpeed as (typeof SPEED_OPTIONS)[number]);
      pushToast(`倍速已调整为 ${newSpeed}x`, "success");
    }
  }

  async function handleReset() {
    const ok = window.confirm("确定重置模拟引擎吗？所有智能体状态将回到初始值。");
    if (!ok) return;
    if (await callMock("reset")) pushToast("已重置模拟引擎", "success");
  }

  return (
    <SettingsSection title="模拟引擎控制">
      <p className="text-xs text-neutral-400">数据源：模拟引擎（当前不支持连接真实 OpenClaw 网关）</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={togglePause} disabled={busy}>
          {paused ? <Play size={14} /> : <Pause size={14} />}
          {paused ? "继续" : "暂停"}
        </Button>
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-neutral-500">倍速</span>
          <Select value={speed} onChange={(e) => changeSpeed(Number(e.target.value))} className="w-24">
            {SPEED_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}x
              </option>
            ))}
          </Select>
        </div>
        <Button variant="danger" onClick={handleReset} disabled={busy}>
          <RotateCcw size={14} />
          重置
        </Button>
      </div>
    </SettingsSection>
  );
}

function AssistantSection({ settings, save }: { settings: ClientSettings; save: SaveFn }) {
  const [enabled, setEnabled] = useState(settings.assistant.enabled);
  const [provider, setProvider] = useState(settings.assistant.provider);
  const [baseUrl, setBaseUrl] = useState(settings.assistant.baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(settings.assistant.model);
  const [maxToolRounds, setMaxToolRounds] = useState(settings.assistant.maxToolRounds);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const patch: Record<string, unknown> = {
      assistant: { enabled, provider, baseUrl, model, maxToolRounds },
    };
    // 只有用户真的输入了新密钥才提交，避免用空字符串把已保存的密钥覆盖掉。
    if (apiKey) (patch.assistant as Record<string, unknown>).apiKey = apiKey;
    const ok = await save(patch);
    if (ok) setApiKey("");
    setSaving(false);
  }

  return (
    <SettingsSection title="AI 助手模型配置">
      <p className="text-xs text-neutral-400">
        独立于 OpenClaw 的内置助手（侧边栏）使用的模型；同一份密钥也会被「模型配置」页的联网获取复用。
      </p>
      <div className="flex items-center justify-between">
        <span className="text-sm">启用侧边栏 AI 助手</span>
        <Switch checked={enabled} onChange={setEnabled} label="启用 AI 助手" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="提供方">
          <Select value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)}>
            <option value="anthropic">Anthropic</option>
            <option value="openai-compatible">OpenAI 兼容</option>
          </Select>
        </Field>
        <Field label="模型 ID">
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="claude-sonnet-4-5" />
        </Field>
        <Field label="Base URL" hint="OpenAI 兼容模式必填；Anthropic 可留空使用官方默认地址">
          <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" />
        </Field>
        <Field
          label="API Key"
          hint={settings.assistant.hasApiKey ? "已配置（输入新值可覆盖，留空保持不变）" : "尚未配置"}
        >
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings.assistant.hasApiKey ? "••••••••" : "sk-…"}
          />
        </Field>
        <Field label="单次对话最大工具调用轮数">
          <Input
            type="number"
            min={1}
            max={20}
            value={maxToolRounds}
            onChange={(e) => setMaxToolRounds(Number(e.target.value))}
          />
        </Field>
      </div>
      <Button onClick={handleSave} disabled={saving} className="self-start">
        {saving ? "保存中…" : "保存"}
      </Button>
    </SettingsSection>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);
  const pushToast = useToastStore((s) => s.push);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8) {
      pushToast("新密码至少需要 8 位", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}) as { error?: string });
      if (!res.ok) {
        pushToast((data as { error?: string }).error || "修改失败", "error");
        return;
      }
      pushToast("密码已修改，请重新登录", "success");
      window.location.href = "/login";
    } catch {
      pushToast("网络错误", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsSection title="管理员密码">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field label="当前密码">
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="新密码" hint="至少 8 位">
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Button type="submit" disabled={saving || !current || !next} className="self-start">
          <KeyRound size={14} />
          {saving ? "修改中…" : "修改密码"}
        </Button>
      </form>
    </SettingsSection>
  );
}

function DisasterRecoverySection() {
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<{ restored: string[]; failed: string[] } | null>(null);
  const pushToast = useToastStore((s) => s.push);

  async function handleRestoreAll() {
    const ok = window.confirm(
      "确定要把所有被追踪过的文件（工作区文件 + 系统设置）都恢复到各自的上一个版本吗？\n" +
        "这会撤销每个文件最近一次的修改，且这个恢复动作本身也会被记录、可以再次撤销。",
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch("/api/versions/restore-all", { method: "POST" });
      const data = await res.json().catch(() => ({}) as { restored?: string[]; failed?: string[] });
      const restored = data.restored ?? [];
      const failed = data.failed ?? [];
      setLastResult({ restored, failed });
      if (restored.length === 0 && failed.length === 0) {
        pushToast("没有可恢复的历史记录（尚未有文件被修改过）", "info");
      } else {
        pushToast(`已恢复 ${restored.length} 个文件${failed.length ? `，${failed.length} 个失败` : ""}`, failed.length ? "error" : "success");
      }
    } catch {
      pushToast("网络错误，恢复失败", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsSection title="灾难恢复">
      <p className="text-sm text-neutral-400">
        所有写操作（文件保存、Soul 保存、AI 助手写文件、设置保存）都会在覆盖前自动保存一份历史快照，
        每个文件最多保留 20 个版本。单个文件的历史版本可以在「代码管理」页文件工具栏的历史图标里查看和恢复；
        这里提供一键把<strong>所有</strong>被追踪过的文件恢复到各自的上一个版本。
      </p>
      <p className="text-xs text-neutral-400">
        另外：settings.json / auth.json 若被外部篡改导致无法解析，系统会在下次读取时自动从最近一个校验通过的快照恢复，无需手动干预。
      </p>
      <Button variant="danger" onClick={handleRestoreAll} disabled={busy} className="self-start">
        <RotateCcw size={14} />
        {busy ? "恢复中…" : "一键恢复上一个正常版本"}
      </Button>
      {lastResult && (
        <div className="text-xs text-neutral-500">
          {lastResult.restored.length > 0 && <p>已恢复：{lastResult.restored.join("、")}</p>}
          {lastResult.failed.length > 0 && <p className="text-red-500">恢复失败：{lastResult.failed.join("、")}</p>}
        </div>
      )}
    </SettingsSection>
  );
}
