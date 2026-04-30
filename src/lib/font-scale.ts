/**
 * 全局字体大小调节 —— 类型 / 常量层（client/server 都能 import）
 *
 * 用 CSS `zoom` 而非 html font-size，原因：
 * 项目里有 55+ 处硬编码 `text-[10px]` `text-[11px]` 这类 arbitrary px
 * （角标 / 徽章 / 倒计时等），用 root font-size 调节时这些不会跟着缩，
 * 大字号档下主体放大、小角标卡死在 10px → 比例错乱 = "字体混乱"。
 *
 * `zoom` 等比缩放整个文档（含 px / rem / em / 边距 / 容器），
 * 视觉等价于浏览器原生 ⌘+ 放大，iOS Safari + Chrome + Edge 都支持。
 *
 * 服务端读 cookie 的实现见 `font-scale.server.ts`，避免 `next/headers`
 * 通过 client component 链路被打包进浏览器。
 */
export type FontScale = 'sm' | 'base' | 'lg' | 'xl';

/** zoom 倍率：1.0 = 标准，间隔 12.5% */
export const FONT_SCALE_ZOOM: Record<FontScale, number> = {
  sm: 0.875,
  base: 1.0,
  lg: 1.125,
  xl: 1.25,
};

export const FONT_SCALE_LABEL: Record<FontScale, string> = {
  sm: '小',
  base: '标准',
  lg: '大',
  xl: '超大',
};

export const FONT_SCALE_COOKIE = 'font-scale';

export function isFontScale(v: unknown): v is FontScale {
  return v === 'sm' || v === 'base' || v === 'lg' || v === 'xl';
}
