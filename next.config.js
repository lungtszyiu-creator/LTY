/** @type {import('next').NextConfig} */
// Build cache buster: 2026-05-08 — Vercel 把 PR #58 新加的
// /api/v1/me/employee 路由漏在 build cache 外，访问持续 404。改本文件
// 强制 Vercel build cache 失效重新整体 build。如再遇路由漏 build，复
// 制日期改成今日，commit + push 即触发 fresh rebuild。
const nextConfig = {
  reactStrictMode: true,
  experimental: { serverActions: { bodySizeLimit: '25mb' } },
};
module.exports = nextConfig;
