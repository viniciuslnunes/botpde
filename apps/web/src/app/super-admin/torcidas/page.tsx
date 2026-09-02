import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import type { Prisma } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import {
  contarTorcidasDaPlataforma,
  isSuperAdminEmail,
  listarClubesParaSelecao,
  listarTorcidasParaSelecaoSemente,
} from '@/lib/tenant-context'
import { whereTenantEhTorcida } from '@/lib/tenant-hierarquia-plataforma'
import { listarUnidadesParaSelecao } from '@/lib/admin-context-unidades'
import { AdminSuperContextSwitchers } from '@/components/admin/admin-super-context-switchers'
import { AdminPageHeader } from '@/components/admin/ui/admin-page-header'
import { TableShell } from '@/components/admin/ui/table-shell'
import {
  ListagemPaginacao,
  ListagemTh,
  ListagemToolbar,
  ListagemVazia,
} from '@/components/admin/ui/listagem'
import { parseListagemParams } from '@/lib/listagem'
import { LISTAGEM_SUPER_ADMIN_TORCIDAS } from '@/lib/listagem/specs'
import {
  montarOrderByListagem,
  montarPaginacao,
  montarWhereListagem,
  resumirPaginacao,
} from '@/lib/listagem/query'
import { nomeExibicaoAfiliacao } from '@torcida/types'
import { ArrowRight, Building2, Crown, FileSearch, Settings, Users } from 'lucide-react'
import type { Metadata } from 'next'
import type { ClubeOpcao, TorcidaOpcao, UnidadeOpcao } from '@/lib/torcida-labels'

export const metadata: Metadata = { title: 'Torcidas — Super Admin' }

const SPEC = LISTAGEM_SUPER_ADMIN_TORCIDAS

/**
 * `Tenant` é a própria entidade multi-tenant — não há `tenantId` para escopar,
 * e o recorte de negócio ("é torcida") entra por `extra`.
 */
const ESCOPO = {
  global: true as const,
  motivo: 'Tenant é a entidade multi-tenant; o console de plataforma lista todas',
}

type TorcidaRow = {
  id: string
  nome: string
  slug: string
  criadoEm: Date
  afiliacao: { nome: string; apelido: string | null; estado: string | null } | null
}

const dataCurta = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
})

export default async function TorcidasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await auth()

  if (!session?.user?.email || !isSuperAdminEmail(session.user.email)) {
    redirect('/')
  }

  const params = await searchParams
  const proximaRaw = typeof params.proxima === 'string' ? params.proxima.trim() : ''
  const abrirComunidade =
    proximaRaw === '/portal/comunidade' || proximaRaw.startsWith('/portal/')
  const destinoSelecao = abrirComunidade ? 'portal' : 'admin'
  // `proxima` não é do contrato da listagem: viaja como extra para que buscar,
  // ordenar ou paginar não perca o destino com que o operador chegou.
  const extras = proximaRaw ? { proxima: proximaRaw } : undefined

  const listagem = parseListagemParams(params, SPEC)
  const where: Prisma.TenantWhereInput = montarWhereListagem(SPEC, listagem, {
    escopo: ESCOPO,
    // Fonte única de "este tenant é uma torcida": as duas condições de coluna
    // mais a de ser raiz. Remontar isso à mão é o que fazia o KPI dizer 557
    // sobre uma lista de 554 (os 3 portais Caso B).
    extra: [await whereTenantEhTorcida()],
  })

  const tenantAtual = await getTenantFromHost()

  const [torcidas, clubes, unidades, linhas, total, totalTorcidas]: [
    TorcidaOpcao[],
    ClubeOpcao[],
    UnidadeOpcao[],
    TorcidaRow[],
    number,
    number,
  ] = await Promise.all([
    listarTorcidasParaSelecaoSemente(tenantAtual?.slug ?? null),
    listarClubesParaSelecao(),
    tenantAtual ? listarUnidadesParaSelecao(tenantAtual.id) : Promise.resolve([]),
    db.tenant.findMany({
      where,
      select: {
        id: true,
        nome: true,
        slug: true,
        criadoEm: true,
        afiliacao: { select: { nome: true, apelido: true, estado: true } },
      },
      orderBy: montarOrderByListagem(SPEC, listagem),
      ...montarPaginacao(listagem),
    }),
    db.tenant.count({ where }),
    contarTorcidasDaPlataforma(),
  ])

  const paginacao = resumirPaginacao(total, listagem)
  const colunaPorId = (id: string) => SPEC.colunas.find((c) => c.id === id)!
  const semProvisionamento = totalTorcidas <= 5

  // `ListagemVazia` separa "plataforma vazia" de "filtro sem resultado" — sem
  // isso o operador conclui que perdeu dados.
  const vazio = {
    icon: <Building2 className="h-10 w-10" aria-hidden />,
    title: 'Nenhuma torcida na plataforma',
    description:
      'Popule o catálogo e provisione os tenants para que apareçam aqui e no seletor de contexto.',
  }

  return (
    <div className="flex min-h-full flex-col">
      <AdminPageHeader
        title="Gerenciar torcidas"
        description={
          abrirComunidade
            ? 'Escolha a torcida para entrar na Comunidade em modo operador (leitura). Sem torcida ativa o portal não tem contexto.'
            : 'Selecione a torcida no menu ao lado (ou abaixo) e você entra no painel administrativo dela — aprovar membros, eventos, comunicados, tudo isolado por torcida.'
        }
        icon={<Building2 className="h-5 w-5" />}
      />

      <div className="app-container min-w-0 flex-1 space-y-6 py-5 sm:py-8">
      {torcidas.length > 0 && (
        <div className="rounded-2xl border border-[rgb(var(--color-primary)_/_0.35)] bg-[rgb(var(--color-primary)_/_0.08)] p-6">
          <h2 className="text-sm font-semibold text-[rgb(var(--color-primary-fg))]">Selecionar torcida</h2>
          <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
            {tenantAtual
              ? `Ativa agora: ${tenantAtual.nome}`
              : abrirComunidade
                ? 'Nenhuma selecionada — escolha clube e torcida para abrir a Comunidade.'
                : 'Nenhuma selecionada — escolha clube e torcida para abrir o admin.'}
          </p>
          <div className="mt-4">
            <AdminSuperContextSwitchers
              clubes={clubes}
              torcidas={torcidas}
              unidades={unidades}
              torcidaAtualSlug={tenantAtual?.slug ?? null}
              tenantAtualId={tenantAtual?.id ?? null}
              destino={destinoSelecao}
              variant="admin"
            />
          </div>
          {tenantAtual && (
            <div className="mt-4 flex flex-wrap gap-2">
              {abrirComunidade ? (
                <Link
                  href="/portal/comunidade"
                  className="btn-primary inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90"
                >
                  Abrir comunidade — {tenantAtual.nome}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <Link
                  href="/admin"
                  className="btn-primary inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90"
                >
                  <Settings className="h-4 w-4" />
                  Abrir admin — {tenantAtual.nome}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
              <Link
                href={abrirComunidade ? '/admin' : '/portal/comunidade'}
                className="inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-sm text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]"
              >
                {abrirComunidade ? (
                  <>
                    <Settings className="h-4 w-4" />
                    Abrir admin
                  </>
                ) : (
                  <>
                    Abrir comunidade
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Link>
              <Link
                href="/admin/torcedores"
                className="inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] px-4 py-2 text-sm text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]"
              >
                <Users className="h-4 w-4" />
                Aprovar membros
              </Link>
            </div>
          )}
        </div>
      )}

      {semProvisionamento && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-semibold">Provisionar torcidas no banco</p>
          <p className="mt-1 opacity-90">
            Popule o catálogo nacional e crie os tenants vazios (sem presidente) a partir dele:
          </p>
          <code className="mt-2 block rounded bg-[rgb(var(--background-subtle))] px-3 py-2 text-xs text-[rgb(var(--foreground))]">
            pnpm --filter @torcida/db seed:torcidas-conhecidas
            <br />
            pnpm --filter @torcida/db seed:torcidas-tenants
          </code>
        </div>
      )}

      <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
              <FileSearch className="h-4 w-4" />
              Relatórios operacionais
            </h2>
            <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
              Abra o relatório de perfis de torcedores marcados como privados por torcida ou clube.
            </p>
          </div>
          <Link
            href="/super-admin/relatorios/perfis-torcedores-privados"
            className="inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--foreground))] px-4 py-2 text-sm font-semibold text-[rgb(var(--surface))] transition-opacity hover:opacity-90"
          >
            Abrir relatório
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
          <Building2 className="h-4 w-4" />
          {totalTorcidas.toLocaleString('pt-BR')} torcida(s) ativa(s)
        </h2>

        <div className="mt-3 space-y-4">
          <ListagemToolbar
            spec={SPEC}
            params={listagem}
            paginacao={paginacao}
            extras={extras}
            escopoChave="plataforma"
          />

          {linhas.length === 0 ? (
            <ListagemVazia spec={SPEC} params={listagem} vazio={vazio} />
          ) : (
            <>
              <TableShell isEmpty={false} empty={vazio}>
                <thead>
                  <tr className="border-b border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))]">
                    <ListagemTh
                      spec={SPEC}
                      params={listagem}
                      coluna={colunaPorId('nome')}
                      extras={extras}
                    />
                    <ListagemTh
                      spec={SPEC}
                      params={listagem}
                      coluna={colunaPorId('clube')}
                      extras={extras}
                      className="hidden sm:table-cell"
                    />
                    <ListagemTh
                      spec={SPEC}
                      params={listagem}
                      coluna={colunaPorId('slug')}
                      extras={extras}
                      className="hidden lg:table-cell"
                    />
                    <ListagemTh
                      spec={SPEC}
                      params={listagem}
                      coluna={colunaPorId('criadoEm')}
                      extras={extras}
                      className="hidden md:table-cell"
                    />
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((torcida) => {
                    const clube = torcida.afiliacao
                      ? nomeExibicaoAfiliacao(torcida.afiliacao)
                      : null
                    return (
                      <tr
                        key={torcida.id}
                        className="border-b border-[rgb(var(--border))] transition-colors last:border-0 hover:bg-[rgb(var(--background-subtle))]"
                      >
                        <td className="px-4 py-3">
                          <span className="block truncate font-medium text-[rgb(var(--foreground))]">
                            {torcida.nome}
                          </span>
                          {/* O slug some da própria coluna no mobile — sem ele
                              não dá para distinguir homônimas. */}
                          <span className="block truncate font-mono text-xs text-[rgb(var(--foreground-muted))] lg:hidden">
                            {torcida.slug}
                          </span>
                        </td>
                        <td className="hidden px-4 py-3 text-[rgb(var(--foreground-muted))] sm:table-cell">
                          {clube ? (
                            <span className="block truncate">
                              {clube}
                              {torcida.afiliacao?.estado ? ` (${torcida.afiliacao.estado})` : ''}
                            </span>
                          ) : (
                            <span className="opacity-60">—</span>
                          )}
                        </td>
                        <td className="hidden px-4 py-3 font-mono text-xs text-[rgb(var(--foreground-muted))] lg:table-cell">
                          {torcida.slug}
                        </td>
                        <td className="hidden px-4 py-3 text-sm text-[rgb(var(--foreground-muted))] md:table-cell">
                          {dataCurta.format(torcida.criadoEm)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </TableShell>

              <ListagemPaginacao
                spec={SPEC}
                params={listagem}
                paginacao={paginacao}
                extras={extras}
              />
            </>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--foreground))]">
              <Crown className="h-4 w-4" />
              Presidência e lideranças
            </h2>
            <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
              Quem lidera cada torcida e cada unidade, na árvore real — transferir, remover, ou
              sair da posse de um portal que caiu no seu colo.
            </p>
          </div>
          <Link
            href="/super-admin/liderancas"
            className="inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--foreground))] px-4 py-2 text-sm font-semibold text-[rgb(var(--surface))] transition-opacity hover:opacity-90"
          >
            Abrir lideranças
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
      </div>
    </div>
  )
}
