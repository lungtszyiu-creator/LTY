# 任务池 · Task Pool

一个轻量的任务发布 / 领取 / 审核看板，类似悬赏机制。管理员发布任务，成员领取、提交成果，管理员审核通过或驳回。

技术栈：Next.js 14 (App Router) · TypeScript · Tailwind · Prisma · SQLite · NextAuth (Google)

---

## 一、本地启动

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 Google OAuth

访问 [Google Cloud Console › APIs & Services › Credentials](https://console.cloud.google.com/apis/credentials)：

1. 新建项目（或复用已有项目）
2. 配置 OAuth 同意屏幕（External / 测试用户加上自己的 Google 邮箱）
3. 创建 **OAuth 2.0 客户端 ID**：
   - 类型：Web application
   - **Authorized redirect URIs**：`http://localhost:3000/api/auth/callback/google`
   - 上线后再加生产域名的回调
4. 记下 **Client ID** 和 **Client Secret**

### 3. 配置环境变量

```bash
cp .env.example .env.local
```

编辑 `.env.local`：

```env
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="<openssl rand -base64 32 生成>"
NEXTAUTH_URL="http://localhost:3000"
GOOGLE_CLIENT_ID="xxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="xxx"
ADMIN_EMAILS="your-google-email@gmail.com"   # 用逗号分隔多个
UPLOAD_DIR="./uploads"
```

> `ADMIN_EMAILS` 里的邮箱第一次用 Google 登录时会被自动设为管理员。

### 4. 初始化数据库

```bash
npx prisma db push   # 建表
npm run seed         # 写入管理员记录（可选，登录时也会自动 upsert）
```

### 5. 启动

```bash
npm run dev
```

打开 <http://localhost:3000>，点"使用 Google 登录"。

---

## 二、功能

| 模块 | 管理员 | 成员 |
|---|---|---|
| 查看任务看板、筛选 | ✅ | ✅ |
| 发布 / 编辑 / 删除任务 | ✅ | ❌ |
| 领取、释放任务 | — | ✅ |
| 提交工作成果（文字 + 附件） | — | ✅（仅自己领取的） |
| 审核：通过 / 驳回 | ✅ | ❌ |
| 用户管理（添加、改角色、禁用） | ✅ | ❌ |

任务状态流转：
`OPEN`（待领取） → `CLAIMED`（进行中） → `SUBMITTED`（待审核） → `APPROVED`（已通过） / `REJECTED`（已驳回，可再次提交）

---

## 三、上线到免费服务器

### 推荐方案：**Vercel + Neon (Postgres) + Cloudflare R2**

#### 1. 数据库：切到 Postgres

- 在 [Neon](https://neon.tech) 免费开一个 Postgres，复制 connection string
- 修改 `prisma/schema.prisma`：
  ```prisma
  datasource db {
    provider = "postgresql"
    url      = env("DATABASE_URL")
  }
  ```
- Vercel 环境变量里填上 Neon 的 `DATABASE_URL`
- 部署时运行 `npx prisma migrate deploy`（可加到 build 脚本）

#### 2. 文件存储：改 S3/R2

Vercel 无持久磁盘，本地上传方案不能直接上线。两条路：

**A. 改用 Cloudflare R2**（免费 10 GB + 免出口流量）
- 装 `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
- 改写 `src/lib/storage.ts`：上传时 `PutObject`；下载时签名 URL 重定向
- 改写 `src/app/api/attachments/[id]/route.ts`：`redirect` 到 R2 签名 URL

**B. 先简单：用 [Uploadthing](https://uploadthing.com) / [Supabase Storage](https://supabase.com/storage) 免费层**
- 这两个都提供托管上传 SDK，集成更快

#### 3. 部署

- 推 GitHub，在 Vercel 导入
- 环境变量：`DATABASE_URL` / `NEXTAUTH_SECRET` / `NEXTAUTH_URL`（填 Vercel 域名）/ `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `ADMIN_EMAILS` / 对象存储的 keys
- 回到 Google Console 追加生产域名的回调 URL：`https://<your-app>.vercel.app/api/auth/callback/google`

### 备选：Railway / Render / Fly.io

这些平台有持久磁盘（或挂载卷），可以继续用 SQLite + 本地文件上传，迁移成本最低；但带宽、冷启动时间不如 Vercel。

---

## 四、目录结构

```
prisma/
  schema.prisma            数据模型
  seed.ts                  初始化管理员
src/
  app/
    api/                   REST API
      auth/[...nextauth]/  NextAuth 处理
      tasks/               任务 CRUD + 领取/提交
      submissions/         审核
      users/               用户管理
      upload/              文件上传
      attachments/[id]/    附件下载（鉴权）
    login/                 登录页
    dashboard/             任务看板
    tasks/[id]/            任务详情（领取/提交/审核）
    admin/
      tasks/new/           发布任务
      users/               用户管理
  components/              Nav / FileUpload / StatusBadge / Providers
  lib/
    auth.ts                NextAuth 配置 + 会话注入 role
    db.ts                  Prisma 单例
    permissions.ts         requireUser / requireAdmin
    storage.ts             文件保存
uploads/                   本地附件存储（生产请替换为对象存储）
```

---

## 五、常用命令

```bash
npm run dev          # 本地开发
npm run build        # 构建
npm start            # 启动生产 server
npm run db:push      # 同步 schema 到 DB（dev）
npm run db:migrate   # 创建迁移（生产推荐）
npm run db:studio    # 图形化查看/编辑 DB
npm run seed         # 初始化管理员
```

---

## 六、v1 不包含，后续可加

- 邮件/飞书/企业微信通知（新任务、有人提交、审核结果）
- 任务评论 / 讨论
- 任务分类、标签
- 任务编辑页（现在只支持 API，未做 UI）
- 工作量统计：成员完成了多少、总奖励
- 批量导入用户
