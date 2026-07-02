import NextAuth from 'next-auth'
import Discord from 'next-auth/providers/discord'
import Google from 'next-auth/providers/google'
import { db } from '@torcida/db'
import { env } from '@/lib/env'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Discord({
      clientId: env.DISCORD_CLIENT_ID,
      clientSecret: env.DISCORD_CLIENT_SECRET,
      authorization: {
        params: {
          scope: 'identify email guilds',
        },
      },
    }),
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: 'openid email profile',
          prompt: 'select_account',
        },
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account) return false

      try {
        const existingUser = await findOrCreateUser(
          user,
          account,
          (profile ?? {}) as Record<string, unknown>,
        )
        if (!existingUser) return false

        return true
      } catch (error) {
        console.error('[auth] Erro no signIn:', error)
        return false
      }
    },

    async session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub
      }
      return session
    },

    async jwt({ token, account }) {
      // Somente no login inicial (account presente) buscamos o UUID do banco
      // e sobrescrevemos token.sub para que session.user.id seja sempre o UUID,
      // nunca o ID numérico do OAuth provider (Discord snowflake / Google ID).
      if (account) {
        token.provider = account.provider
        token.providerAccountId = account.providerAccountId

        const discordId = account.provider === 'discord' ? account.providerAccountId : undefined
        const googleId  = account.provider === 'google'  ? account.providerAccountId : undefined

        const dbUser = await db.user.findFirst({
          where: {
            OR: [
              ...(discordId ? [{ discordId }] : []),
              ...(googleId  ? [{ googleId  }] : []),
            ],
          },
          select: { id: true },
        })

        if (dbUser) {
          token.sub = dbUser.id   // UUID do banco — usado em session.user.id
        }
      }
      return token
    },
  },

  pages: {
    signIn: '/entrar',
    error: '/entrar',
  },

  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 dias
  },
})

async function findOrCreateUser(
  user: { email?: string | null; name?: string | null; image?: string | null },
  account: { provider: string; providerAccountId: string },
  profile: Record<string, unknown>,
) {
  const discordId = account.provider === 'discord' ? account.providerAccountId : undefined
  const googleId = account.provider === 'google' ? account.providerAccountId : undefined

  // Tenta encontrar usuário existente por provider ID ou e-mail
  let existingUser = await db.user.findFirst({
    where: {
      OR: [
        ...(discordId ? [{ discordId }] : []),
        ...(googleId ? [{ googleId }] : []),
        ...(user.email ? [{ email: user.email }] : []),
      ],
    },
  })

  if (existingUser) {
    // Vincula provider se ainda não vinculado (ex: usuário logou com Discord antes e agora logou com Google)
    await db.user.update({
      where: { id: existingUser.id },
      data: {
        ...(discordId && !existingUser.discordId ? { discordId } : {}),
        ...(googleId && !existingUser.googleId ? { googleId } : {}),
        // Google fornece dados mais precisos — usa como fonte preferida
        ...(account.provider === 'google'
          ? {
              nome: user.name ?? existingUser.nome,
              avatarUrl: user.image ?? existingUser.avatarUrl,
              email: user.email ?? existingUser.email,
            }
          : {}),
      },
    })
  } else {
    // Cria novo usuário
    existingUser = await db.user.create({
      data: {
        email: user.email ?? null,
        nome: user.name ?? null,
        avatarUrl: user.image ?? null,
        discordId: discordId ?? null,
        googleId: googleId ?? null,
      },
    })
  }

  return existingUser
}
