import { db, type Prisma } from '@torcida/db'
import {
  PERMISSIONS,
  STATUS_PROJETO_ABERTOS,
  estaNaJanela,
  hrefHomeDepartamento,
  progressoMeta,
  saudeOrcamento,
  resolverCorSemRivalidade,
} from '@torcida/types'
import { assertPermission } from '@/lib/authz'
import { optsCorDoTenant } from '@/lib/cor-departamento'
import { ListagemToolbar, ListagemVazia, KpiGrid, StatCard } from '@/components/admin/ui'
import { parseListagemParams, type ListagemFacetas } from '@/lib/listagem'
import { LISTAGEM_DEPARTAMENTO_PROJETOS } from '@/lib/listagem/specs'
import { carregarFacetas, montarWhereListagem, resumirPaginacao } from '@/lib/listagem/query'
import { AlertTriangle, Target, Wallet } from 'lucide-react'
import type { Metadata } from 'next'
import { ProjetoAcoesInline } from '../_components/projeto-acoes-inline'
import {
  ProjetoSaudeGrupo,
  ProjetoSaudeRow,
  type ProjetoSaudeItem,
} from '@/components/departamentos/projeto-saude-lista'

export const metadata: Metadata = { title: 'Projetos — Departamentos' }

const SPEC = LISTAGEM_DEPARTAMENTO_PROJETOS
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const numero = new Intl.NumberFormat('pt-BR')
const fmtData = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
})

export default async function DepartamentoProjetosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { tenant } = await assertPermission(PERMISSIONS.ROLES_MANAGE)

  const params = await searchParams
  const listagem = parseListagemParams(params, SPEC)

  const where: Prisma.ProjetoWhereInput = montarWhereListagem(SPEC, listagem, {
    escopo: { tenantId: tenant.id },
  })

  type ProjetoRow = {
    id: string
    titulo: string
    tipo: string
    status: string
    inicio: Date
    fim: Date | null
    recorrenteAnual: boolean
    metaQuantidade: number | null
    metaUnidade: string | null
    realizadoQuantidade: number
    orcamentoPrevisto: unknown
    area: { nome: string } | null
    departamento: { id: string; nome: string; slug: string; cor: string }
    responsavel: { nome: string | null; nickname: string | null } | null
  }

  const [projetos, total]: [ProjetoRow[], number] = await Promise.all([
    db.projeto.findMany({
      where,
      orderBy: [{ status: 'asc' }, { inicio: 'desc' }],
      take: 200,
      select: {
        id: true,
        titulo: true,
        tipo: true,
        status: true,
        inicio: true,
        fim: true,
        recorrenteAnual: true,
        metaQuantidade: true,
        metaUnidade: true,
        realizadoQuantidade: true,
        orcamentoPrevisto: true,
        area: { select: { nome: true } },
        departamento: { select: { id: true, nome: true, slug: true, cor: true } },
        responsavel: { select: { nome: true, nickname: true } },
      },
    }),
    db.projeto.count({ where }),
  ])

  const gastoPorProjeto = new Map<string, number>()
  if (projetos.length > 0) {
    const somas: Array<{ projetoId: string | null; _sum: { valor: unknown } }> =
      await db.financeiroLancamento.groupBy({
        by: ['projetoId'],
        where: {
          tenantId: tenant.id,
          tipo: 'DESPESA',
          projetoId: { in: projetos.map((p) => p.id) },
        },
        _sum: { valor: true },
      })
    for (const s of somas) {
      if (s.projetoId) gastoPorProjeto.set(s.projetoId, Number(s._sum.valor ?? 0))
    }
  }

  const paginacao = resumirPaginacao(total, { ...listagem, pagina: 1, porPagina: 200 })

  const facetas: ListagemFacetas = await carregarFacetas(
    SPEC,
    listagem,
    { escopo: { tenantId: tenant.id } },
    async (campo, whereFaceta) => {
      const linhas = await db.projeto.groupBy({
        by: [campo as 'status'],
        where: whereFaceta as Prisma.ProjetoWhereInput,
        _count: { _all: true },
      })
      return linhas.map((linha: Record<string, unknown> & { _count: { _all: number } }) => ({
        valor: (linha[campo] as string | null) ?? null,
        count: linha._count._all,
      }))
    },
  )

  const abertosSet = new Set<string>(STATUS_PROJETO_ABERTOS)
  const corOpts = await optsCorDoTenant(tenant)
  const itens: (ProjetoSaudeItem & {
    departamentoId: string
    slug: string
    metaQuantidade: number | null
    realizadoQuantidade: number
  })[] = projetos.map((p) => {
    const previsto = p.orcamentoPrevisto == null ? null : Number(p.orcamentoPrevisto)
    const gasto = gastoPorProjeto.get(p.id) ?? 0
    const metaPct = progressoMeta(p.realizadoQuantidade, p.metaQuantidade)
    const orcamento = saudeOrcamento(gasto, previsto)
    const atrasado =
      abertosSet.has(p.status) && p.fim != null && p.fim < new Date()
    return {
      id: p.id,
      titulo: p.titulo,
      href: hrefHomeDepartamento(p.departamento.slug, 'projetos', { projeto: p.id }),
      tipo: p.tipo,
      status: p.status,
      areaNome: p.area?.nome ?? null,
      departamentoNome: p.departamento.nome,
      departamentoCor: resolverCorSemRivalidade(p.departamento.cor, corOpts),
      inicioLabel: fmtData.format(p.inicio),
      fimLabel: p.fim ? fmtData.format(p.fim) : null,
      atrasado,
      naJanela: estaNaJanela({
        inicio: p.inicio,
        fim: p.fim,
        recorrenteAnual: p.recorrenteAnual,
      }),
      metaPct,
      metaLabel:
        metaPct != null && p.metaQuantidade != null
          ? `${numero.format(p.realizadoQuantidade)} de ${numero.format(p.metaQuantidade)}${p.metaUnidade ? ` ${p.metaUnidade}` : ''}`
          : null,
      orcamentoPct: orcamento?.percentual ?? null,
      orcamentoEstourou: orcamento?.estourou ?? false,
      orcamentoLabel: orcamento
        ? `${moeda.format(gasto)} de ${moeda.format(previsto ?? 0)}`
        : null,
      responsavelNome:
        p.responsavel?.nome?.trim() ||
        (p.responsavel?.nickname ? `@${p.responsavel.nickname}` : null),
      departamentoId: p.departamento.id,
      slug: p.departamento.slug,
      metaQuantidade: p.metaQuantidade,
      realizadoQuantidade: p.realizadoQuantidade,
    }
  })

  const abertos = itens.filter((p) => abertosSet.has(p.status))
  const atrasados = abertos.filter((p) => p.atrasado)
  const metaRisco = abertos.filter((p) => p.metaPct != null && p.metaPct < 50)
  const orcamentoEstouro = itens.filter((p) => p.orcamentoEstourou)

  const emRisco = itens.filter(
    (p) =>
      p.atrasado ||
      p.orcamentoEstourou ||
      (p.status === 'ATIVO' && p.metaPct != null && p.metaPct < 50),
  )
  const noPrazo = itens.filter(
    (p) => !emRisco.includes(p) && (p.status === 'ATIVO' || p.status === 'PLANEJADO'),
  )
  const encerrados = itens.filter((p) => p.status === 'CONCLUIDO' || p.status === 'CANCELADO')

  function renderGrupo(titulo: string, rows: typeof itens) {
    if (rows.length === 0) return null
    return (
      <ProjetoSaudeGrupo titulo={titulo}>
        {rows.map((item) => (
          <ProjetoSaudeRow
            key={item.id}
            item={item}
            acoes={
              <ProjetoAcoesInline
                departamentoId={item.departamentoId}
                projetoId={item.id}
                slug={item.slug}
                status={item.status}
                metaQuantidade={item.metaQuantidade}
                realizadoQuantidade={item.realizadoQuantidade}
              />
            }
          />
        ))}
      </ProjetoSaudeGrupo>
    )
  }

  return (
    <div className="space-y-5">
      <KpiGrid cols={4}>
        <StatCard label="Em aberto" value={abertos.length} icon={<Target className="h-5 w-5" />} />
        <StatCard
          label="Atrasados"
          value={atrasados.length}
          tone={atrasados.length > 0 ? 'warning' : 'default'}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <StatCard
          label="Meta abaixo da metade"
          value={metaRisco.length}
          tone={metaRisco.length > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label="Orçamento estourado"
          value={orcamentoEstouro.length}
          tone={orcamentoEstouro.length > 0 ? 'danger' : 'default'}
          icon={<Wallet className="h-5 w-5" />}
        />
      </KpiGrid>

      <ListagemToolbar
        spec={SPEC}
        params={listagem}
        paginacao={paginacao}
        facetas={facetas}
        escopoChave={tenant.id}
        filtrosCompactos={[{ filtroId: 'status' }, { filtroId: 'tipo' }]}
      />

      <p className="text-xs text-[rgb(var(--foreground-muted))]">
        Meta e caixa na mesma linha. Mude o status ou registre o alcance daqui — a ficha
        completa abre no portal do departamento.
      </p>

      {itens.length === 0 ? (
        <ListagemVazia
          spec={SPEC}
          params={listagem}
          vazio={{
            icon: (
              <Target
                className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--foreground-muted))]"
                aria-hidden
              />
            ),
            title: 'Nenhum projeto cadastrado',
            description:
              'Campanhas, projetos e ações são cadastrados pelo gestor no departamento. Abra a ficha de Projetos no portal para criar o primeiro.',
          }}
        />
      ) : (
        <div className="space-y-6">
          {renderGrupo('Pedem atenção', emRisco)}
          {renderGrupo('Em curso', noPrazo)}
          {renderGrupo('Encerrados', encerrados)}
          {total > itens.length ? (
            <p className="text-center text-xs text-[rgb(var(--foreground-muted))]">
              Mostrando {itens.length} de {total}. Afine a busca para recortar.
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
