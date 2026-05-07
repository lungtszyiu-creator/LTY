-- 删除手动加的"财务部"Department 记录
--
-- 老板财务功能的入口是：
--   1. 顶级 Nav "财务"链接 → /finance（与 Department 表无关）
--   2. 部门下拉里的"出纳" → /dept/cashier（slug='cashier'）
-- "财务部"那条 Department（slug='finance' 或 name='财务部' / '财务'）跟这两个入口
-- 重复且多余 —— 老板要求物理删掉。
--
-- 安全：DepartmentMembership 表对 Department 的 FK 是 onDelete: Cascade，
-- 删 Department 会连带清掉相关 memberships（如果有）。
-- 精确条件：slug != 'cashier' AND (slug='finance' OR name IN ('财务','财务部'))
-- 避免误伤其它部门（行政 / 法务双 / HR / 出纳）。

DELETE FROM "Department"
WHERE slug != 'cashier'
  AND (slug = 'finance' OR name = '财务' OR name = '财务部');
