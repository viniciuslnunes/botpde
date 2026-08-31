import { revalidatePath, revalidateTag } from 'next/cache'
import { db } from '@torcida/db'
import { atualizarPerfilSocialSchema } from '@torcida/types'
import { assertMembroAtivo } from '@/lib/authz'
import { ExpectedError } from './expected-error'
import { resolverPerfilPrivadoEfetivo } from '@/lib/perfil-social'
import { isCloudinaryUrl } from '@/lib/social-embed'
import { invalidarCachesComunidadeFeed, invalidarBadgesAutorTenant } from '@/lib/comunidade-cache'
import { tagAvatarUsuario } from '@/lib/avatar-cache'

export interface PerfilSocialSalvo {
  bannerUrl: string | null
  bannerPos: number | null
  avatarUrl: string | null
  bio: string | null
  perfilPrivado: boolean
}

export async function salvarPerfilSocial(
  userId: string,
  input: unknown,
): Promise<PerfilSocialSalvo> {
  const parsed = atualizarPerfilSocialSchema.safeParse(input)
  if (!parsed.success) {
    throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Perfil inválido')
  }

  const tenant: { id: string; ativo: boolean } | null = await db.tenant.findUnique({
    where: { id: parsed.data.tenantId },
    select: { id: true, ativo: true },
  })
  if (!tenant?.ativo) throw new Error('Tenant não encontrado')

  await assertMembroAtivo(tenant.id, userId)

  const membro: { tipo: 'SOCIO' | 'TORCEDOR'; status: string } | null =
    await db.saasMembro.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId } },
      select: { tipo: true, status: true },
    })

  const usuarioAnterior = await db.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true },
  })

  const bannerUrl = parsed.data.bannerUrl ?? null
  const bannerPos = parsed.data.bannerPos ?? null
  const avatarUrl = parsed.data.avatarUrl ?? null

  if (bannerUrl && !isCloudinaryUrl(bannerUrl)) {
    throw new Error('Banner inválido')
  }
  if (avatarUrl && !isCloudinaryUrl(avatarUrl)) {
    throw new Error('Avatar inválido')
  }

  const apenasMidia = parsed.data.apenasMidia === true
  const perfilPrivadoDefault = membro?.tipo === 'SOCIO'
  const perfilPrivado = apenasMidia
    ? undefined
    : resolverPerfilPrivadoEfetivo(
        parsed.data.perfilPrivado ?? perfilPrivadoDefault,
        membro,
      )

  const saved: Omit<PerfilSocialSalvo, 'avatarUrl'> = await db.perfilMembro.upsert({
    where: { userId_tenantId: { userId, tenantId: tenant.id } },
    create: {
      userId,
      tenantId: tenant.id,
      bio: apenasMidia ? null : parsed.data.bio?.trim() || null,
      perfilPrivado: perfilPrivado ?? perfilPrivadoDefault,
      exibirCidade: apenasMidia ? false : (parsed.data.exibirCidade ?? false),
      exibirSede: apenasMidia ? false : (parsed.data.exibirSede ?? false),
      exibirDesde: apenasMidia ? true : (parsed.data.exibirDesde ?? true),
      exibirNumeroSocioNoFeed: apenasMidia
        ? true
        : (parsed.data.exibirNumeroSocioNoFeed ?? true),
      memoriaPresencaVisivel: apenasMidia
        ? false
        : (parsed.data.memoriaPresencaVisivel ?? false),
      bannerUrl,
      bannerPos,
    },
    update: apenasMidia
      ? {
          bannerUrl,
          bannerPos,
        }
      : {
          bio: parsed.data.bio?.trim() || null,
          perfilPrivado: perfilPrivado!,
          exibirCidade: parsed.data.exibirCidade ?? false,
          exibirSede: parsed.data.exibirSede ?? false,
          exibirDesde: parsed.data.exibirDesde ?? true,
          exibirNumeroSocioNoFeed: parsed.data.exibirNumeroSocioNoFeed ?? true,
          memoriaPresencaVisivel: parsed.data.memoriaPresencaVisivel ?? false,
          bannerUrl,
          bannerPos,
        },
    select: {
      bannerUrl: true,
      bannerPos: true,
      bio: true,
      perfilPrivado: true,
    },
  })

  if (bannerUrl && saved.bannerUrl !== bannerUrl) {
    throw new Error('Falha ao gravar a capa no banco. Confira se o schema está atualizado (db:push).')
  }

  // Avatar é identidade única do usuário (User.avatarUrl) — nunca por torcida.
  let avatarSalvo = usuarioAnterior?.avatarUrl ?? null
  if (avatarUrl && avatarUrl !== usuarioAnterior?.avatarUrl) {
    await db.user.update({ where: { id: userId }, data: { avatarUrl } })
    avatarSalvo = avatarUrl
    // Feed "descobrir"/sugestões e stories rings embutem avatarUrl no cache
    // (unstable_cache, 60-120s) — sem isso a foto nova só aparece lá depois
    // do TTL expirar.
    invalidarCachesComunidadeFeed(tenant.id)
    // Topbar/aside (getAvatarAtualDoUsuario) são cache sem TTL — só saem do
    // ar aqui, no evento real de troca de foto.
    revalidateTag(tagAvatarUsuario(userId), 'max')
  }

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: userId,
      acao: 'PERFIL_SOCIAL_ATUALIZADO',
      entidade: 'PerfilMembro',
      entidadeId: userId,
      detalhes: bannerUrl ? { bannerUrl: true, apenasMidia } : { apenasMidia },
    },
  })

  revalidatePath('/portal/comunidade')
  revalidatePath(`/portal/comunidade/perfil/${userId}`)
  // Preferência de nº no badge invalida o cache de autor-badges (TTL 120s).
  if (!apenasMidia) invalidarBadgesAutorTenant(tenant.id)

  return { ...saved, avatarUrl: avatarSalvo }
}
