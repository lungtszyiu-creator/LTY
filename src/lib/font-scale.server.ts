// 仅服务端使用 —— 含 next/headers 的 cookies()，不能被 client component 链路 import。
// 类型 / 常量层在 ./font-scale.ts。
import { cookies } from 'next/headers';
import { FONT_SCALE_COOKIE, isFontScale, type FontScale } from './font-scale';

export function getFontScale(): FontScale {
  const v = cookies().get(FONT_SCALE_COOKIE)?.value;
  return isFontScale(v) ? v : 'base';
}
