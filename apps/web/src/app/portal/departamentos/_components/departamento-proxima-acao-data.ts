import { cache } from 'react'
import { db } from '@torcida/db'
import {
  estaNaJanela,
  saudeOrcamento,
  slugCampanhaDoAno,
  STATUS_PROJETO_ABERTOS,
} from '@torcida/types'
import { listarEventosPorTipo } from '@/lib/eventos-tipo'
import type { ProximaAcaoArea } from './departamento-proxima-acao'

export const resolverProximaAcaoArea = cache(async function resolverProximaAcaoArea(input: {
  tenantId: string
  departamentoId: string
  slug: string
  panel: string
  isGestor: boolean
  totalPendentes: number
  podeVerFinanceiro: boolean
  /** Sócios aprovados aguardando entrada numa área deste departamento. */
  totalPedidosArea?: number
  nomeDepartamento?: string
}): Promise<ProximaAcaoArea> {
  const {
    tenantId,
    departamentoId,
    panel,
    isGestor,
    totalPendentes,
    podeVerFinanceiro,
    totalPedidosArea = 0,
    nomeDepartamento,
  } = input

  if (panel === 'diretoria' && isGestor && totalPendentes > 0) {
    return {
      titulo: `${totalPendentes} solicitação${totalPendentes === 1 ? '' : 'ões'} pendente${totalPendentes === 1 ? '' : 's'}`,
      descricao: 'Aprove ou reprove na fila deste departamento.',
      href: '#fila',
      cta: 'Ver fila',
    }
  }

  if (isGestor && totalPedidosArea > 0) {
    return {
      titulo: `${totalPedidosArea} pedido${totalPedidosArea === 1 ? '' : 's'} de área`,
      descricao: `Sócios aprovados aguardando entrada numa área${
        nomeDepartamento ? ` de ${nomeDepartamento}` : ''
      }.`,
      href: '#pedidos-area',
      cta: 'Ver pedidos',
    }
  }

  // Projetos: orçamento estourado > na janela > área sazonal sem campanha do ano.
  if (isGestor) {
    type ProjetoLite = {
      id: string
      titulo: string
      inicio: Date
      fim: Date | null
      recorrenteAnual: boolean
      orcamentoPrevisto: { toNumber(): number } | number | null
    }
    const projetosAbertos: ProjetoLite[] = await db.projeto.findMany({
      where: {
        tenantId,
        departamentoId,
        status: { in: [...STATUS_PROJETO_ABERTOS] },
      },
      select: {
        id: true,
        titulo: true,
        inicio: true,
        fim: true,
        recorrenteAnual: true,
        orcamentoPrevisto: true,
      },
      take: 40,
    })

    if (projetosAbertos.length > 0) {
      const ids = projetosAbertos.map((p) => p.id)
      const somas: Array<{ projetoId: string | null; _sum: { valor: unknown } }> =
        await db.financeiroLancamento.groupBy({
          by: ['projetoId'],
          where: { tenantId, tipo: 'DESPESA', projetoId: { in: ids } },
          _sum: { valor: true },
        })
      const gastoPorId = new Map<string, number>()
      for (const s of somas) {
        if (s.projetoId) gastoPorId.set(s.projetoId, Number(s._sum.valor ?? 0))
      }

      for (const p of projetosAbertos) {
        const previsto =
          p.orcamentoPrevisto == null
            ? null
            : typeof p.orcamentoPrevisto === 'number'
              ? p.orcamentoPrevisto
              : p.orcamentoPrevisto.toNumber()
        const saude = saudeOrcamento(gastoPorId.get(p.id) ?? 0, previsto)
        if (saude?.estourou) {
          return {
            titulo: `Orçamento estourado · ${p.titulo}`,
            descricao: 'O gasto no livro-caixa passou do previsto deste projeto.',
            href: '#projetos',
            cta: 'Ver projetos',
          }
        }
      }

      const naJanela = projetosAbertos.find((p) =>
        estaNaJanela({
          inicio: p.inicio,
          fim: p.fim,
          recorrenteAnual: p.recorrenteAnual,
        }),
      )
      if (naJanela) {
        return {
          titulo: naJanela.titulo,
          descricao: 'Projeto na janela — acompanhe meta e agenda.',
          href: '#projetos',
          cta: 'Ver projetos',
        }
      }
    }

    type AreaSazonal = { id: string; nome: string; slug: string }
    const sazonais: AreaSazonal[] = await db.departamentoArea.findMany({
      where: { tenantId, departamentoId, ativa: true, sazonal: true },
      select: { id: true, nome: true, slug: true },
      orderBy: { ordem: 'asc' },
      take: 20,
    })
    if (sazonais.length > 0) {
      const ano = new Date().getFullYear()
      const slugsAno = sazonais.map((a) => slugCampanhaDoAno(a.slug, ano))
      const existentes: Array<{ slug: string }> = await db.projeto.findMany({
        where: { departamentoId, slug: { in: slugsAno } },
        select: { slug: true },
      })
      const abertos = new Set(existentes.map((p) => p.slug))
      const faltando = sazonais.find((a) => !abertos.has(slugCampanhaDoAno(a.slug, ano)))
      if (faltando) {
        return {
          titulo: `Abrir ${faltando.nome} ${ano}`,
          descricao: 'Área sazonal sem campanha do ano — abra em um clique.',
          href: '#areas',
          cta: 'Ver áreas',
        }
      }
    }
  }

  if (panel === 'financeiro' && podeVerFinanceiro) {
    type Agg = { id: string }
    const vencidas: Agg[] = await db.cobrancaAssociacao.findMany({
      where: { tenantId, status: { in: ['PENDENTE', 'VENCIDA'] } },
      select: { id: true },
      take: 1,
    })
    if (vencidas.length > 0) {
      return {
        titulo: 'Há cobranças em aberto',
        descricao: 'Veja inadimplência e mensalidades da associação.',
        href: '/portal/cobrancas',
        cta: 'Mensalidades',
      }
    }
  }

  if (panel === 'bateria') {
    const ensaios = await listarEventosPorTipo(tenantId, 'ENSAIO', { futuros: true, limite: 1 })
    if (ensaios[0]) {
      return {
        titulo: ensaios[0].titulo,
        descricao: 'Próximo ensaio da bateria.',
        href: `/portal/eventos/${ensaios[0].id}`,
        cta: 'Abrir ensaio',
      }
    }
    return {
      titulo: 'Escala de jogo',
      descricao: 'Confirme presença nos jogos pela Agenda (RSVP e check-in).',
      href: '#escala',
      cta: 'Ver escala',
    }
  }

  if (panel === 'caravanas') {
    const cars = await listarEventosPorTipo(tenantId, 'CARAVANA', { futuros: true, limite: 1 })
    if (cars[0]) {
      return {
        titulo: cars[0].titulo,
        descricao: 'Próxima caravana — RSVP e embarque.',
        href: `/portal/eventos/${cars[0].id}`,
        cta: 'Abrir caravana',
      }
    }
  }

  // Sem urgência: não duplicar CTAs soft do aside (comunidade/loja/eventos).
  return null
})
