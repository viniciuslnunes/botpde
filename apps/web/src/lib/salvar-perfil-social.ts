import { revalidatePath } from 'next/cache'
import { db } from '@torcida/db'
import { atualizarPerfilSocialSchema } from '@torcida/types'
import { assertMembroAtivo } from '@/lib/authz'
import { isCloudinaryUrl } from '@/lib/social-embed'

export async function salvarPerfilSocial(
  userId: string,
  input: unknown,
): Promise<void> {
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

  if (parsed.data.bannerUrl && !isCloudinaryUrl(parsed.data.bannerUrl)) {
    throw new Error('Banner inválido')
  }
  if (parsed.data.avatarUrl && !isCloudinaryUrl(parsed.data.avatarUrl)) {
    throw new Error('Avatar inválido')
  }

  await db.perfilMembro.upsert({
    where: { userId_tenantId: { userId, tenantId: tenant.id } },
    create: {
      userId,
      tenantId: tenant.id,
      bio: parsed.data.bio?.trim() || null,
      perfilPrivado: parsed.data.perfilPrivado,
      exibirCidade: parsed.data.exibirCidade,
      exibirSede: parsed.data.exibirSede,
      exibirDesde: parsed.data.exibirDesde,
      bannerUrl: parsed.data.bannerUrl ?? null,
      bannerPos: parsed.data.bannerPos ?? null,
      avatarUrl: parsed.data.avatarUrl ?? null,
    },
    update: {
      bio: parsed.data.bio?.trim() || null,
      perfilPrivado: parsed.data.perfilPrivado,
      exibirCidade: parsed.data.exibirCidade,
      exibirSede: parsed.data.exibirSede,
      exibirDesde: parsed.data.exibirDesde,
      bannerUrl: parsed.data.bannerUrl ?? null,
      bannerPos: parsed.data.bannerPos ?? null,
      avatarUrl: parsed.data.avatarUrl ?? null,
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: userId,
      acao: 'PERFIL_SOCIAL_ATUALIZADO',
      entidade: 'PerfilMembro',
      entidadeId: userId,
    },
  })

  revalidatePath('/portal/comunidade')
  revalidatePath(`/portal/comunidade/perfil/${userId}`)
}
