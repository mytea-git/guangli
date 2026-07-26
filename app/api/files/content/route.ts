import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth/requireAuth";
import {
  readFileContent,
  writeFileContent,
  FileNotFoundError,
  FileTooLargeError,
  BinaryFileError,
  ConflictError,
  MAX_FILE_BYTES,
} from "@/lib/files/service";
import { PathViolation } from "@/lib/files/sandbox";

export const runtime = "nodejs";

async function checkAuth(req: NextRequest) {
  try {
    await requireAuth(req);
    return null;
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "未授权" }, { status: 401 });
    throw err;
  }
}

export async function GET(req: NextRequest) {
  const unauthorized = await checkAuth(req);
  if (unauthorized) return unauthorized;

  const relPath = req.nextUrl.searchParams.get("path");
  if (!relPath) return NextResponse.json({ error: "缺少 path 参数" }, { status: 400 });

  try {
    const result = await readFileContent(relPath);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof PathViolation) return NextResponse.json({ error: "非法路径" }, { status: 403 });
    if (err instanceof FileNotFoundError) return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    if (err instanceof FileTooLargeError) {
      return NextResponse.json({ error: `文件过大（超过 ${MAX_FILE_BYTES / 1024 / 1024}MB）` }, { status: 413 });
    }
    if (err instanceof BinaryFileError) return NextResponse.json({ binary: true }, { status: 415 });
    console.error("[files/content GET]", err);
    return NextResponse.json({ error: "读取文件失败" }, { status: 500 });
  }
}

const putSchema = z.object({
  path: z.string().min(1).max(1024),
  content: z.string().max(2 * 1024 * 1024),
  knownModifiedAt: z.string().optional(),
});

export async function PUT(req: NextRequest) {
  const unauthorized = await checkAuth(req);
  if (unauthorized) return unauthorized;

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "请求参数无效" }, { status: 400 });

  try {
    const result = await writeFileContent(parsed.data.path, parsed.data.content, parsed.data.knownModifiedAt);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof PathViolation) return NextResponse.json({ error: "非法路径" }, { status: 403 });
    if (err instanceof FileTooLargeError) {
      return NextResponse.json({ error: `文件过大（超过 ${MAX_FILE_BYTES / 1024 / 1024}MB）` }, { status: 413 });
    }
    if (err instanceof ConflictError) {
      return NextResponse.json({ error: "文件已被修改，请刷新后重试", conflict: true }, { status: 409 });
    }
    console.error("[files/content PUT]", err);
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
}
