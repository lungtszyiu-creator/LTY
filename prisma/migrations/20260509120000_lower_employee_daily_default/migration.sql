-- 老板拍板调低 AI 预算（2026-05-08）：
--   公司日预算 100k → 500 HKD（在 lib/pricing.ts 默认值）
--   单员工日预算默认 1000 → 100 HKD（5 员工塞满才到公司顶）
-- 仅改 column DEFAULT；已有员工记录不动（老板可能已针对个别员工手动调过）。
ALTER TABLE "AiEmployee" ALTER COLUMN "dailyLimitHkd" SET DEFAULT 100;
