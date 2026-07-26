import { readJson, writeJson } from "./jsonStore";
import { hashPassword } from "@/lib/auth/password";
import { getGlobalSingleton } from "@/lib/utils/globalSingleton";

const FILE = "auth.json";

export interface AuthRecord {
  passwordHash: string;
  updatedAt: string;
  /** 记录密码是否仍是启动时从 ADMIN_PASSWORD 环境变量生成的初始值。 */
  bootstrapped: boolean;
  /** 每次改密码都会递增；写进 JWT 的 `v` 字段，让旧 token 在改密后立即失效。 */
  tokenVersion: number;
}

interface BootstrapState {
  promise: Promise<AuthRecord> | null;
}

function bootstrapState(): BootstrapState {
  return getGlobalSingleton("authBootstrap", () => ({ promise: null }));
}

export async function getAuthRecord(): Promise<AuthRecord> {
  const existing = await readJson<AuthRecord | null>(FILE, null);
  if (existing) {
    if (typeof existing.tokenVersion !== "number") {
      // 兼容"改密即失效"功能上线前写入的旧记录：补齐 tokenVersion，
      // 视为从未改过密码的初始版本，落盘一次避免每次读取都要重算。
      const migrated: AuthRecord = { ...existing, tokenVersion: 1 };
      await writeJson(FILE, migrated, { snapshot: true });
      return migrated;
    }
    return existing;
  }

  const state = bootstrapState();
  if (!state.promise) {
    state.promise = (async () => {
      const pw = process.env.ADMIN_PASSWORD || "guangli-admin";
      const passwordHash = await hashPassword(pw);
      const record: AuthRecord = {
        passwordHash,
        updatedAt: new Date().toISOString(),
        bootstrapped: true,
        tokenVersion: 1,
      };
      await writeJson(FILE, record, { snapshot: true });
      return record;
    })();
  }
  return state.promise;
}

export async function setPassword(newPassword: string): Promise<void> {
  const current = await getAuthRecord();
  const passwordHash = await hashPassword(newPassword);
  const record: AuthRecord = {
    passwordHash,
    updatedAt: new Date().toISOString(),
    bootstrapped: false,
    tokenVersion: current.tokenVersion + 1,
  };
  await writeJson(FILE, record, { snapshot: true });
  bootstrapState().promise = Promise.resolve(record);
}
