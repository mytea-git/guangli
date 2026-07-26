import { readJson, writeJson } from "./jsonStore";
import { hashPassword } from "@/lib/auth/password";
import { getGlobalSingleton } from "@/lib/utils/globalSingleton";

const FILE = "auth.json";

export interface AuthRecord {
  passwordHash: string;
  updatedAt: string;
  /** 记录密码是否仍是启动时从 ADMIN_PASSWORD 环境变量生成的初始值。 */
  bootstrapped: boolean;
}

interface BootstrapState {
  promise: Promise<AuthRecord> | null;
}

function bootstrapState(): BootstrapState {
  return getGlobalSingleton("authBootstrap", () => ({ promise: null }));
}

export async function getAuthRecord(): Promise<AuthRecord> {
  const existing = await readJson<AuthRecord | null>(FILE, null);
  if (existing) return existing;

  const state = bootstrapState();
  if (!state.promise) {
    state.promise = (async () => {
      const pw = process.env.ADMIN_PASSWORD || "guangli-admin";
      const passwordHash = await hashPassword(pw);
      const record: AuthRecord = {
        passwordHash,
        updatedAt: new Date().toISOString(),
        bootstrapped: true,
      };
      await writeJson(FILE, record, { snapshot: true });
      return record;
    })();
  }
  return state.promise;
}

export async function setPassword(newPassword: string): Promise<void> {
  const passwordHash = await hashPassword(newPassword);
  const record: AuthRecord = {
    passwordHash,
    updatedAt: new Date().toISOString(),
    bootstrapped: false,
  };
  await writeJson(FILE, record, { snapshot: true });
  bootstrapState().promise = Promise.resolve(record);
}
