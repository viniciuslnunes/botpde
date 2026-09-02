'use server'

import { revalidatePath } from 'next/cache'
import { db, Prisma } from '@torcida/db'
import {
  AlternarMemoriaPresencaSchema,
  CriarMemoriaFatoSchema,
  CriarMemoriaMarcoSchema,
  DecidirMemoriaFatoSchema,
  PublicarMemoriaDiaSchema,
  RemoverMemoriaMarcoSchema,
  SalvarMemoriaCapituloSchema,
  MemoriaEscopoSchema,
  diaValidoParaFatoAtrasado,
  diaValidoParaPublicarMemoria,
  escoposMemoriaDoCanal,
  MEMORIA_ESCOPO,
  MEMORIA_INTENCAO,
  PERMISSIONS,
  calculateEffectivePermissions,
  hasPermission,
  interpretarEntradaMemoria,
  resolverEntradaMemoria,
  resolverEscopoMemoriaPadrao,
  type MemoriaEscopo,
} from '@torcida/types'
import { auth } from '@/lib/auth'
import { assertPermission } from '@/lib/authz'
import { ExpectedError, isExpectedError } from '@/lib/expected-error'
import { todayDateOnlyIso, parseDateOnly, startOfZonedDayUtc } from '@/lib/format-datetime'
import { notificarSafe } from '@/lib/notificacoes'
import { getActiveTenant, getUserPermissionsInTenant } from '@/lib/tenant'
import {
  resolverContextoComunidade,
  resolverEscopoComunidade,
} from '@/lib/comunidade-contexto'
import { lerEscopoComunidadePersistido } from '@/lib/comunidade-escopo-cookie'
import { buscarMemoriaNoEscopo } from './_lib/memoria-busca'
import type { MemoriaBuscaHit } from './_lib/memoria-busca'

export type MemoriaActionState = { ok?: boolean; error?: string }

export type MemoriaBuscaActionState = { hits?: MemoriaBuscaHit[]; error?: string }

export async function buscarMemoriaAction(input: {
  termo: string
  escopo: MemoriaEscopo
}): Promise<MemoriaBuscaActionState> {
  try {
    const session = await auth()
    if (!session?.user?.id) return { error: 'Entre para buscar.' }

    const escopoParsed = MemoriaEscopoSchema.safeParse(input.escopo)
    if (!escopoParsed.success) return { hits: [] }

    const ctxCom = await resolverContextoComunidade(session.user.id, session.user.email)
    if (!ctxCom) return { error: 'Sem unidade ativa.' }

    const canal = resolverEscopoComunidade(ctxCom, await lerEscopoComunidadePersistido())
    const temTorcida = Boolean(
      ctxCom.escopos.torcida &&
        (ctxCom.torcidaReal || (ctxCom.modo === 'torcida' && ctxCom.tenant)),
    )
    const escoposDisponiveis = escoposMemoriaDoCanal({ canal, temTorcida })
    if (!escoposDisponiveis.includes(escopoParsed.data)) {
      return { hits: [] }
    }

    if (escopoParsed.data === MEMORIA_ESCOPO.CLUBE) {
      if (!ctxCom.afiliacao) return { hits: [] }
      const hits = await buscarMemoriaNoEscopo({
        userId: session.user.id,
        escopo: MEMORIA_ESCOPO.CLUBE,
        termo: input.termo,
        unidadeId: '',
        afiliacaoId: ctxCom.afiliacao.id,
      })
      return { hits }
    }

    const homeTenantId =
      canal === 'unidade'
        ? (ctxCom.unidade?.tenantId ?? null)
        : (ctxCom.torcidaReal?.id ?? (ctxCom.modo === 'torcida' ? ctxCom.tenant.id : null))
    if (!homeTenantId) return { hits: [] }

    const tenant: { id: string; afiliacaoId: string | null; sintetico: boolean } | null =
      await db.tenant.findUnique({
        where: { id: homeTenantId },
        select: { id: true, afiliacaoId: true, sintetico: true },
      })
    if (!tenant || tenant.sintetico) return { hits: [] }

    const hits = await buscarMemoriaNoEscopo({
      userId: session.user.id,
      escopo: escopoParsed.data,
      termo: input.termo,
      unidadeId: tenant.id,
      afiliacaoId: tenant.afiliacaoId ?? ctxCom.afiliacao?.id ?? null,
    })
    return { hits }
  } catch (error) {
    if (isExpectedError(error)) return { error: error.message }
    throw error
  }
}

function revalidateMemoria(userId?: string) {
  revalidatePath('/portal/memoria')
  revalidatePath('/admin/comunidade/memoria')
  if (userId) revalidatePath(`/portal/comunidade/perfil/${userId}`)
}

async function tenantPortalDoUsuario() {
  const session = await auth()
  if (!session?.user?.id) throw new ExpectedError('Entre para continuar.')
  const tenant = await getActiveTenant(session.user.id, session.user.email)
  if (!tenant || tenant.sintetico) {
    throw new ExpectedError('A memória atrasada só existe na unidade, não no clube.')
  }
  return { session, tenant }
}

async function assertPodeCriarFato(userId: string, tenantId: string) {
  const membro: { tipo: 'SOCIO' | 'TORCEDOR'; status: string } | null =
    await db.saasMembro.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { tipo: true, status: true },
    })
  if (membro?.status !== 'APROVADO') {
    throw new ExpectedError('Só quem está aprovado na unidade liga um fato ao dia.')
  }
  if (membro.tipo === 'TORCEDOR') return
  const { rolePermissions, overrides } = await getUserPermissionsInTenant(userId, tenantId)
  const effective = calculateEffectivePermissions(rolePermissions, overrides)
  if (!hasPermission(effective, PERMISSIONS.COMMUNITY_POST)) {
    throw new ExpectedError('Você não tem permissão para publicar na memória.')
  }
}

export async function criarMemoriaFato(input: unknown): Promise<MemoriaActionState> {
  try {
    const parsed = CriarMemoriaFatoSchema.safeParse(input)
    if (!parsed.success) {
      throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Fato inválido')
    }
    const { session, tenant } = await tenantPortalDoUsuario()
    await assertPodeCriarFato(session.user.id, tenant.id)

    const hoje = todayDateOnlyIso()
    if (!diaValidoParaPublicarMemoria(parsed.data.dia, hoje)) {
      throw new ExpectedError(
        parsed.data.dia > hoje
          ? 'Esse dia ainda não está no calendário da memória.'
          : 'A memória só vai até 5 anos atrás.',
      )
    }
    const atrasado = diaValidoParaFatoAtrasado(parsed.data.dia, hoje)

    if (parsed.data.postId) {
      const post: { id: string; tenantId: string; oculto: boolean } | null = await db.post.findUnique({
        where: { id: parsed.data.postId },
        select: { id: true, tenantId: true, oculto: true },
      })
      if (!post || post.oculto || post.tenantId !== tenant.id) {
        throw new ExpectedError('Esse post não pode ser ligado a este dia.')
      }
    }
    if (parsed.data.eventoId) {
      const evento: { id: string; tenantId: string } | null = await db.evento.findUnique({
        where: { id: parsed.data.eventoId },
        select: { id: true, tenantId: true },
      })
      if (!evento || evento.tenantId !== tenant.id) {
        throw new ExpectedError('Esse evento não é desta unidade.')
      }
    }

    const dia = startOfZonedDayUtc(parseDateOnly(parsed.data.dia))
    const criado: { id: string } = await db.memoriaFato.create({
      data: {
        tenantId: tenant.id,
        autorId: session.user.id,
        dia,
        conteudo: parsed.data.conteudo,
        midiaUrls: parsed.data.midiaUrls,
        visibilidade: parsed.data.visibilidade,
        status: atrasado ? 'PENDENTE' : 'APROVADA',
        decididoEm: atrasado ? null : new Date(),
        postId: parsed.data.postId,
        eventoId: parsed.data.eventoId,
      },
      select: { id: true },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'MEMORIA_FATO_CRIADO',
        entidade: 'MemoriaFato',
        entidadeId: criado.id,
        detalhes: {
          dia: parsed.data.dia,
          visibilidade: parsed.data.visibilidade,
          status: atrasado ? 'PENDENTE' : 'APROVADA',
        },
      },
    })

    revalidateMemoria()
    return { ok: true }
  } catch (error) {
    if (isExpectedError(error)) return { error: error.message }
    throw error
  }
}

/** Composer único — infere marco, aniversário, relato ou dica de evento. */
export async function publicarNaMemoriaDoDia(input: unknown): Promise<MemoriaActionState> {
  try {
    const parsed = PublicarMemoriaDiaSchema.safeParse(input)
    if (!parsed.success) {
      throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Entrada inválida')
    }

    const entrada = resolverEntradaMemoria(parsed.data.texto, parsed.data.modo)

    if (entrada.intencao === MEMORIA_INTENCAO.EVENTO) {
      throw new ExpectedError(
        'Eventos, caravanas e ensaios entram pela Agenda — depois aparecem neste dia. Para um relato, descreva o que rolou.',
      )
    }

    if (
      entrada.intencao === MEMORIA_INTENCAO.MARCO ||
      entrada.intencao === MEMORIA_INTENCAO.ANIVERSARIO
    ) {
      if (!entrada.titulo?.trim()) {
        throw new ExpectedError('Escreva o título na primeira linha depois do prefixo.')
      }
      return salvarMemoriaMarco({
        dia: parsed.data.dia,
        titulo: entrada.titulo.trim(),
        descricao: entrada.descricao?.trim() || undefined,
      })
    }

    const conteudo = (entrada.conteudo ?? parsed.data.texto).trim()
    if (!conteudo && parsed.data.midiaUrls.length === 0) {
      throw new ExpectedError('Escreva algo ou anexe foto, vídeo ou link.')
    }

    return criarMemoriaFato({
      dia: parsed.data.dia,
      conteudo,
      midiaUrls: parsed.data.midiaUrls,
      visibilidade: parsed.data.visibilidade,
      eventoId: parsed.data.eventoId,
      postId: parsed.data.postId,
    })
  } catch (error) {
    if (isExpectedError(error)) return { error: error.message }
    throw error
  }
}

export async function decidirMemoriaFato(input: unknown): Promise<MemoriaActionState> {
  try {
    const parsed = DecidirMemoriaFatoSchema.safeParse(input)
    if (!parsed.success) {
      throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Decisão inválida')
    }
    if (parsed.data.decidir === 'rejeitar' && !parsed.data.motivo?.trim()) {
      throw new ExpectedError('Diga o motivo da recusa.')
    }

    const { session, tenant } = await assertPermission(PERMISSIONS.COMMUNITY_MODERATE)
    const fato: {
      id: string
      status: string
      autorId: string
      dia: Date
      tenantId: string
    } | null = await db.memoriaFato.findFirst({
      where: { id: parsed.data.id, tenantId: tenant.id },
      select: { id: true, status: true, autorId: true, dia: true, tenantId: true },
    })
    if (!fato) throw new ExpectedError('Fato não encontrado.')
    if (fato.status !== 'PENDENTE') throw new ExpectedError('Este fato já foi decidido.')

    const aprovado = parsed.data.decidir === 'aprovar'
    await db.memoriaFato.update({
      where: { id: fato.id },
      data: {
        status: aprovado ? 'APROVADA' : 'REJEITADA',
        aprovadoPorId: session.user.id,
        decididoEm: new Date(),
        motivoRejeicao: aprovado ? null : parsed.data.motivo?.trim(),
      },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: aprovado ? 'MEMORIA_FATO_APROVADO' : 'MEMORIA_FATO_REJEITADO',
        entidade: 'MemoriaFato',
        entidadeId: fato.id,
        detalhes: { motivo: parsed.data.motivo ?? null },
      },
    })

    const diaIso = fato.dia.toISOString().slice(0, 10)
    await notificarSafe({
      userId: fato.autorId,
      tenantId: tenant.id,
      tipo: 'MEMORIA_FATO_DECIDIDA',
      titulo: aprovado ? 'Sua memória foi aprovada' : 'Sua memória não entrou na linha',
      corpo: aprovado
        ? 'O fato que você ligou àquele dia agora aparece na memória da unidade.'
        : parsed.data.motivo?.trim() || 'A moderação recusou o fato.',
      link: `/portal/memoria?escopo=${MEMORIA_ESCOPO.UNIDADE}&dia=${diaIso}`,
      atorId: session.user.id,
    })

    revalidateMemoria()
    return { ok: true }
  } catch (error) {
    if (isExpectedError(error)) return { error: error.message }
    throw error
  }
}

export async function alternarMemoriaPresenca(input: unknown): Promise<MemoriaActionState> {
  try {
    const parsed = AlternarMemoriaPresencaSchema.safeParse(input)
    if (!parsed.success) {
      throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Opção inválida')
    }
    const { session, tenant } = await tenantPortalDoUsuario()

    await db.perfilMembro.upsert({
      where: { userId_tenantId: { userId: session.user.id, tenantId: tenant.id } },
      create: {
        userId: session.user.id,
        tenantId: tenant.id,
        memoriaPresencaVisivel: parsed.data.visivel,
      },
      update: { memoriaPresencaVisivel: parsed.data.visivel },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'MEMORIA_PRESENCA_ALTERADA',
        entidade: 'PerfilMembro',
        entidadeId: session.user.id,
        detalhes: { visivel: parsed.data.visivel },
      },
    })

    revalidateMemoria(session.user.id)
    return { ok: true }
  } catch (error) {
    if (isExpectedError(error)) return { error: error.message }
    throw error
  }
}

async function tenantAcervoGerencia() {
  const session = await auth()
  if (!session?.user?.id) throw new ExpectedError('Entre para continuar.')
  const { tenant } = await assertPermission(PERMISSIONS.SETTINGS_MANAGE)
  if (tenant.sintetico) {
    throw new ExpectedError('Marcos e capítulos são da unidade, não do clube.')
  }
  return { session, tenant }
}

export async function salvarMemoriaMarco(input: unknown): Promise<MemoriaActionState> {
  try {
    const parsed = CriarMemoriaMarcoSchema.safeParse(input)
    if (!parsed.success) {
      throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Marco inválido')
    }
    const { session, tenant } = await tenantAcervoGerencia()
    const dia = startOfZonedDayUtc(parseDateOnly(parsed.data.dia))
    const marco: { id: string } = await db.memoriaMarco.upsert({
      where: { tenantId_dia: { tenantId: tenant.id, dia } },
      create: {
        tenantId: tenant.id,
        autorId: session.user.id,
        dia,
        titulo: parsed.data.titulo,
        descricao: parsed.data.descricao?.trim() || null,
      },
      update: {
        titulo: parsed.data.titulo,
        descricao: parsed.data.descricao?.trim() || null,
        autorId: session.user.id,
      },
      select: { id: true },
    })
    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'MEMORIA_MARCO_SALVO',
        entidade: 'MemoriaMarco',
        entidadeId: marco.id,
        detalhes: { dia: parsed.data.dia, titulo: parsed.data.titulo },
      },
    })
    revalidateMemoria()
    return { ok: true }
  } catch (error) {
    if (isExpectedError(error)) return { error: error.message }
    throw error
  }
}

export async function removerMemoriaMarco(input: unknown): Promise<MemoriaActionState> {
  try {
    const parsed = RemoverMemoriaMarcoSchema.safeParse(input)
    if (!parsed.success) {
      throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Marco inválido')
    }
    const { session, tenant } = await tenantAcervoGerencia()
    const deleted = await db.memoriaMarco.deleteMany({
      where: { id: parsed.data.id, tenantId: tenant.id },
    })
    if (deleted.count === 0) throw new ExpectedError('Marco não encontrado.')
    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'MEMORIA_MARCO_REMOVIDO',
        entidade: 'MemoriaMarco',
        entidadeId: parsed.data.id,
      },
    })
    revalidateMemoria()
    return { ok: true }
  } catch (error) {
    if (isExpectedError(error)) return { error: error.message }
    throw error
  }
}

export async function salvarMemoriaCapitulo(input: unknown): Promise<MemoriaActionState> {
  try {
    const parsed = SalvarMemoriaCapituloSchema.safeParse(input)
    if (!parsed.success) {
      throw new ExpectedError(parsed.error.issues[0]?.message ?? 'Capítulo inválido')
    }
    const { session, tenant } = await tenantAcervoGerencia()
    const dias = [...new Set(parsed.data.dias)].map((d) => ({
      dia: startOfZonedDayUtc(parseDateOnly(d)),
    }))
    const capituloId = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const base = {
        titulo: parsed.data.titulo,
        slug: parsed.data.slug,
        descricao: parsed.data.descricao?.trim() || null,
        ativo: parsed.data.ativo,
      }
      const cap = parsed.data.id
        ? await tx.memoriaCapitulo.update({
            where: { id: parsed.data.id, tenantId: tenant.id },
            data: base,
            select: { id: true },
          })
        : await tx.memoriaCapitulo.create({
            data: { tenantId: tenant.id, ...base },
            select: { id: true },
          })
      await tx.memoriaCapituloDia.deleteMany({ where: { capituloId: cap.id } })
      if (dias.length > 0) {
        await tx.memoriaCapituloDia.createMany({
          data: dias.map((d, ordem) => ({
            capituloId: cap.id,
            dia: d.dia,
            ordem,
          })),
        })
      }
      return cap.id
    })
    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'MEMORIA_CAPITULO_SALVO',
        entidade: 'MemoriaCapitulo',
        entidadeId: capituloId,
        detalhes: { slug: parsed.data.slug, dias: parsed.data.dias.length },
      },
    })
    revalidateMemoria()
    revalidatePath('/admin/comunidade/memoria')
    return { ok: true }
  } catch (error) {
    if (isExpectedError(error)) return { error: error.message }
    throw error
  }
}

export async function removerMemoriaCapitulo(input: {
  id: string
}): Promise<MemoriaActionState> {
  try {
    if (!input?.id) throw new ExpectedError('Capítulo inválido.')
    const { session, tenant } = await tenantAcervoGerencia()
    const deleted = await db.memoriaCapitulo.deleteMany({
      where: { id: input.id, tenantId: tenant.id },
    })
    if (deleted.count === 0) throw new ExpectedError('Capítulo não encontrado.')
    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'MEMORIA_CAPITULO_REMOVIDO',
        entidade: 'MemoriaCapitulo',
        entidadeId: input.id,
      },
    })
    revalidateMemoria()
    revalidatePath('/admin/comunidade/memoria')
    return { ok: true }
  } catch (error) {
    if (isExpectedError(error)) return { error: error.message }
    throw error
  }
}
