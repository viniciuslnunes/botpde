'use server'

import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import {
  buscarTorcidasParaSelecao,
  isSuperAdminEmail,
  setTenantContextSlug,
} from '@/lib/tenant-context'
import type { TorcidaOpcao } from '@/lib/torcida-labels'
import { abrirCanalOperador } from '@/lib/operador-canais-abertos'
import { db } from '@torcida/db'
import { z } from 'zod'

const schema = z.object({
  slug: z.string().min(1),
  destino: z.enum(['admin', 'portal', 'super-admin']).optional().default('admin'),
})

export type SelecionarTorcidaState = {
  message?: string
}

export async function selecionarTorcidaAction(
  _prev: SelecionarTorcidaState,
  formData: FormData,
): Promise<SelecionarTorcidaState> {
  const session = await auth()

  if (!session?.user?.email || !isSuperAdminEmail(session.user.email)) {
    return { message: 'Acesso negado.' }
  }

  const parsed = schema.safeParse({
    slug: formData.get('slug'),
    destino: formData.get('destino') ?? 'admin',
  })

  if (!parsed.success) {
    return { message: 'Torcida inválida.' }
  }

  const { slug, destino } = parsed.data

  const tenant = await db.tenant.findFirst({
    where: { slug, ativo: true },
    select: { slug: true },
  })

  if (!tenant) {
    return { message: 'Torcida não encontrada ou inativa.' }
  }

  await setTenantContextSlug(slug)
  await abrirCanalOperador(slug)

  if (destino === 'portal') redirect('/portal/comunidade')
  if (destino === 'super-admin') redirect('/super-admin/torcidas')
  redirect('/admin')
}

const unidadeSchema = z.discriminatedUnion('modo', [
  z.object({
    modo: z.literal('sede'),
    sedeId: z.string().min(1),
    tenantSlug: z.string().min(1),
  }),
  z.object({
    modo: z.literal('tenant'),
    tenantSlug: z.string().min(1),
    destino: z.enum(['admin', 'portal']).optional().default('admin'),
  }),
])

export type SelecionarUnidadeState = {
  message?: string
  /**
   * Caso A: unidade sem portal próprio. O client abre o modal pedindo se
   * deseja ir ao admin da unidade para promover/criar.
   */
  semPortal?: { sedeId: string; nome?: string }
}

/**
 * Navega para uma unidade da worktree (super-admin):
 * - modo `tenant` (Caso B / SEDE raiz): troca `torcida_ctx` e abre `/admin` ou portal
 * - modo `sede` + destino portal + tipo SEDE: portal do próprio tenant
 * - modo `sede` + destino portal + SUBSEDE/PDE (Caso A): devolve `semPortal`
 * - modo `sede` + `confirmarAdmin=1`: só grava o cookie (client navega para a ficha)
 */
export async function selecionarUnidadeAction(
  _prev: SelecionarUnidadeState,
  formData: FormData,
): Promise<SelecionarUnidadeState> {
  const session = await auth()

  if (!session?.user?.email || !isSuperAdminEmail(session.user.email)) {
    return { message: 'Acesso negado.' }
  }

  const modoRaw = String(formData.get('modo') ?? '')
  const parsed = unidadeSchema.safeParse({
    modo: modoRaw,
    sedeId: formData.get('sedeId') || undefined,
    tenantSlug: formData.get('tenantSlug') || undefined,
    destino: formData.get('destino') || undefined,
  })

  if (!parsed.success) {
    return { message: 'Unidade inválida.' }
  }

  const data = parsed.data

  const tenant = await db.tenant.findFirst({
    where: { slug: data.tenantSlug, ativo: true },
    select: { id: true, slug: true },
  })
  if (!tenant) {
    return { message: 'Torcida da unidade não encontrada ou inativa.' }
  }

  if (data.modo === 'tenant') {
    await setTenantContextSlug(tenant.slug)
    await abrirCanalOperador(tenant.slug)
    if (data.destino === 'portal') redirect('/portal/comunidade')
    redirect('/admin')
  }

  const sede: {
    id: string
    tenantId: string | null
    nome: string
    tipo: string
  } | null = await db.sede.findUnique({
    where: { id: data.sedeId },
    select: { id: true, tenantId: true, nome: true, tipo: true },
  })
  if (!sede || sede.tenantId !== tenant.id) {
    return { message: 'Unidade não encontrada nesta torcida.' }
  }

  // Portal pedido explicitamente (botão "Ir ao portal").
  // SEDE raiz = o próprio portal do tenant — não é Caso A.
  // SUBSEDE/PDE Caso A (vivem no portal da mãe) → modal no client.
  if (String(formData.get('destino') ?? '') === 'portal') {
    if (sede.tipo === 'SEDE') {
      await setTenantContextSlug(tenant.slug)
      await abrirCanalOperador(tenant.slug)
      redirect('/portal/comunidade')
    }
    return {
      semPortal: { sedeId: sede.id, nome: sede.nome },
    }
  }

  // Pedido explícito após confirmar o modal (abrir admin da unidade).
  // Só grava o cookie — o client faz `router.push` (redirect dentro do
  // ConfirmDialog engolia NEXT_REDIRECT e o botão parecia morto).
  if (String(formData.get('confirmarAdmin') ?? '') === '1') {
    await setTenantContextSlug(tenant.slug)
    return {}
  }

  // Select de afiliação no admin: navegação usual para a ficha da unidade.
  await setTenantContextSlug(tenant.slug)
  redirect(`/admin/sedes/${sede.id}`)
}

const buscaTorcidasSchema = z.object({
  termo: z.string().max(120).optional(),
  afiliacaoId: z.string().max(64).nullable().optional(),
  recentes: z.array(z.string().max(120)).max(8).optional(),
})

/**
 * Busca sob demanda do switcher de torcida (super-admin).
 *
 * Leitura pura: sem mutação, sem `AuditLog`. O gate é o mesmo do resto do
 * super-admin — allowlist de e-mail — e vem antes de tocar no banco: sem ele a
 * action viraria um índice aberto das torcidas da plataforma.
 */
export async function buscarTorcidasParaSelecaoAction(
  input: unknown,
): Promise<TorcidaOpcao[]> {
  const session = await auth()
  if (!session?.user?.email || !isSuperAdminEmail(session.user.email)) {
    return []
  }
  const parsed = buscaTorcidasSchema.safeParse(input)
  if (!parsed.success) return []
  return buscarTorcidasParaSelecao(parsed.data)
}
