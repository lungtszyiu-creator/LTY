/**
 * 简易 health 端点 · 给 launchd watchdog 用
 * 故意不打 DB / Prisma / 外部 API,保证只要 Next.js 进程活着就 200
 * 不需要鉴权,内网 Tailscale + 本地 :3000 才有访问机会
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    ts: new Date().toISOString(),
    service: "lty-taskpool",
  });
}

export async function HEAD() {
  return new Response(null, { status: 200 });
}
