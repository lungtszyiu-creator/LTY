-- 删除手动加的"设计部"和"老板"Department 记录
--
-- 老板说这两个部门"都没用"，跟 PR #46 删"财务部"同模式物理删。
-- 双重保险：
--   1. slug NOT IN (5 个 seed 的合法部门) 防误伤
--   2. name 精确匹配候选名（含可能的变体）
-- DepartmentMembership FK 是 onDelete: Cascade，连带清相关 memberships。

DELETE FROM "Department"
WHERE slug NOT IN ('admin', 'lty-legal', 'mc-legal', 'hr', 'cashier')
  AND (
    name = '设计部'
    OR name = '设计'
    OR name = '设计师'
    OR name = '老板'
    OR name = '老板部'
    OR name = '老板组'
    OR slug = 'design'
    OR slug = 'designer'
    OR slug = 'boss'
  );
