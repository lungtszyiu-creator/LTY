import type { AuthOptions, DefaultSession } from 'next-auth';
import { getServerSession } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from './db';

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'MEMBER';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: Role;
      active: boolean;
      // 财务模块权限：null = 无权限（多数员工）/ "VIEWER" = 出纳 / "EDITOR" = 财务管理
      // 注意：role === 'SUPER_ADMIN' 自动等同 'EDITOR'，无需在此设值
      financeRole: 'VIEWER' | 'EDITOR' | null;
    } & DefaultSession['user'];
  }
}

const adminEmails = new Set(
  (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'database' },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: { signIn: '/login' },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      const existing = await prisma.user.findUnique({ where: { email: user.email } });
      if (existing && !existing.active) return false;
      return true;
    },
    async session({ session, user }) {
      // `user` here is the DB user because strategy=database.
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      if (!dbUser) return session;
      session.user.id = dbUser.id;
      const role = (dbUser.role as Role) ?? 'MEMBER';
      session.user.role = role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'MEMBER' ? role : 'MEMBER';
      session.user.active = dbUser.active;
      // financeRole 同步进 session，让客户端 Nav / 页面能据此显隐入口
      const fr = dbUser.financeRole;
      session.user.financeRole = fr === 'EDITOR' || fr === 'VIEWER' ? fr : null;
      return session;
    },
  },
  events: {
    // ADMIN_EMAILS in .env.local seeds SUPER_ADMIN on first sign-in. There should
    // only be one super admin (the founder); everyone else is managed in-app.
    async createUser({ user }) {
      if (user.email && adminEmails.has(user.email.toLowerCase())) {
        await prisma.user.update({
          where: { id: user.id },
          data: { role: 'SUPER_ADMIN', active: true },
        });
      }
    },
  },
};

export function roleRank(role: Role): number {
  if (role === 'SUPER_ADMIN') return 2;
  if (role === 'ADMIN') return 1;
  return 0;
}

export function hasMinRole(role: Role | undefined | null, min: Role): boolean {
  if (!role) return false;
  return roleRank(role) >= roleRank(min);
}

export const getSession = () => getServerSession(authOptions);
