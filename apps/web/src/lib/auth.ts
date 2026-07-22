import NextAuth from 'next-auth'
import Discord from 'next-auth/providers/discord'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from '@torcida/db'
import { normalizarNickname } from '@torcida/types'
import { env, isProd } from '@/lib/env'
import { excedeuLimite, registrarTentativaFalha } from '@/lib/rate-limit'
import { resolveSharedCookieDomain } from '@/lib/session-cookie'
import { registrarUltimoAcesso } from '@/lib/presenca'
import { extrairPerfilOAuth } from '@/lib/oauth-perfil'
import { tentarAtribuirNickname } from '@/lib/nickname-disponivel'
import { revalidateTag } from 'next/cache'
import { tagAvatarUsuario } from '@/lib/avatar-cache'

// Cookie compartilhado entre subdomínios só quando o host público = ROOT_DOMAIN.
const cookieDomain = resolveSharedCookieDomain()

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
      // `email` no form = e-mail OU nickname (@handle).
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const loginRaw = credentials?.email as string | undefined
        const password = credentials?.password as string | undefined
        if (!loginRaw || !password) return null

        const login = loginRaw.trim()
        if (!login) return null

        // Chave de rate-limit estável: e-mail em minúsculas ou nickname sem @.
        const rateKey = login.toLowerCase().replace(/^@+/, '')
        if (excedeuLimite(rateKey)) return null

        const emailCandidate = login.toLowerCase()
        const nicknameCandidate = normalizarNickname(login)

        const user = await db.user.findFirst({
          where: {
            OR: [
              { email: { equals: emailCandidate, mode: 'insensitive' } },
              ...(nicknameCandidate
                ? [{ nickname: { equals: nicknameCandidate, mode: 'insensitive' as const } }]
                : []),
            ],
          },
        })
        // Erro genérico (usuário inexistente ou sem senha cadastrada) —
        // não diferenciar do caso de senha errada, evita enumeração de contas.
        if (!user?.senhaHash) {
          registrarTentativaFalha(rateKey)
          return null
        }

        const senhaValida = await bcrypt.compare(password, user.senhaHash)
        if (!senhaValida) {
          registrarTentativaFalha(rateKey)
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

      // E-mail/senha: authorize() já validou; findOrCreateUser é só OAuth.
      if (account.provider === 'credentials') {
        return Boolean(user?.id)
      }

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
        void registrarUltimoAcesso(token.sub).catch((err) => {
          console.error('[auth] registrarUltimoAcesso:', err)
        })
      }
      return session
    },

    async jwt({ token, account, user, trigger, session }) {
      // Refresh explícito via fetch('/api/auth/session', { method: 'POST', body }) —
      // usado pelo formulário de perfil após trocar avatar/nome, já que
      // session.user.image/name vêm do JWT e não são reconsultados no banco
      // a cada request (topbar usa getAvatar/getNomeAtualDoUsuario).
      if (trigger === 'update' && session && typeof session === 'object') {
        if ('image' in session) {
          token.picture = (session as { image: string | null }).image
        }
        if ('name' in session) {
          token.name = (session as { name: string | null }).name
        }
      }

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
        const googleId = account.provider === 'google' ? account.providerAccountId : undefined
        const email = user?.email?.trim().toLowerCase() || undefined

        const dbUser = await db.user.findFirst({
          where: {
            OR: [
              ...(discordId ? [{ discordId }] : []),
              ...(googleId ? [{ googleId }] : []),
              // Fallback: vinculação por e-mail em findOrCreateUser (mesmo request).
              ...(email ? [{ email }] : []),
            ],
          },
          select: { id: true },
        })

        if (dbUser) {
          token.sub = dbUser.id // UUID do banco — usado em session.user.id
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
  const extraido = extrairPerfilOAuth(account.provider, user, profile)

  // Tenta encontrar usuário existente por provider ID ou e-mail
  let existingUser = await db.user.findFirst({
    where: {
      OR: [
        ...(discordId ? [{ discordId }] : []),
        ...(googleId ? [{ googleId }] : []),
        ...(extraido.email ? [{ email: extraido.email }] : []),
      ],
    },
  })

  if (existingUser) {
    // Preenche lacunas do perfil com dados do provider; vincula IDs OAuth.
    // Não sobrescreve nome/e-mail já escolhidos pelo usuário.
    existingUser = await db.user.update({
      where: { id: existingUser.id },
      data: {
        ...(discordId && !existingUser.discordId ? { discordId } : {}),
        ...(googleId && !existingUser.googleId ? { googleId } : {}),
        ...(!existingUser.nome && extraido.nome ? { nome: extraido.nome } : {}),
        ...(!existingUser.email && extraido.email ? { email: extraido.email } : {}),
        // Avatar do provider — só sobrescreve se o usuário não tiver trocado
        // por upload próprio depois do último login (ver salvarPerfilSocial).
        ...(extraido.avatarUrl && !existingUser.avatarUrl ? { avatarUrl: extraido.avatarUrl } : {}),
      },
    })
    if (extraido.avatarUrl) revalidateTag(tagAvatarUsuario(existingUser.id), 'max')
  } else {
    existingUser = await db.user.create({
      data: {
        email: extraido.email,
        nome: extraido.nome,
        avatarUrl: extraido.avatarUrl,
        discordId: discordId ?? null,
        googleId: googleId ?? null,
      },
    })
  }

  // Mesmos campos essenciais do cadastro manual (exceto senha): tenta @ automático.
  if (!existingUser.nickname && extraido.nicknameSeeds.length > 0) {
    const nick = await tentarAtribuirNickname(existingUser.id, extraido.nicknameSeeds)
    if (nick) existingUser = { ...existingUser, nickname: nick }
  }

  return existingUser
}
