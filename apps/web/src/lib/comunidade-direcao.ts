import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { db } from '@torcida/db'
import {
  ADMIN_DIRECAO_TTL,
  tagAdminDirecao,
} from '@/lib/admin-direcao-cache'
import { slaLabel, type AdminInboxItem } from '@/lib/admin-inbox'

export type ComunidadePendencia = AdminInboxItem

export type ComunidadeOpsResumo = {
  denunciasPost: number
  denunciasMensagem: number
  noticiasRascunho: number
  ultimoComunicadoTitulo: string | null
  pendencias: ComunidadePendencia[]
}

type ComunidadeOpts = {
  afiliacaoId: string | null
  podeModerarPosts: boolean
  podeModerarMensagens: boolean
  podeCurarNoticias: boolean
  podePublicarComunicado: boolean
}

async function fetchDirecaoComunidade(
  tenantId: string,
  opts: ComunidadeOpts,
): Promise<ComunidadeOpsResumo> {
  const agora = new Date()

  type DenunciaLite = {
    id: string
    motivo: string
    criadoEm: Date
    tipo: 'post' | 'mensagem'
  }

  const [
    denunciasPost,
    denunciasMensagem,
    noticiasRascunho,
    ultimoComunicado,
    topPosts,
    topMsgs,
  ]: [
    number,
    number,
    number,
    { titulo: string; publicadoEm: Date } | null,
    Array<{ id: string; motivo: string; criadoEm: Date }>,
    Array<{ id: string; motivo: string; criadoEm: Date }>,
  ] = await Promise.all([
    opts.podeModerarPosts
      ? db.denuncia.count({ where: { tenantId, status: 'PENDENTE' } })
      : Promise.resolve(0),
    opts.podeModerarMensagens
      ? db.denunciaMensagem
          .count({ where: { tenantId, status: 'PENDENTE' } })
          .catch(() => 0)
      : Promise.resolve(0),
    opts.podeCurarNoticias && opts.afiliacaoId
      ? db.noticia.count({
          where: { afiliacaoId: opts.afiliacaoId, status: 'RASCUNHO' },
        })
      : Promise.resolve(0),
    opts.podePublicarComunicado
      ? db.announcement.findFirst({
          where: { tenantId },
          orderBy: { publicadoEm: 'desc' },
          select: { titulo: true, publicadoEm: true },
        })
      : Promise.resolve(null),
    opts.podeModerarPosts
      ? db.denuncia.findMany({
          where: { tenantId, status: 'PENDENTE' },
          orderBy: { criadoEm: 'asc' },
          take: 3,
          select: { id: true, motivo: true, criadoEm: true },
        })
      : Promise.resolve([]),
    opts.podeModerarMensagens
      ? db.denunciaMensagem
          .findMany({
            where: { tenantId, status: 'PENDENTE' },
            orderBy: { criadoEm: 'asc' },
            take: 3,
            select: { id: true, motivo: true, criadoEm: true },
          })
          .catch(() => [] as Array<{ id: string; motivo: string; criadoEm: Date }>)
      : Promise.resolve([]),
  ])

  const top: DenunciaLite[] = [
    ...topPosts.map((d) => ({ ...d, tipo: 'post' as const })),
    ...topMsgs.map((d) => ({ ...d, tipo: 'mensagem' as const })),
  ]
    .sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime())
    .slice(0, 3)

  const pendencias: ComunidadePendencia[] = []

  for (const d of top) {
    const sla = slaLabel(d.criadoEm, { agora, modo: 'idade' })
    pendencias.push({
      id: `den-${d.tipo}-${d.id}`,
      titulo: d.tipo === 'post' ? 'Denúncia no mural' : 'Denúncia em mensagem',
      detalhe: d.motivo.slice(0, 120) || 'Sem motivo informado',
      href: `/admin/comunidade/moderacao?destaque=${d.id}`,
      tom: sla.startsWith('D+') && Number(sla.slice(2)) >= 2 ? 'danger' : 'warning',
      sla,
    })
  }

  const denunciasTotal = denunciasPost + denunciasMensagem
  if (denunciasTotal > top.length) {
    pendencias.push({
      id: 'denuncias-mais',
      titulo: `+${denunciasTotal - top.length} denúncia${denunciasTotal - top.length === 1 ? '' : 's'} na fila`,
      detalhe: [
        denunciasPost > 0 ? `${denunciasPost} no mural` : null,
        denunciasMensagem > 0 ? `${denunciasMensagem} em mensagens` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      href: '/admin/comunidade/moderacao',
      tom: denunciasTotal >= 5 ? 'danger' : 'warning',
    })
  }

  if (noticiasRascunho > 0) {
    pendencias.push({
      id: 'rascunhos',
      titulo: `${noticiasRascunho} notícia${noticiasRascunho === 1 ? '' : 's'} em rascunho`,
      detalhe: 'Curadoria aguardando revisão ou publicação.',
      href: '/admin/comunidade/noticias',
      tom: 'warning',
    })
  }
  if (opts.podePublicarComunicado && !ultimoComunicado) {
    pendencias.push({
      id: 'sem-comunicado',
      titulo: 'Nenhum comunicado publicado',
      detalhe: 'A torcida ainda não tem comunicado oficial no módulo.',
      href: '/admin/comunidade/comunicados',
      tom: 'default',
    })
  }

  return {
    denunciasPost,
    denunciasMensagem,
    noticiasRascunho,
    ultimoComunicadoTitulo: ultimoComunicado?.titulo ?? null,
    pendencias,
  }
}

/**
 * Inbox do posto Comunicação/Comunidade — denúncias e rascunhos de notícia.
 */
export const carregarDirecaoComunidade = cache(async function carregarDirecaoComunidade(
  tenantId: string,
  opts: ComunidadeOpts,
): Promise<ComunidadeOpsResumo> {
  const key = [
    'admin-direcao-comunidade',
    tenantId,
    opts.afiliacaoId ?? '-',
    opts.podeModerarPosts ? '1' : '0',
    opts.podeModerarMensagens ? '1' : '0',
    opts.podeCurarNoticias ? '1' : '0',
    opts.podePublicarComunicado ? '1' : '0',
  ]
  return unstable_cache(
    () => fetchDirecaoComunidade(tenantId, opts),
    key,
    { revalidate: ADMIN_DIRECAO_TTL, tags: [tagAdminDirecao(tenantId)] },
  )()
})
