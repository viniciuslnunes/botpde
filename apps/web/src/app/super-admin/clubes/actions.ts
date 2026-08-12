'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@torcida/db'
import {
  ClubeSchema,
  bloqueiosExclusaoClube,
  slugClube,
} from '@torcida/types'
import { auth } from '@/lib/auth'
import { superAdminEmails } from '@/lib/env'
import { invalidateTorcidasSelecaoCache } from '@/lib/tenant-context'
import {
  carregarUnidadesDaTorcida,
  invalidarMetricasClubes,
  type UnidadeDaTorcida,
} from '@/lib/super-admin/clubes-metricas'

/**
 * CRUD do catálogo de clubes (`Afiliacao`). Entidade GLOBAL: não passa por
 * `assertPermission` (que é por tenant) — o gate é a allowlist de super-admin,
 * como no resto de `/super-admin`.
 *
 * Toda escrita grava `AuditLog` com `tenantId: null` (ação de plataforma) e
 * invalida os caches de seleção de clube — sem isso o switcher e o onboarding
 * ficariam até 5 min servindo o catálogo velho.
 */

export interface ResultadoAcao {
  ok: boolean
  erro?: string
  /** Erros por campo, para o formulário destacar sem perder o que foi digitado. */
  campos?: Record<string, string>
  clubeId?: string
}

async function exigirSuperAdmin() {
  const session = await auth()
  if (!session?.user?.id || !session.user.email || !superAdminEmails.includes(session.user.email)) {
    throw new Error('Acesso negado.')
  }
  return session
}

function erroDeCampos(erro: z.ZodError): Record<string, string> {
  const campos: Record<string, string> = {}
  for (const issue of erro.issues) {
    const chave = issue.path.join('.') || 'form'
    if (!campos[chave]) campos[chave] = issue.message
  }
  return campos
}

/** Revalida as superfícies que leem o catálogo depois de qualquer escrita. */
function propagarCatalogo(clubeId?: string): void {
  invalidateTorcidasSelecaoCache()
  invalidarMetricasClubes()
  revalidatePath('/super-admin/clubes')
  revalidatePath('/super-admin/clubes/metricas')
  revalidatePath('/super-admin/clubes/qualidade')
  if (clubeId) revalidatePath(`/super-admin/clubes/${clubeId}`)
}

async function registrarAuditoria(
  atorId: string,
  acao: string,
  clubeId: string,
  detalhes: Record<string, unknown>,
): Promise<void> {
  await db.auditLog.create({
    data: {
      // Clube é global — a ação é da plataforma, não de uma torcida.
      tenantId: null,
      atorId,
      acao,
      entidade: 'Afiliacao',
      entidadeId: clubeId,
      detalhes,
    },
  })
}

/** Campos do form em objeto tipado, com os vazios já normalizados para `undefined`. */
function lerFormulario(fd: FormData) {
  const texto = (chave: string): string | undefined => {
    const valor = fd.get(chave)
    if (typeof valor !== 'string') return undefined
    const t = valor.trim()
    return t === '' ? undefined : t
  }
  const numero = fd.get('torcedoresEstimados')
  const estimados =
    typeof numero === 'string' && numero.trim() !== ''
      ? Number(numero.replace(/\D/g, ''))
      : null

  const nome = texto('nome') ?? ''
  const estado = texto('estado') ?? ''

  return {
    nome,
    apelido: texto('apelido'),
    // Slug em branco = "gere para mim" — é o caminho normal do cadastro novo.
    slug: texto('slug') ?? slugClube(nome, estado),
    serie: texto('serie') ?? 'OUTRA',
    estado,
    cidade: texto('cidade'),
    escudoUrl: texto('escudoUrl'),
    apiExternalId: texto('apiExternalId'),
    torcedoresEstimados: Number.isFinite(estimados) ? estimados : null,
    torcedoresEstimadosFonte: texto('torcedoresEstimadosFonte'),
    torcedoresEstimadosTipo: texto('torcedoresEstimadosTipo'),
  }
}

/** Slug é chave pública (embeds Sofascore) — colisão vira erro de campo, não 500. */
async function slugEmUso(slug: string, ignorarId?: string): Promise<boolean> {
  const existente: { id: string } | null = await db.afiliacao.findFirst({
    where: { slug, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
    select: { id: true },
  })
  return existente !== null
}

export async function criarClubeAction(fd: FormData): Promise<ResultadoAcao> {
  const session = await exigirSuperAdmin()

  const parsed = ClubeSchema.safeParse(lerFormulario(fd))
  if (!parsed.success) return { ok: false, erro: 'Revise os campos.', campos: erroDeCampos(parsed.error) }
  const dados = parsed.data

  if (await slugEmUso(dados.slug)) {
    return { ok: false, erro: 'Slug já usado.', campos: { slug: 'Já existe um clube com este slug.' } }
  }

  const criado: { id: string } = await db.afiliacao.create({
    data: {
      nome: dados.nome,
      apelido: dados.apelido ?? null,
      slug: dados.slug,
      serie: dados.serie,
      estado: dados.estado,
      cidade: dados.cidade ?? null,
      escudoUrl: dados.escudoUrl ?? null,
      apiExternalId: dados.apiExternalId ?? null,
      torcedoresEstimados: dados.torcedoresEstimados ?? null,
      torcedoresEstimadosFonte: dados.torcedoresEstimadosFonte ?? null,
      torcedoresEstimadosTipo: dados.torcedoresEstimadosTipo ?? null,
      ativo: true,
    },
    select: { id: true },
  })

  await registrarAuditoria(session.user.id!, 'CLUBE_CRIADO', criado.id, {
    nome: dados.nome,
    slug: dados.slug,
    serie: dados.serie,
    estado: dados.estado,
  })
  propagarCatalogo(criado.id)
  return { ok: true, clubeId: criado.id }
}

const CAMPOS_DIFF = [
  'nome',
  'apelido',
  'slug',
  'serie',
  'estado',
  'cidade',
  'escudoUrl',
  'apiExternalId',
  'torcedoresEstimados',
  'torcedoresEstimadosFonte',
  'torcedoresEstimadosTipo',
] as const

type CampoDiff = (typeof CAMPOS_DIFF)[number]
type ClubeDiff = Record<CampoDiff, string | number | null>

/** Diff campo a campo — o log precisa dizer o que mudou, não só que mudou. */
function diffClube(antes: ClubeDiff, depois: ClubeDiff) {
  const mudancas: Record<string, { de: unknown; para: unknown }> = {}
  for (const campo of CAMPOS_DIFF) {
    const de = antes[campo] ?? null
    const para = depois[campo] ?? null
    if (de !== para) mudancas[campo] = { de, para }
  }
  return mudancas
}

export async function atualizarClubeAction(fd: FormData): Promise<ResultadoAcao> {
  const session = await exigirSuperAdmin()

  const id = typeof fd.get('id') === 'string' ? String(fd.get('id')) : ''
  if (!z.string().uuid().safeParse(id).success) return { ok: false, erro: 'Clube inválido.' }

  const parsed = ClubeSchema.safeParse(lerFormulario(fd))
  if (!parsed.success) return { ok: false, erro: 'Revise os campos.', campos: erroDeCampos(parsed.error) }
  const dados = parsed.data

  const atual: (ClubeDiff & { id: string }) | null = await db.afiliacao.findUnique({
    where: { id },
    select: {
      id: true,
      nome: true,
      apelido: true,
      slug: true,
      serie: true,
      estado: true,
      cidade: true,
      escudoUrl: true,
      apiExternalId: true,
      torcedoresEstimados: true,
      torcedoresEstimadosFonte: true,
      torcedoresEstimadosTipo: true,
    },
  })
  if (!atual) return { ok: false, erro: 'Clube não encontrado.' }

  if (await slugEmUso(dados.slug, id)) {
    return { ok: false, erro: 'Slug já usado.', campos: { slug: 'Já existe um clube com este slug.' } }
  }

  const depois: ClubeDiff = {
    nome: dados.nome,
    apelido: dados.apelido ?? null,
    slug: dados.slug,
    serie: dados.serie,
    estado: dados.estado,
    cidade: dados.cidade ?? null,
    escudoUrl: dados.escudoUrl ?? null,
    apiExternalId: dados.apiExternalId ?? null,
    torcedoresEstimados: dados.torcedoresEstimados ?? null,
    torcedoresEstimadosFonte: dados.torcedoresEstimadosFonte ?? null,
    torcedoresEstimadosTipo: dados.torcedoresEstimadosTipo ?? null,
  }
  const mudancas = diffClube(atual, depois)
  if (Object.keys(mudancas).length === 0) return { ok: true, clubeId: id }

  await db.afiliacao.update({ where: { id }, data: depois })
  await registrarAuditoria(session.user.id!, 'CLUBE_ATUALIZADO', id, { mudancas })
  propagarCatalogo(id)
  return { ok: true, clubeId: id }
}

export async function alternarSituacaoClubeAction(
  id: string,
  ativo: boolean,
): Promise<ResultadoAcao> {
  const session = await exigirSuperAdmin()
  if (!z.string().uuid().safeParse(id).success) return { ok: false, erro: 'Clube inválido.' }

  const clube: { id: string; nome: string; ativo: boolean } | null = await db.afiliacao.findUnique({
    where: { id },
    select: { id: true, nome: true, ativo: true },
  })
  if (!clube) return { ok: false, erro: 'Clube não encontrado.' }
  if (clube.ativo === ativo) return { ok: true, clubeId: id }

  await db.afiliacao.update({ where: { id }, data: { ativo } })
  await registrarAuditoria(session.user.id!, ativo ? 'CLUBE_REATIVADO' : 'CLUBE_ARQUIVADO', id, {
    nome: clube.nome,
  })
  propagarCatalogo(id)
  return { ok: true, clubeId: id }
}

/**
 * Exclusão definitiva. Só passa com TODOS os vínculos zerados: `Partida` e
 * `Noticia` têm `onDelete: Cascade` na afiliação, então apagar um clube com
 * histórico apagaria os jogos e as notícias junto, em silêncio. Com qualquer
 * vínculo, o caminho é arquivar.
 */
export async function excluirClubeAction(
  id: string,
  confirmacaoNome: string,
): Promise<ResultadoAcao> {
  const session = await exigirSuperAdmin()
  if (!z.string().uuid().safeParse(id).success) return { ok: false, erro: 'Clube inválido.' }

  const clube = await db.afiliacao.findUnique({
    where: { id },
    select: {
      id: true,
      nome: true,
      _count: {
        select: {
          tenants: true,
          torcedores: true,
          partidas: true,
          noticias: true,
          rivalClubeA: true,
          rivalClubeB: true,
          torcidasConhecidas: true,
        },
      },
    },
  })
  if (!clube) return { ok: false, erro: 'Clube não encontrado.' }

  if (confirmacaoNome.trim().toLowerCase() !== clube.nome.trim().toLowerCase()) {
    return { ok: false, erro: 'Digite o nome exato do clube para confirmar.' }
  }

  const { podeExcluir, bloqueios } = bloqueiosExclusaoClube({
    tenants: clube._count.tenants,
    torcedores: clube._count.torcedores,
    partidas: clube._count.partidas,
    noticias: clube._count.noticias,
    rivalidades: clube._count.rivalClubeA + clube._count.rivalClubeB,
    torcidasConhecidas: clube._count.torcidasConhecidas,
  })
  if (!podeExcluir) {
    const lista = bloqueios.map((b) => `${b.total} ${b.label}`).join(', ')
    return { ok: false, erro: `Clube com vínculos (${lista}). Arquive em vez de excluir.` }
  }

  await db.afiliacao.delete({ where: { id } })
  await registrarAuditoria(session.user.id!, 'CLUBE_EXCLUIDO', id, { nome: clube.nome })
  propagarCatalogo()
  return { ok: true }
}

export interface ClubeSugestao {
  id: string
  nome: string
  estado: string | null
  escudoUrl: string | null
}

/**
 * Typeahead do seletor de rival. Sempre com `take` — o catálogo é nacional e
 * carregá-lo inteiro no cliente para um combobox seria o oposto do que a
 * listagem paginada resolve.
 */
export async function buscarClubesAction(
  termo: string,
  excluirId?: string,
): Promise<ClubeSugestao[]> {
  await exigirSuperAdmin()
  const q = termo.trim()
  if (q.length < 2) return []

  return db.afiliacao.findMany({
    where: {
      AND: [
        excluirId ? { id: { not: excluirId } } : {},
        {
          OR: [
            { nome: { contains: q, mode: 'insensitive' } },
            { apelido: { contains: q, mode: 'insensitive' } },
            { slug: { contains: q, mode: 'insensitive' } },
          ],
        },
      ],
    },
    select: { id: true, nome: true, estado: true, escudoUrl: true },
    orderBy: { nome: 'asc' },
    take: 10,
  })
}

/**
 * Rivalidade é simétrica e o par é `@@unique([afiliacaoAId, afiliacaoBId])` —
 * gravar sempre com os ids ordenados evita cadastrar A↔B e B↔A como duas linhas.
 */
function parOrdenado(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

export async function alternarRivalidadeAction(
  clubeId: string,
  rivalId: string,
  adicionar: boolean,
): Promise<ResultadoAcao> {
  const session = await exigirSuperAdmin()
  const idsOk =
    z.string().uuid().safeParse(clubeId).success && z.string().uuid().safeParse(rivalId).success
  if (!idsOk) return { ok: false, erro: 'Clube inválido.' }
  if (clubeId === rivalId) return { ok: false, erro: 'Um clube não rivaliza consigo mesmo.' }

  const [aId, bId] = parOrdenado(clubeId, rivalId)

  if (adicionar) {
    const existentes: number = await db.afiliacao.count({ where: { id: { in: [aId, bId] } } })
    if (existentes !== 2) return { ok: false, erro: 'Clube não encontrado.' }
    // Par já cadastrado não é erro para o operador — o estado final é o mesmo.
    await db.rivalidadeClube.upsert({
      where: { afiliacaoAId_afiliacaoBId: { afiliacaoAId: aId, afiliacaoBId: bId } },
      create: { afiliacaoAId: aId, afiliacaoBId: bId },
      update: {},
    })
  } else {
    await db.rivalidadeClube.deleteMany({ where: { afiliacaoAId: aId, afiliacaoBId: bId } })
  }

  await registrarAuditoria(
    session.user.id!,
    adicionar ? 'CLUBE_RIVALIDADE_ADICIONADA' : 'CLUBE_RIVALIDADE_REMOVIDA',
    clubeId,
    { rivalId },
  )
  propagarCatalogo(clubeId)
  return { ok: true, clubeId }
}

export type UnidadeTorcidaView = UnidadeDaTorcida

export type CarregarUnidadesTorcidaResult =
  | { ok: true; unidades: UnidadeTorcidaView[] }
  | { ok: false; erro: string }

/** Unidades (Caso A + portais Caso B) de uma torcida-raiz — lazy no painel de métricas. */
export async function carregarUnidadesTorcidaAction(
  torcidaId: string,
): Promise<CarregarUnidadesTorcidaResult> {
  try {
    await exigirSuperAdmin()
  } catch {
    return { ok: false, erro: 'Acesso negado.' }
  }

  const id = typeof torcidaId === 'string' ? torcidaId.trim() : ''
  if (!id) return { ok: false, erro: 'Torcida inválida.' }

  const unidades: UnidadeDaTorcida[] = await carregarUnidadesDaTorcida(id)
  return { ok: true, unidades }
}
