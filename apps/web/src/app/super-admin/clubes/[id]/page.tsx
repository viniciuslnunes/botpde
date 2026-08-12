import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { db } from '@torcida/db'
import { Badge } from '@torcida/ui'
import { labelAcaoAuditoria } from '@/lib/audit-labels'
import {
  carregarMapaPortalMae,
  filtrarTenantsRaiz,
} from '@/lib/tenant-hierarquia-plataforma'
import { ClubeForm, type ClubeFormValores } from '../_components/clube-form'
import { ClubeRivais, type RivalOpcao } from '../_components/clube-rivais'

export const metadata: Metadata = { title: 'Clube — Super Admin' }

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})

type RivalidadeRow = {
  afiliacaoA: { id: string; nome: string; escudoUrl: string | null }
  afiliacaoB: { id: string; nome: string; escudoUrl: string | null }
}

type TorcidaVinculada = {
  id: string
  nome: string
  slug: string
  ativo: boolean
}

type HistoricoRow = {
  id: string
  acao: string
  criadoEm: Date
  ator: { nome: string | null } | null
}

/** Tab Catálogo do detalhe: formulário + uso / rivais / histórico. */
export default async function ClubeDadosPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const clube = await db.afiliacao.findUnique({
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
      criadoEm: true,
      _count: {
        select: {
          torcedores: true,
          partidas: true,
          noticias: true,
          torcidasConhecidas: true,
        },
      },
    },
  })
  if (!clube) notFound()

  const [rivalidades, tenantsRaw, historico, maePorFilho]: [
    RivalidadeRow[],
    TorcidaVinculada[],
    HistoricoRow[],
    Map<string, string>,
  ] = await Promise.all([
    db.rivalidadeClube.findMany({
      where: { OR: [{ afiliacaoAId: id }, { afiliacaoBId: id }] },
      select: {
        afiliacaoA: { select: { id: true, nome: true, escudoUrl: true } },
        afiliacaoB: { select: { id: true, nome: true, escudoUrl: true } },
      },
      take: 40,
    }),
    db.tenant.findMany({
      where: { afiliacaoId: id, sintetico: false },
      select: { id: true, nome: true, slug: true, ativo: true },
      orderBy: { nome: 'asc' },
      take: 80,
    }),
    db.auditLog.findMany({
      where: { entidade: 'Afiliacao', entidadeId: id },
      select: { id: true, acao: true, criadoEm: true, ator: { select: { nome: true } } },
      orderBy: { criadoEm: 'desc' },
      take: 15,
    }),
    carregarMapaPortalMae(),
  ])

  const raizIds = filtrarTenantsRaiz(
    tenantsRaw.map((t) => t.id),
    maePorFilho,
  )
  const raizSet = new Set(raizIds)
  const torcidas = tenantsRaw.filter((t) => raizSet.has(t.id)).slice(0, 25)

  const rivais: RivalOpcao[] = rivalidades.map((r) =>
    r.afiliacaoA.id === id
      ? { id: r.afiliacaoB.id, nome: r.afiliacaoB.nome, escudoUrl: r.afiliacaoB.escudoUrl }
      : { id: r.afiliacaoA.id, nome: r.afiliacaoA.nome, escudoUrl: r.afiliacaoA.escudoUrl },
  )

  const inicial: ClubeFormValores = {
    id: clube.id,
    nome: clube.nome,
    apelido: clube.apelido ?? '',
    slug: clube.slug ?? '',
    serie: clube.serie ?? 'OUTRA',
    estado: clube.estado ?? '',
    cidade: clube.cidade ?? '',
    escudoUrl: clube.escudoUrl ?? '',
    apiExternalId: clube.apiExternalId ?? '',
    torcedoresEstimados: clube.torcedoresEstimados ? String(clube.torcedoresEstimados) : '',
    torcedoresEstimadosFonte: clube.torcedoresEstimadosFonte ?? '',
    torcedoresEstimadosTipo: clube.torcedoresEstimadosTipo ?? '',
  }

  const uso = [
    { label: 'Torcidas na plataforma', valor: raizIds.length },
    { label: 'Torcedores globais', valor: clube._count.torcedores },
    { label: 'Partidas', valor: clube._count.partidas },
    { label: 'Notícias', valor: clube._count.noticias },
    { label: 'Torcidas do catálogo nacional', valor: clube._count.torcidasConhecidas },
  ]

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Dados do clube
        </h2>
        <ClubeForm inicial={inicial} />
      </div>

      <div className="min-w-0 space-y-6">
        <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Uso do clube
          </h2>
          <dl className="mt-3 space-y-2">
            {uso.map((item) => (
              <div key={item.label} className="flex items-baseline justify-between gap-3">
                <dt className="text-sm text-[rgb(var(--foreground-muted))]">{item.label}</dt>
                <dd className="text-sm font-semibold tabular-nums text-[rgb(var(--foreground))]">
                  {item.valor.toLocaleString('pt-BR')}
                </dd>
              </div>
            ))}
          </dl>

          {torcidas.length > 0 ? (
            <ul className="mt-4 space-y-1 border-t border-[rgb(var(--border))] pt-3">
              {torcidas.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-[rgb(var(--foreground))]">{t.nome}</span>
                  {!t.ativo ? <Badge variant="neutral">Suspensa</Badge> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 border-t border-[rgb(var(--border))] pt-3 text-sm text-[rgb(var(--foreground-muted))]">
              Nenhuma torcida usa este clube ainda.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Rivais
          </h2>
          <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
            Rivalidade é simétrica e alimenta a segregação de DM e de feed — cadastrar aqui vale
            para os dois clubes.
          </p>
          <div className="mt-3">
            <ClubeRivais clubeId={clube.id} rivais={rivais} />
          </div>
        </section>

        <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Histórico
          </h2>
          {historico.length === 0 ? (
            <p className="mt-3 text-sm text-[rgb(var(--foreground-muted))]">
              Nenhuma alteração registrada. Criado em {DATA_HORA.format(clube.criadoEm)}.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {historico.map((linha) => (
                <li key={linha.id} className="text-sm">
                  <span className="font-medium text-[rgb(var(--foreground))]">
                    {labelAcaoAuditoria(linha.acao)}
                  </span>
                  <span className="block text-xs text-[rgb(var(--foreground-muted))]">
                    {linha.ator?.nome ?? 'Operador'} · {DATA_HORA.format(linha.criadoEm)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/super-admin/auditoria"
            className="mt-3 inline-block text-xs font-medium text-[rgb(var(--color-primary-fg))] underline-offset-2 hover:underline"
          >
            Ver auditoria completa
          </Link>
        </section>
      </div>
    </div>
  )
}
