#!/usr/bin/env bash
#
# 生成 PWA / iOS 主屏幕 icon —— 酒红渐变底 + 金色 logo
#
# Why：iOS 把网页加入主屏幕时不支持透明 PNG（会自动填白底），所以必须
# 预先把品牌底色烧进 PNG，否则桌面图标会变成"白底 + 纯金色 logo"。
#
# 输出：
#   public/apple-touch-icon.png  (180×180)  - iOS 主屏幕
#   public/icon-192.png          (192×192)  - Android Chrome 默认
#   public/icon-512.png          (512×512)  - manifest maskable + 通用大尺寸
#
# 颜色与 src/app/globals.css 的 --ruby-* 渐变一致（btn-primary 同款）。
#
# 依赖：rsvg-convert（macOS: brew install librsvg）

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGO_SVG="$ROOT/public/logo.svg"
SRC_SVG="$(mktemp -t lty-icon-source-XXXXXX).svg"
trap 'rm -f "$SRC_SVG"' EXIT

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "错：rsvg-convert 未安装。装：brew install librsvg" >&2
  exit 1
fi

PATHS="$(perl -ne 'print if /<path /' "$LOGO_SVG")"

cat > "$SRC_SVG" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6b1028"/>
      <stop offset="55%" stop-color="#3a0a14"/>
      <stop offset="100%" stop-color="#1a0f0a"/>
    </linearGradient>
    <radialGradient id="glow" cx="0%" cy="0%" r="120%">
      <stop offset="0%" stop-color="rgba(232,201,143,0.32)"/>
      <stop offset="55%" stop-color="rgba(232,201,143,0)"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <rect width="1024" height="1024" fill="url(#glow)"/>
  <g transform="translate(122 122) scale(0.5733)">
$PATHS
  </g>
</svg>
EOF

rsvg-convert -w 180 -h 180 "$SRC_SVG" -o "$ROOT/public/apple-touch-icon.png"
rsvg-convert -w 192 -h 192 "$SRC_SVG" -o "$ROOT/public/icon-192.png"
rsvg-convert -w 512 -h 512 "$SRC_SVG" -o "$ROOT/public/icon-512.png"
# Next.js 约定路径：app/apple-icon.png 自动暴露成 /apple-icon，作为 fallback；
# 即便有人改了 metadata.icons.apple 配置忘改这里，也不会回退到白底。
rsvg-convert -w 180 -h 180 "$SRC_SVG" -o "$ROOT/src/app/apple-icon.png"

echo "✓ 已生成 4 个 icon："
ls -la "$ROOT/public/apple-touch-icon.png" "$ROOT/public/icon-192.png" "$ROOT/public/icon-512.png" "$ROOT/src/app/apple-icon.png"
