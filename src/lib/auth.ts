import type { AuthOptions, DefaultSession } from 'next-auth';
import { getServerSession } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from './db';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: 'ADMIN' | 'MEMBER';
      active: boolean;
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
      session.user.role = (dbUser.role as 'ADMIN' | 'MEMBER') ?? 'MEMBER';
      session.user.active = dbUser.active;
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (user.email && adminEmails.has(user.email.toLowerCase())) {
        await prisma.user.update({
          where: { id: user.id },
          data: { role: 'ADMIN', active: true },
        });
      }
    },
  },
};

export const getSession = () => getServerSession(authOptions);
