-- 知识库上传时让上传人手填一段说明，老板和知识管家都看得到，
-- 后续整理时按 description 分类（老板要求 2026-05-08）。
ALTER TABLE "PendingUpload" ADD COLUMN "description" TEXT;
