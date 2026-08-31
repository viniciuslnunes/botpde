import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { db } from '@torcida/db'
import { lerVistoriaBandeira, vistoriaVencendo } from '@torcida/types'
import {
  listarEmprestimosPatrimonio,
  listarPatrimonio,
  resumirPatrimonio,
  type PatrimonioResumo,
} from '@/lib/patrimonio'
import { ADMIN_DIRECAO_TTL, tagAdminDirecao } from '@/lib/admin-direcao-cache'
import { slaLabel, type AdminInboxItem } from '@/lib/admin-inbox'

/**
 * Direção do departamento de Bandeiras.
 *
 * Não é módulo novo: é o inventário recortado em `categoria: BANDEIRA` mais os
 * dois fatos que só a bandeira tem — a **vistoria** de entrada no estádio
 * (`meta.vistoria`) e a **escala** de quem leva o trapo no jogo (evento da
 * Agenda com `partidaId`). Ver `docs/data/modulo-bandeiras.md`.
 */

const DIA_MS = 24 * 60 * 60 * 1000
const ATRASO_DIAS = 7
const AVISO_VISTORIA_DIAS = 30
/** Sem escala definida a 3 dias do jogo, alguém precisa agir. */
const JANELA_JOGO_DIAS = 14

export type BandeiraItemLite = {
  id: string
  nome: string
  categoria: string
  status: string
  quantidade: number
  localizacao: string | null
  valorEstimado: number | null
  observacao: string | null
  fotoUrl: string | null
  fotoPreviewUrl: string | null
  responsavelId: string | null
  responsavelNome: string | null
  temVistoria: boolean
  vistoriaVencendo: boolean
  /** Ficha completa para preencher o formulário sem uma segunda consulta. */
  vistoria: {
    larguraM: number
    alturaM: number
    comMastro: boolean
    orgao: string | null
    protocolo: string | null
    validade: string | null
    observacao: string | null
  } | null
}

export type BandeirasOpsResumo = {
  resumo: PatrimonioResumo
  emprestimosAbertos: number
  atrasados: number
  semVistoria: number
  vistoriaVencendo: number
  jogosProximos: number
  itens: BandeiraItemLite[]
  pendencias: AdminInboxItem[]
}

async function fetchDirecaoBandeiras(tenantId: string): Promise<BandeirasOpsResumo> {
  const agora = new Date()
  const limiteAtraso = new Date(agora.getTime() - ATRASO_DIAS * DIA_MS)
  const limiteJogo = new Date(agora.getTime() + JANELA_JOGO_DIAS * DIA_MS)

  const [resumo, lista, emprestimos, jogosProximos]: [
    PatrimonioResumo,
    Awaited<ReturnType<typeof listarPatrimonio>>,
    Awaited<ReturnType<typeof listarEmprestimosPatrimonio>>,
    number,
  ] = await Promise.all([
    resumirPatrimonio(tenantId, 'BANDEIRA'),
    listarPatrimonio(tenantId, {
      filtro: { page: 1 },
      pageSize: 120,
      escopoCategoria: 'BANDEIRA',
    }),
    listarEmprestimosPatrimonio(tenantId, {
      status: 'ABERTO',
      limite: 40,
      escopoCategoria: 'BANDEIRA',
    }),
    db.evento.count({
      where: {
        tenantId,
        data: { gte: agora, lte: limiteJogo },
        partidaId: { not: null },
      },
    }),
  ])

  const itens: BandeiraItemLite[] = lista.itens.map((i) => {
    const vistoria = lerVistoriaBandeira(i.meta)
    return {
      id: i.id,
      nome: i.nome,
      categoria: i.categoria,
      status: i.status,
      quantidade: i.quantidade,
      localizacao: i.localizacao,
      valorEstimado: i.valorEstimado != null ? Number(i.valorEstimado) : null,
      observacao: i.observacao,
      fotoUrl: i.fotoUrl,
      fotoPreviewUrl: i.fotoPreviewUrl,
      responsavelId: i.responsavel?.id ?? null,
      responsavelNome: i.responsavel?.nome ?? null,
      temVistoria: vistoria !== null,
      vistoriaVencendo: vistoriaVencendo(vistoria, {
        ref: agora,
        diasAviso: AVISO_VISTORIA_DIAS,
      }),
      vistoria: vistoria
        ? {
            larguraM: vistoria.larguraM,
            alturaM: vistoria.alturaM,
            comMastro: vistoria.comMastro,
            orgao: vistoria.orgao ?? null,
            protocolo: vistoria.protocolo ?? null,
            validade: vistoria.validade ?? null,
            observacao: vistoria.observacao ?? null,
          }
        : null,
    }
  })

  // Item baixado não vai a jogo — cobrar vistoria dele seria ruído.
  const ativos = itens.filter((i) => i.status !== 'BAIXADO')
  const semVistoria = ativos.filter((i) => !i.temVistoria).length
  const vencendo = ativos.filter((i) => i.vistoriaVencendo).length
  const atrasados = emprestimos.filter((e) => e.abertoEm < limiteAtraso)

  const pendencias: AdminInboxItem[] = []

  for (const e of atrasados.slice(0, 5)) {
    const dias = Math.floor((agora.getTime() - e.abertoEm.getTime()) / DIA_MS)
    pendencias.push({
      id: `atr-${e.id}`,
      titulo: `${e.item.nome} · ${dias}d fora`,
      detalhe: `Com ${e.user.nome ?? 'membro'} — cobre a devolução com foto de como ficou guardada.`,
      href: '/admin/bandeiras#em-uso',
      tom: dias >= 14 ? 'danger' : 'warning',
      sla: slaLabel(e.abertoEm, { agora, modo: 'idade' }),
    })
  }

  if (vencendo > 0) {
    pendencias.push({
      id: 'vistoria-vencendo',
      titulo: `${vencendo} liberação${vencendo === 1 ? '' : 'ões'} vencida${vencendo === 1 ? '' : 's'} ou a vencer`,
      detalhe: 'Sem liberação em dia a bandeira para na revista. Renove antes do próximo jogo.',
      href: '/admin/bandeiras#acervo',
      tom: 'danger',
    })
  }

  if (semVistoria > 0) {
    pendencias.push({
      id: 'sem-vistoria',
      titulo: `${semVistoria} bandeira${semVistoria === 1 ? '' : 's'} sem ficha de vistoria`,
      detalhe: 'Registre medidas, mastro e autorização — é o que o clube pede na entrada.',
      href: '/admin/bandeiras#acervo',
      tom: 'warning',
    })
  }

  if (resumo.manutencao > 0) {
    pendencias.push({
      id: 'manutencao',
      titulo: `${resumo.manutencao} em manutenção`,
      detalhe: 'Remendo, pintura ou troca de mastro em aberto.',
      href: '/portal/patrimonio?categoria=BANDEIRA&status=MANUTENCAO',
      tom: 'warning',
    })
  }

  return {
    resumo,
    emprestimosAbertos: emprestimos.length,
    atrasados: atrasados.length,
    semVistoria,
    vistoriaVencendo: vencendo,
    jogosProximos,
    itens,
    pendencias: pendencias.slice(0, 10),
  }
}

export const carregarDirecaoBandeiras = cache(async function carregarDirecaoBandeiras(
  tenantId: string,
): Promise<BandeirasOpsResumo> {
  return unstable_cache(
    () => fetchDirecaoBandeiras(tenantId),
    ['admin-direcao-bandeiras', tenantId],
    { revalidate: ADMIN_DIRECAO_TTL, tags: [tagAdminDirecao(tenantId)] },
  )()
})
