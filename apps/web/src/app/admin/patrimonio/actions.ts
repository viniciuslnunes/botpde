'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@torcida/db'
import type { Prisma } from '@torcida/db'
import {
  AtualizarPatrimonioItemSchema,
  CriarPatrimonioItemSchema,
  nomesPecasPatrimonio,
  patrimonioEhPecaUnica,
} from '@torcida/types'
import {
  assertAcervoEscrita,
  assertPodeGerirItem,
  garantirCategoriaPermitida,
} from '@/lib/patrimonio-authz'
import { isExpectedError } from '@/lib/expected-error'
import { invalidateAdminDirecao } from '@/lib/admin-direcao-cache'
import { notificarSafe, reconciliarNotificacoesDoEvento } from '@/lib/notificacoes'
import { expandirLoteBandeira } from '@/lib/patrimonio'

export type PatrimonioState = {
  ok?: boolean
  error?: string
  errors?: Record<string, string[]>
}

function hrefNotificacaoResponsavelAcervo(categoria: string, itemId: string): string {
  const base =
    categoria === 'BANDEIRA'
      ? '/portal/departamentos/bandeiras'
      : '/portal/departamentos/patrimonio'
  return `${base}?item=${itemId}`
}

function linksNotificacaoResponsavelAcervo(itemId: string): string[] {
  return [
    `/portal/departamentos/bandeiras?item=${itemId}`,
    `/portal/departamentos/patrimonio?item=${itemId}`,
    '/portal/departamentos/bandeiras',
    '/portal/departamentos/patrimonio',
    '/portal/patrimonio',
  ]
}

function revalidatePatrimonio(tenantId: string) {
  revalidatePath('/admin/patrimonio')
  revalidatePath('/admin/bandeiras')
  revalidatePath('/admin/bateria')
  revalidatePath('/portal/patrimonio')
  revalidatePath('/portal/departamentos/patrimonio')
  revalidatePath('/portal/departamentos/bandeiras')
  revalidatePath('/portal/departamentos', 'layout')
  invalidateAdminDirecao(tenantId)
}

/**
 * Recusa de escopo (`flags:manage` fora de BANDEIRA) é regra de negócio: vira
 * mensagem no formulário, não exceção não tratada.
 */
function comoEstado(error: unknown): PatrimonioState {
  if (isExpectedError(error)) return { error: error.message }
  throw error
}

function formToPayload(formData: FormData) {
  return {
    nome: formData.get('nome'),
    categoria: formData.get('categoria'),
    status: formData.get('status') || 'DISPONIVEL',
    quantidade: formData.get('quantidade') || '1',
    localizacao: formData.get('localizacao') ?? undefined,
    valorEstimado: formData.get('valorEstimado') ?? undefined,
    observacao: formData.get('observacao') ?? undefined,
    fotoUrl: formData.get('fotoUrl') ?? undefined,
    responsavelId: formData.get('responsavelId') ?? undefined,
  }
}

async function assertResponsavelNoTenant(
  tenantId: string,
  responsavelId: string | undefined,
): Promise<string | null> {
  if (!responsavelId) return null
  const membro: { id: string } | null = await db.saasMembro.findFirst({
    where: { tenantId, userId: responsavelId, status: 'APROVADO' },
    select: { id: true },
  })
  if (!membro) return 'Responsável precisa ser membro aprovado desta torcida'
  return null
}

export async function criarPatrimonioItem(
  _prev: PatrimonioState,
  formData: FormData,
): Promise<PatrimonioState> {
  const authz = await assertAcervoEscrita()
  const { session, tenant } = authz

  const parsed = CriarPatrimonioItemSchema.safeParse(formToPayload(formData))
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const data = parsed.data
  try {
    garantirCategoriaPermitida(authz, data.categoria)
  } catch (error) {
    return comoEstado(error)
  }

  const respErr = await assertResponsavelNoTenant(tenant.id, data.responsavelId)
  if (respErr) return { errors: { responsavelId: [respErr] } }

  const pecas: string[] =
    patrimonioEhPecaUnica(data.categoria) && data.quantidade > 1
      ? nomesPecasPatrimonio(data.nome, data.quantidade)
      : [data.nome]
  const ids: string[] = pecas.map(() => crypto.randomUUID())
  const criadoPorId = session.user.id!
  await db.patrimonioItem.createMany({
    data: pecas.map((nome, i) => ({
      id: ids[i],
      tenantId: tenant.id,
      nome,
      categoria: data.categoria,
      status: data.status,
      quantidade: patrimonioEhPecaUnica(data.categoria) ? 1 : data.quantidade,
      localizacao: data.localizacao ?? null,
      valorEstimado: data.valorEstimado ?? null,
      observacao: data.observacao ?? null,
      fotoUrl: data.fotoUrl ?? null,
      responsavelId: data.responsavelId ?? null,
      criadoPorId,
    })),
  })
  const createdId = ids[0]!

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'PATRIMONIO_ITEM_CRIADO',
      entidade: 'PatrimonioItem',
      entidadeId: createdId,
      detalhes: {
        nome: data.nome,
        categoria: data.categoria,
        status: data.status,
        pecas: pecas.length,
      },
    },
  })

  if (data.responsavelId) {
    const rotulo =
      pecas.length > 1 ? `${pecas.length} peças de "${data.nome}"` : `"${data.nome}"`
    await notificarSafe({
      userId: data.responsavelId,
      tenantId: tenant.id,
      tipo: 'PATRIMONIO_RESPONSAVEL_DEFINIDO',
      titulo: 'Você é responsável por um item de patrimônio',
      corpo: `Você agora é responsável por ${rotulo}.`,
      link: hrefNotificacaoResponsavelAcervo(data.categoria, createdId),
      atorId: session.user.id,
    })
  }

  revalidatePatrimonio(tenant.id)
  return { ok: true }
}

export async function editarPatrimonioItem(
  _prev: PatrimonioState,
  formData: FormData,
): Promise<PatrimonioState> {
  const authz = await assertAcervoEscrita()
  const { session, tenant } = authz

  const parsed = AtualizarPatrimonioItemSchema.safeParse({
    id: formData.get('id'),
    ...formToPayload(formData),
  })
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const data = parsed.data
  const existente: {
    id: string
    tenantId: string
    responsavelId: string | null
    nome: string
    categoria: 'INSTRUMENTO' | 'BANDEIRA' | 'UNIFORME' | 'MOBILIARIO' | 'ELETRONICO' | 'ESPACO' | 'OUTROS'
    quantidade: number
    status: 'DISPONIVEL' | 'EM_USO' | 'MANUTENCAO' | 'BAIXADO'
    localizacao: string | null
    valorEstimado: Prisma.Decimal | null
    observacao: string | null
    fotoUrl: string | null
    meta: Prisma.JsonValue | null
    areaId: string | null
    criadoPorId: string
  } | null = await db.patrimonioItem.findFirst({
    where: { id: data.id, tenantId: tenant.id },
    select: {
      id: true,
      tenantId: true,
      responsavelId: true,
      nome: true,
      categoria: true,
      quantidade: true,
      status: true,
      localizacao: true,
      valorEstimado: true,
      observacao: true,
      fotoUrl: true,
      meta: true,
      areaId: true,
      criadoPorId: true,
    },
  })
  if (!existente) return { error: 'Item não encontrado' }

  // Duas checagens: a categoria de onde o item está e a de destino. Sem a
  // segunda, `flags:manage` reclassificaria um bandeirão como MOBILIARIO e
  // ficaria com um item fora do próprio escopo.
  try {
    garantirCategoriaPermitida(authz, existente.categoria)
    garantirCategoriaPermitida(authz, data.categoria)
  } catch (error) {
    return comoEstado(error)
  }

  const respErr = await assertResponsavelNoTenant(tenant.id, data.responsavelId)
  if (respErr) return { errors: { responsavelId: [respErr] } }

  const quantidadeGravada = patrimonioEhPecaUnica(data.categoria) ? 1 : data.quantidade
  let pecasExpandidas = 0
  if (patrimonioEhPecaUnica(data.categoria) && existente.quantidade > 1) {
    const { criados } = await expandirLoteBandeira(db, {
      ...existente,
      nome: data.nome,
      categoria: data.categoria,
    })
    pecasExpandidas = criados
  }

  await db.patrimonioItem.update({
    where: { id: existente.id },
    data: {
      nome:
        pecasExpandidas > 0
          ? nomesPecasPatrimonio(data.nome, existente.quantidade)[0]
          : data.nome,
      categoria: data.categoria,
      status: data.status,
      quantidade: quantidadeGravada,
      localizacao: data.localizacao ?? null,
      valorEstimado: data.valorEstimado ?? null,
      observacao: data.observacao ?? null,
      fotoUrl: data.fotoUrl ?? null,
      responsavelId: data.responsavelId ?? null,
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'PATRIMONIO_ITEM_EDITADO',
      entidade: 'PatrimonioItem',
      entidadeId: existente.id,
      detalhes: {
        nome: data.nome,
        categoria: data.categoria,
        status: data.status,
        ...(pecasExpandidas > 0 ? { pecasExpandidas: pecasExpandidas + 1 } : {}),
      },
    },
  })

  if (existente.responsavelId && existente.responsavelId !== data.responsavelId) {
    await reconciliarNotificacoesDoEvento(tenant.id, {
      tipo: 'PATRIMONIO_RESPONSAVEL_DEFINIDO',
      userId: existente.responsavelId,
      links: linksNotificacaoResponsavelAcervo(existente.id),
    })
  }

  if (data.responsavelId && data.responsavelId !== existente.responsavelId) {
    await notificarSafe({
      userId: data.responsavelId,
      tenantId: tenant.id,
      tipo: 'PATRIMONIO_RESPONSAVEL_DEFINIDO',
      titulo: 'Você é responsável por um item de patrimônio',
      corpo: `Você agora é responsável por "${data.nome}".`,
      link: hrefNotificacaoResponsavelAcervo(data.categoria, existente.id),
      atorId: session.user.id,
    })
  }

  revalidatePatrimonio(tenant.id)
  return { ok: true }
}

export async function baixarPatrimonioItem(itemId: string): Promise<PatrimonioState> {
  let session: Awaited<ReturnType<typeof assertPodeGerirItem>>['session']
  let tenant: Awaited<ReturnType<typeof assertPodeGerirItem>>['tenant']
  try {
    ;({ session, tenant } = await assertPodeGerirItem(itemId))
  } catch (error) {
    return comoEstado(error)
  }

  const existente: {
    id: string
    nome: string
    categoria: string
    status: string
    quantidade: number
    localizacao: string | null
  } | null = await db.patrimonioItem.findFirst({
    where: { id: itemId, tenantId: tenant.id },
    select: {
      id: true,
      nome: true,
      categoria: true,
      status: true,
      quantidade: true,
      localizacao: true,
    },
  })
  if (!existente) return { error: 'Item não encontrado' }
  if (existente.status === 'BAIXADO') return { ok: true }

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.patrimonioItem.update({
      where: { id: existente.id },
      data: { status: 'BAIXADO' },
    })
    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'PATRIMONIO_ITEM_BAIXADO',
        entidade: 'PatrimonioItem',
        entidadeId: existente.id,
        detalhes: {
          nome: existente.nome,
          categoria: existente.categoria,
          status: existente.status,
          quantidade: existente.quantidade,
          localizacao: existente.localizacao,
        },
      },
    })
  })

  revalidatePatrimonio(tenant.id)
  return { ok: true }
}

export async function excluirPatrimonioItem(itemId: string): Promise<PatrimonioState> {
  let session: Awaited<ReturnType<typeof assertPodeGerirItem>>['session']
  let tenant: Awaited<ReturnType<typeof assertPodeGerirItem>>['tenant']
  try {
    ;({ session, tenant } = await assertPodeGerirItem(itemId))
  } catch (error) {
    return comoEstado(error)
  }

  const existente: {
    id: string
    nome: string
    categoria: string
    status: string
    quantidade: number
    localizacao: string | null
  } | null = await db.patrimonioItem.findFirst({
    where: { id: itemId, tenantId: tenant.id },
    select: {
      id: true,
      nome: true,
      categoria: true,
      status: true,
      quantidade: true,
      localizacao: true,
    },
  })
  if (!existente) return { error: 'Item não encontrado' }

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.patrimonioItem.delete({ where: { id: existente.id } })
    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'PATRIMONIO_ITEM_EXCLUIDO',
        entidade: 'PatrimonioItem',
        entidadeId: existente.id,
        detalhes: {
          nome: existente.nome,
          categoria: existente.categoria,
          status: existente.status,
          quantidade: existente.quantidade,
          localizacao: existente.localizacao,
        },
      },
    })
  })

  revalidatePatrimonio(tenant.id)
  return { ok: true }
}
