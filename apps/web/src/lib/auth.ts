import NextAuth from 'next-auth'
import Discord from 'next-auth/providers/discord'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from '@torcida/db'
import { env, isProd } from '@/lib/env'
import { excedeuLimite, registrarTentativaFalha } from '@/lib/rate-limit'

// Domínio do cookie de sessão — só sobrescrito quando ROOT_DOMAIN está
// configurado (subdomínio real ou lvh.me em dev), pra sessão ser
// compartilhada entre sede/subsede/PDE. Sem ROOT_DOMAIN, comportamento
// padrão do NextAuth (cookie escopado ao host atual) não muda.
const cookieDomain = env.ROOT_DOMAIN ? `.${env.ROOT_DOMAIN}` : undefined

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Railway e outros proxies: confiar no Host/x-forwarded-* da requisição.
  // Sem isso, callbacks OAuth podem montar URL com localhost em produção.
  trustHost: true,
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
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined
        const password = credentials?.password as string | undefined
        if (!email || !password) return null

        // Aplicado aqui (não só na Server Action de /entrar) porque este é o
        // único ponto por onde toda tentativa de login realmente passa —
        // uma chamada direta a /api/auth/callback/credentials, pulando a UI,
        // teria burlado o limite se ele só existisse na Server Action.
        if (excedeuLimite(email)) return null

        const user = await db.user.findUnique({ where: { email } })
        // Erro genérico (usuário inexistente ou sem senha cadastrada) —
        // não diferenciar do caso de senha errada, evita enumeração de contas.
        if (!user?.senhaHash) {
          registrarTentativaFalha(email)
          return null
        }

        const senhaValida = await bcrypt.compare(password, user.senhaHash)
        if (!senhaValida) {
          registrarTentativaFalha(email)
          return null
        }

        return { id: user.id, email: user.email, name: user.nome, image: user.avatarUrl }
      },
    }),
  ],

  ...(cookieDomain
    ? {
        cookies: {
          sessionToken: {
            name: `${isProd ? '__Secure-' : ''}authjs.session-token`,
            options: {
              httpOnly: true,
              sameSite: 'lax',
              path: '/',
              secure: isProd,
              domain: cookieDomain,
            },
          },
        },
      }
    : {}),

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

    async jwt({ token, account, user }) {
      // Somente no login inicial (account presente) buscamos o UUID do banco
      // e sobrescrevemos token.sub para que session.user.id seja sempre o UUID,
      // nunca o ID numérico do OAuth provider (Discord snowflake / Google ID).
      if (account) {
        token.provider = account.provider
        token.providerAccountId = account.providerAccountId

        // Credentials (e-mail/senha): authorize() já devolve o UUID do banco
        // como user.id — não há discordId/googleId pra buscar, então usa direto.
        if (account.provider === 'credentials') {
          if (user?.id) token.sub = user.id
          return token
        }

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
