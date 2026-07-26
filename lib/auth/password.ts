// 使用 Node 内置 node:crypto 的 scrypt，而不是 bcrypt —— bcrypt 是原生模块，
// 会在 alpine 多阶段 Docker 构建中引入 node-gyp 编译步骤，破坏干净的镜像构建。
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N},${R},${P}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, params, saltB64, hashB64] = stored.split("$");
    if (scheme !== "scrypt" || !params || !saltB64 || !hashB64) return false;
    const [nStr, rStr, pStr] = params.split(",");
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const derived = await scrypt(password, salt, expected.length, {
      N: Number(nStr),
      r: Number(rStr),
      p: Number(pStr),
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
