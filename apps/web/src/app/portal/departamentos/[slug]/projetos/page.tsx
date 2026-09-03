import { notFound } from 'next/navigation'
import { AlertTriangle, Target, Wallet } from 'lucide-react'
import {
  hrefHomeDepartamento,
  progressoMeta,
  saudeOrcamento,
} from '@torcida/types'
import { getDepartamentoContexto } from '../_lib/contexto'
import {
  carregarAreaMembros,
  carregarProjetos,
  carregarSlugsCampanhaAno,
  montarAreasResumo,
} from '../_lib/carregar-cockpit'
import {
  ProjetoSaudeGrupo,
  ProjetoSaudeRow,
  type ProjetoSaudeItem,
} from '@/components/departamentos/projeto-saude-lista'
import { KpiGrid, StatCard } from '@/components/admin/ui'
import {
  DepartamentoProjetoCriar,
  DepartamentoProjetosBlock,
} from '../_components/departamento-projetos-block'
import type { Metadata } from 'next'

type Params = { slug: string }

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const numero = new Intl.NumberFormat('pt-BR')

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  return { title: `Projetos · ${slug}` }
}

function atrasadoDe(p: { status: string; fimIso: string | null }): boolean {
  if (p.status !== 'ATIVO' && p.status !== 'PLANEJADO') return false
  if (!p.fimIso) return false
  return new Date(`${p.fimIso}T12:00:00`) < new Date()
}

export default async function DepartamentoProjetosListaPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug } = await params
  const ctx = await getDepartamentoContexto(slug)
  if (!ctx) notFound()

  const { tenant, departamento: depto, podeGerirEquipe, areas } = ctx
  const isGestor = podeGerirEquipe

  const [projetosPack, areaMembros, slugsCampanha] = await Promise.all([
    carregarProjetos({
      tenantId: tenant.id,
      departamentoId: depto.id,
      areas,
    }),
    carregarAreaMembros(areas.map((a) => a.id)),
    carregarSlugsCampanhaAno(tenant.id, depto.id),
  ])

  const areasResumo = montarAreasResumo(areas, areaMembros.membrosPorArea, slugsCampanha)
  const { projetos, areasOpcoes } = projetosPack

  const itens: ProjetoSaudeItem[] = projetos.map((p) => {
    const metaPct = progressoMeta(p.realizadoQuantidade, p.metaQuantidade)
    const orcamento = saudeOrcamento(p.gastoRealizado, p.orcamentoPrevisto)
    return {
      id: p.id,
      titulo: p.titulo,
      href: hrefHomeDepartamento(depto.slug, 'projetos', { projeto: p.id }),
      tipo: p.tipo,
      status: p.status,
      areaNome: p.areaNome,
      inicioLabel: p.inicioLabel,
      fimLabel: p.fimLabel,
      atrasado: atrasadoDe(p),
      naJanela: p.naJanela,
      metaPct,
      metaLabel:
        metaPct != null && p.metaQuantidade != null
          ? `${numero.format(p.realizadoQuantidade)} de ${numero.format(p.metaQuantidade)}${p.metaUnidade ? ` ${p.metaUnidade}` : ''}`
          : null,
      orcamentoPct: orcamento?.percentual ?? null,
      orcamentoEstourou: orcamento?.estourou ?? false,
      orcamentoLabel: orcamento
        ? `${moeda.format(p.gastoRealizado)} de ${moeda.format(p.orcamentoPrevisto ?? 0)}`
        : null,
      responsavelNome: p.responsavelNome,
    }
  })

  const abertos = itens.filter((p) => p.status === 'ATIVO' || p.status === 'PLANEJADO')
  const atrasados = abertos.filter((p) => p.atrasado)
  const metaRisco = abertos.filter((p) => p.metaPct != null && p.metaPct < 50)
  const orcamentoEstouro = itens.filter((p) => p.orcamentoEstourou)

  const emRisco = itens.filter((p) => p.atrasado || p.orcamentoEstourou || (p.status === 'ATIVO' && p.metaPct != null && p.metaPct < 50))
  const noPrazo = itens.filter((p) => !emRisco.includes(p) && (p.status === 'ATIVO' || p.status === 'PLANEJADO'))
  const encerrados = itens.filter((p) => p.status === 'CONCLUIDO' || p.status === 'CANCELADO')

  return (
    <div className="space-y-5">
      <div>
        <h2 className="portal-display text-base text-[rgb(var(--foreground))]">
          Projetos e campanhas
        </h2>
        <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
          O trabalho do departamento: meta, orçamento do caixa e o que está parado.
        </p>
      </div>

      <KpiGrid cols={4}>
        <StatCard compact label="Em aberto" value={abertos.length} icon={<Target className="h-4 w-4" />} />
        <StatCard
          compact
          label="Atrasados"
          value={atrasados.length}
          tone={atrasados.length > 0 ? 'warning' : 'default'}
          icon={<AlertTriangle className="h-4 w-4" />}
          badge={atrasados.length > 0 ? 'Fora do prazo' : undefined}
          badgeTone="warning"
        />
        <StatCard
          compact
          label="Meta abaixo da metade"
          value={metaRisco.length}
          tone={metaRisco.length > 0 ? 'warning' : 'default'}
          icon={<Target className="h-4 w-4" />}
          badge={metaRisco.length > 0 ? 'Acompanhar alcance' : undefined}
          badgeTone="warning"
        />
        <StatCard
          compact
          label="Orçamento estourado"
          value={orcamentoEstouro.length}
          tone={orcamentoEstouro.length > 0 ? 'danger' : 'default'}
          icon={<Wallet className="h-4 w-4" />}
          badge={orcamentoEstouro.length > 0 ? 'Acima do previsto' : undefined}
          badgeTone="danger"
        />
      </KpiGrid>

      {itens.length === 0 ? (
        <DepartamentoProjetosBlock
          departamentoId={depto.id}
          slug={depto.slug}
          projetos={projetos}
          areas={areasOpcoes}
          podeGerir={isGestor}
          areasSazonaisSemCampanha={areasResumo
            .filter((a) => a.ativa && a.sazonal && !a.campanhaAnoAberta)
            .map((a) => ({ id: a.id, nome: a.nome }))}
        />
      ) : (
        <div className="space-y-6">
          {emRisco.length > 0 ? (
            <ProjetoSaudeGrupo titulo="Pedem atenção" contagem={emRisco.length}>
              {emRisco.map((item) => (
                <ProjetoSaudeRow key={item.id} item={item} />
              ))}
            </ProjetoSaudeGrupo>
          ) : null}
          {noPrazo.length > 0 ? (
            <ProjetoSaudeGrupo titulo="Em curso" contagem={noPrazo.length}>
              {noPrazo.map((item) => (
                <ProjetoSaudeRow key={item.id} item={item} />
              ))}
            </ProjetoSaudeGrupo>
          ) : null}
          {encerrados.length > 0 ? (
            <ProjetoSaudeGrupo titulo="Encerrados" contagem={encerrados.length}>
              {encerrados.map((item) => (
                <ProjetoSaudeRow key={item.id} item={item} />
              ))}
            </ProjetoSaudeGrupo>
          ) : null}
          {isGestor ? (
            <DepartamentoProjetoCriar
              departamentoId={depto.id}
              slug={depto.slug}
              areas={areasOpcoes}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}
