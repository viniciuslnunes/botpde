import { revalidatePath } from 'next/cache'
import { db } from '@torcida/db'
import { atualizarPerfilSocialSchema } from '@torcida/types'
import { assertMembroAtivo } from '@/lib/authz'
import { resolverPerfilPrivadoEfetivo } from '@/lib/perfil-social'
import { isCloudinaryUrl } from '@/lib/social-embed'

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
    throw new Error(parsed.error.issues[0]?.message ?? 'Perfil inválido')
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
  const perfilPrivado = resolverPerfilPrivadoEfetivo(parsed.data.perfilPrivado, membro)

  const bannerUrl = parsed.data.bannerUrl ?? null
  const bannerPos = parsed.data.bannerPos ?? null
  const avatarUrl = parsed.data.avatarUrl ?? null

  if (bannerUrl && !isCloudinaryUrl(bannerUrl)) {
    throw new Error('Banner inválido')
  }
  if (avatarUrl && !isCloudinaryUrl(avatarUrl)) {
    throw new Error('Avatar inválido')
  }

  const saved: PerfilSocialSalvo = await db.perfilMembro.upsert({
    where: { userId_tenantId: { userId, tenantId: tenant.id } },
    create: {
      userId,
      tenantId: tenant.id,
      bio: parsed.data.bio?.trim() || null,
      perfilPrivado,
      exibirCidade: parsed.data.exibirCidade,
      exibirSede: parsed.data.exibirSede,
      exibirDesde: parsed.data.exibirDesde,
      bannerUrl,
      bannerPos,
      avatarUrl,
    },
    update: {
      bio: parsed.data.bio?.trim() || null,
      perfilPrivado,
      exibirCidade: parsed.data.exibirCidade,
      exibirSede: parsed.data.exibirSede,
      exibirDesde: parsed.data.exibirDesde,
      bannerUrl,
      bannerPos,
      avatarUrl,
    },
    select: {
      bannerUrl: true,
      bannerPos: true,
      avatarUrl: true,
      bio: true,
      perfilPrivado: true,
    },
  })

  if (bannerUrl && saved.bannerUrl !== bannerUrl) {
    throw new Error('Falha ao gravar a capa no banco. Confira se o schema está atualizado (db:push).')
  }

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: userId,
      acao: 'PERFIL_SOCIAL_ATUALIZADO',
      entidade: 'PerfilMembro',
      entidadeId: userId,
      detalhes: bannerUrl ? { bannerUrl: true } : undefined,
    },
  })

  revalidatePath('/portal/comunidade')
  revalidatePath(`/portal/comunidade/perfil/${userId}`)

  return saved
}
