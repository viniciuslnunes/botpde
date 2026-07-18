import { candidatosNickname, nicknameSchema, sugerirNickname } from '@torcida/types'

export type PerfilOAuthExtraido = {
  email: string | null
  nome: string | null
  avatarUrl: string | null
  /** Candidatos de @ em ordem de preferência (handle do provider → nome → e-mail). */
  nicknameSeeds: string[]
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  return t.length > 0 ? t : null
}

/** Parte local do e-mail como semente de @ (ex.: mano.beico@gmail → mano_beico). */
export function seedNicknameDoEmail(email: string | null | undefined): string {
  if (!email) return ''
  const local = email.split('@')[0] ?? ''
  return sugerirNickname(local)
}

/**
 * Normaliza um handle bruto do provider (Discord username, etc.) para o formato
 * do nosso @. Retorna '' se inválido após sanitização.
 */
export function seedNicknameDoHandle(handle: string | null | undefined): string {
  if (!handle) return ''
  const direto = nicknameSchema.safeParse(handle)
  if (direto.success) return direto.data
  return sugerirNickname(handle)
}

/**
 * Extrai e-mail, nome, avatar e sementes de @ a partir do payload NextAuth.
 * Reaproveita ao máximo Discord (username / global_name) e Google (name / email).
 */
export function extrairPerfilOAuth(
  provider: string,
  user: { email?: string | null; name?: string | null; image?: string | null },
  profile: Record<string, unknown> = {},
): PerfilOAuthExtraido {
  const email = asString(user.email) ?? asString(profile.email)
  const avatarUrl = asString(user.image) ?? asString(profile.picture) ?? asString(profile.image_url)

  let nome: string | null = asString(user.name)
  const seeds: string[] = []
  const pushSeed = (raw: string) => {
    if (raw && !seeds.includes(raw)) seeds.push(raw)
  }

  if (provider === 'discord') {
    const username = asString(profile.username)
    const globalName = asString(profile.global_name)
    // Display: global_name (novo Discord) → name do NextAuth → username.
    nome = globalName ?? nome ?? username
    pushSeed(seedNicknameDoHandle(username))
    pushSeed(sugerirNickname(globalName ?? ''))
  } else if (provider === 'google') {
    const given = asString(profile.given_name)
    const family = asString(profile.family_name)
    const fullFromParts =
      given && family ? `${given} ${family}` : given ?? family
    nome = nome ?? fullFromParts
    pushSeed(sugerirNickname(given ?? ''))
    pushSeed(sugerirNickname(nome ?? ''))
  } else {
    pushSeed(sugerirNickname(nome ?? ''))
  }

  pushSeed(sugerirNickname(nome ?? ''))
  pushSeed(seedNicknameDoEmail(email))

  return {
    email: email ? email.toLowerCase() : null,
    nome,
    avatarUrl,
    nicknameSeeds: seeds.filter(Boolean),
  }
}

/**
 * Lista de @ para sugerir na UI pós-OAuth: seeds do provider + variantes numéricas.
 */
export function candidatosNicknameOAuth(
  seeds: string[],
  nome: string | null | undefined,
  email: string | null | undefined,
  max = 24,
): string[] {
  const bases = [
    ...seeds,
    sugerirNickname(nome ?? ''),
    seedNicknameDoEmail(email),
  ].filter(Boolean)

  const out: string[] = []
  for (const base of bases) {
    for (const c of candidatosNickname(base, max)) {
      if (!out.includes(c)) out.push(c)
      if (out.length >= max) return out
    }
  }
  return out
}
