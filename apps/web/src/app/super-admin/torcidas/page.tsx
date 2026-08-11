import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import {
  isSuperAdminEmail,
  listarClubesParaSelecao,
  listarTorcidasParaSelecao,
} from '@/lib/tenant-context'
import { listarUnidadesParaSelecao } from '@/lib/admin-context-unidades'
import { AdminSuperContextSwitchers } from '@/components/admin/admin-super-context-switchers'
import { AdminPageHeader } from '@/components/admin/ui/admin-page-header'
import { ArrowRight, Building2, Crown, FileSearch, Settings, Users } from 'lucide-react'
import type { Metadata } from 'next'
import type { UnidadeOpcao } from '@/lib/torcida-labels'
import { TorcidasListaCliente } from './torcidas-lista-cliente'

export const metadata: Metadata = { title: 'Torcidas — Super Admin' }

export default async function TorcidasPage({
  searchParams,
}: {
  searchParams: Promise<{ proxima?: string }>
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

  const [torcidas, clubes, tenantAtual, totalTenants] = await Promise.all([
    listarTorcidasParaSelecao(),
    listarClubesParaSelecao(),
    getTenantFromHost(),
    db.tenant.count({ where: { ativo: true, sintetico: false } }),
  ])

  const unidades: UnidadeOpcao[] = tenantAtual
    ? await listarUnidadesParaSelecao(tenantAtual.id)
    : []

  const semProvisionamento = totalTenants <= 5

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
          {totalTenants} torcida(s) ativa(s)
        </h2>
        <div className="mt-3">
          <TorcidasListaCliente torcidas={torcidas} />
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
