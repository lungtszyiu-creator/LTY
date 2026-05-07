/**
 * LLM 模型价格表（HKD 为最终币种）
 * ============================================
 *
 * 业务铁律：**看板服务端自己算成本，绝不信任 AI 自报金额**。
 *
 * 来源：MC Markets 看板原版（2026 Q1 价目）。如老板拿到新价目要更新，
 * 直接改本表 PRICING 常量即可，不用动 schema。
 *
 * 单位：USD 每百万 token（per 1M tokens）。本函数最终输出 HKD（乘 USD→HKD 汇率）。
 *
 * 汇率：默认 7.8（HKD→USD 港币锚定汇率，长期稳定）。
 *   - 通过 env `HKD_USD_RATE` 覆盖（部署前可注入）
 *   - 未来可改成读 LTY 现有 FxRate 表的 USD/HKD 实时值（v1.1）
 */

const PRICING: Record<string, { inputPerMtokUsd: number; outputPerMtokUsd: number }> = {
  // Anthropic — Claude 4 系列
  'claude-opus-4-7': { inputPerMtokUsd: 15, outputPerMtokUsd: 75 },
  'claude-sonnet-4-6': { inputPerMtokUsd: 3, outputPerMtokUsd: 15 },
  'claude-haiku-4-5': { inputPerMtokUsd: 0.8, outputPerMtokUsd: 4 },

  // OpenAI — GPT-5 系列
  'gpt-5': { inputPerMtokUsd: 5, outputPerMtokUsd: 20 },
  'gpt-5-mini': { inputPerMtokUsd: 0.5, outputPerMtokUsd: 2 },
  'gpt-4o': { inputPerMtokUsd: 5, outputPerMtokUsd: 15 },
  'gpt-4o-mini': { inputPerMtokUsd: 0.15, outputPerMtokUsd: 0.6 },
};

/** 未知模型用这档兜底 — 故意贵一点提醒老板该补价表了 */
const FALLBACK = { inputPerMtokUsd: 5, outputPerMtokUsd: 15 };

/**
 * USD → HKD 汇率。环境变量 `HKD_USD_RATE` 优先；缺省 7.8（HKD 联系汇率制）。
 * 未来可改成读 FxRate 表（USD/HKD pair 的最新值）。
 */
export function getHkdUsdRate(): number {
  const raw = process.env.HKD_USD_RATE;
  if (!raw) return 7.8;
  const v = parseFloat(raw);
  return Number.isFinite(v) && v > 0 ? v : 7.8;
}

/**
 * 算这次 LLM 调用值多少 HKD。
 * 输入 / 输出 token 数分开计价（输出比输入贵，多数模型 4-5x）。
 * 返回 number（route 写入时再转 Decimal 存表）。
 */
export function computeCostHkd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = PRICING[model] ?? FALLBACK;
  const usd = (inputTokens / 1e6) * p.inputPerMtokUsd + (outputTokens / 1e6) * p.outputPerMtokUsd;
  return usd * getHkdUsdRate();
}

/** 给 UI 用的「这个模型有没有列在表里」检查 */
export function isKnownModel(model: string): boolean {
  return model in PRICING;
}

/** 给 UI 用的所有已知模型列表（按价由低到高） */
export function listKnownModels(): string[] {
  return Object.entries(PRICING)
    .map(([m, p]) => ({ m, avg: (p.inputPerMtokUsd + p.outputPerMtokUsd) / 2 }))
    .sort((a, b) => a.avg - b.avg)
    .map((x) => x.m);
}

/**
 * 公司日预算（HKD）。可由 env `DAILY_BUDGET_HKD` 覆盖。
 *
 * 默认 500 HKD —— 老板拍板（2026-05-08）。Step 5 起撞顶自动暂停超额员工。
 * 若以后预算放宽改 env 即可，不动代码。
 */
export function getCompanyDailyBudgetHkd(): number {
  const raw = process.env.DAILY_BUDGET_HKD;
  if (!raw) return 500;
  const v = parseFloat(raw);
  return Number.isFinite(v) && v > 0 ? v : 500;
}
