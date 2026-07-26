import { lookup } from "node:dns/promises";

export class UnsafeUrlError extends Error {
  constructor(message = "目标地址不允许访问") {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

// 覆盖常见的回环/内网/链路本地范围（含云元数据端点 169.254.169.254）。
// 只做主机名/IP 层面的检查，不看路径——这里防的是"管理员配置的地址
// 解析到内网"，不是防管理员本人（他对这个地址本就有完全配置权）。
function isPrivateOrReservedIp(ip: string): boolean {
  if (ip.includes(".")) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true; // 无法识别，保守拒绝
    const [a, b] = parts;
    if (a === 127) return true; // 127.0.0.0/8 回环
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // 169.254.0.0/16（含云元数据 169.254.169.254）
    if (a === 0) return true; // 0.0.0.0/8
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === "::1") return true; // 回环
  if (lower.startsWith("::ffff:")) return isPrivateOrReservedIp(lower.slice("::ffff:".length)); // IPv4 映射地址
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true; // fe80::/10 链路本地
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true; // fc00::/7 唯一本地地址
  return false;
}

/**
 * 对"管理员配置的外部地址"（如 AI 助手/模型目录联网获取用的 OpenAI
 * 兼容 Base URL）做出网前的 SSRF 防护：只允许 http/https，且解析出的
 * 所有 A/AAAA 记录都不能落在回环/内网/链路本地范围内。
 *
 * 已知残余风险（接受为合理取舍，非本次修复范围）：这里的检查与实际
 * fetch 之间存在很窄的 DNS rebinding 窗口——攻击者控制的域名可以在
 * 校验时返回公网 IP、在紧随其后的真实连接时改returns内网 IP。彻底杜绝
 * 需要"解析一次、后续都连到该 IP、手动设置 Host/SNI"这类专门的出网
 * 代理机制，超出这次防御性加固的范围；这里做的是常规场景下（管理员
 * 误填/被诱导填入明显的内网地址）的纵深防御，而不是针对专业攻击者的
 * 完整隔离。
 */
export async function assertPublicHttpUrl(urlString: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new UnsafeUrlError("地址格式无效");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UnsafeUrlError("仅支持 http/https 地址");
  }
  const hostname = parsed.hostname;
  if (hostname === "localhost") {
    throw new UnsafeUrlError("不允许访问本机地址");
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new UnsafeUrlError("域名解析失败");
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateOrReservedIp(a.address))) {
    throw new UnsafeUrlError("目标地址解析到内网/本机地址，已拒绝");
  }
}
