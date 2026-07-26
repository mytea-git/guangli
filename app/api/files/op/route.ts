import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth/requireAuth";
import { createEntry, deleteEntry, renameEntry } from "@/lib/files/service";
import { PathViolation } from "@/lib/files/sandbox";

export const runtime = "nodejs";

const bodySchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("create"), path: z.string().min(1).max(1024), kind: z.enum(["file", "dir"]) }),
  z.object({ op: z.literal("delete"), path: z.string().min(1).max(1024), recursive: z.boolean().optional() }),
  z.object({ op: z.literal("rename"), path: z.string().min(1).max(1024), newPath: z.string().min(1).max(1024) }),
]);

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "未授权" }, { status: 401 });
    throw err;
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "请求参数无效" }, { status: 400 });

  try {
    switch (parsed.data.op) {
      case "create":
        await createEntry(parsed.data.path, parsed.data.kind);
        break;
      case "delete":
        await deleteEntry(parsed.data.path, Boolean(parsed.data.recursive));
        break;
      case "rename":
        await renameEntry(parsed.data.path, parsed.data.newPath);
        break;
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PathViolation) return NextResponse.json({ error: "非法路径或文件名" }, { status: 403 });
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "EEXIST") return NextResponse.json({ error: "目标已存在" }, { status: 409 });
    if (code === "ENOENT") return NextResponse.json({ error: "目标不存在" }, { status: 404 });
    if (code === "ENOTEMPTY") return NextResponse.json({ error: "目录非空，无法删除" }, { status: 409 });
    console.error("[files/op]", err);
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}
