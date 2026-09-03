import Link from 'next/link'
import { FileSearch, Filter } from 'lucide-react'
import { getTenantFromHost } from '@/lib/tenant'
// listarTorcidasParaSelecao não é usada — usamos a listagem específica para relatórios.
import {
  getResumoPrivacidadePorTenant,
  getTenantsPorAfiliacao,
  getTorcedoresPrivadosPorTenant,
  listarAfiliacoesParaRelatorios,
  listarTorcidasParaSelecaoRelatorios,
  type ResumoPrivacidade,
  type ScopeType,
} from '@/lib/super-admin/perfis-torcedores-privados'
import { AdminPageHeader } from '@/components/admin/ui/admin-page-header'
import { TableShell } from '@/components/admin/ui/table-shell'
import { TablePagination } from '@/components/admin/ui/table-pagination'
import { buildAdminHref } from '@/lib/admin-href'
import { AppButton } from '@/components/ui/button'

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return n
}

function toScopeType(value: string | undefined): ScopeType {
  if (value === 'CLUBE') return 'CLUBE'
  return 'TORCIDA'
}

export default async function PerfisTorcedoresPrivadosPage({
  searchParams,
}: {
  searchParams: Promise<{
    scopeType?: 'TORCIDA' | 'CLUBE'
    scopeId?: string
    tenantFocus?: string
    page?: string
  }>
}) {
  const params = await searchParams
  const scopeType = toScopeType(params.scopeType)
  const page = parsePositiveInt(params.page, 1)
  const take = 25

  // Defaults: se não houver seleção, tenta usar o tenant do host.
  const tenantFromHost = await getTenantFromHost()
  const torcidas = await listarTorcidasParaSelecaoRelatorios()
  const afiliacoes = await listarAfiliacoesParaRelatorios()

  const fallbackTenantId = tenantFromHost?.id ?? torcidas[0]?.id
  const fallbackAfiliacaoId = afiliacoes[0]?.id

  const scopeId = params.scopeId ?? (scopeType === 'TORCIDA' ? fallbackTenantId : fallbackAfiliacaoId)

  const header = (
    <AdminPageHeader
      title="Perfis — torcedores marcados como privados"
      description="Relatório operacional para validar o backfill (e regressões) do campo `perfil_privado` para torcedores aprovados."
      icon={<FileSearch className="h-5 w-5" />}
    />
  )

  if (!scopeId) {
    return (
      <div className="flex min-h-full flex-col">
        {header}
        <div className="app-container min-w-0 flex-1 py-5 sm:py-8">
          <p className="text-sm text-[rgb(var(--foreground-muted))]">Nenhum escopo disponível.</p>
        </div>
      </div>
    )
  }

  const clubesTenants =
    scopeType === 'CLUBE' ? await getTenantsPorAfiliacao(scopeId) : []

  const tenantFocus =
    scopeType === 'CLUBE'
      ? params.tenantFocus ?? clubesTenants[0]?.id ?? null
      : scopeId

  if (!tenantFocus) {
    return (
      <div className="flex min-h-full flex-col">
        {header}
        <div className="app-container min-w-0 flex-1 py-5 sm:py-8">
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            Nenhuma torcida disponível para esse clube.
          </p>
        </div>
      </div>
    )
  }

  const [resumoFocus, reportFocus, resumoClub] = await Promise.all([
    getResumoPrivacidadePorTenant(tenantFocus),
    getTorcedoresPrivadosPorTenant({ tenantId: tenantFocus, page: String(page), take }),
    scopeType === 'CLUBE'
      ? Promise.all(clubesTenants.map((t) => getResumoPrivacidadePorTenant(t.id)))
      : Promise.resolve([] as ResumoPrivacidade[]),
  ])

  const resumoClubSorted =
    scopeType === 'CLUBE'
      ? resumoClub
          .slice()
          .sort((a, b) => b.torcedoresComPerfilMarcadoPrivado - a.torcedoresComPerfilMarcadoPrivado)
      : []

  const total = reportFocus.total
  const totalPages = Math.max(1, Math.ceil(total / take))

  const baseQuery = {
    scopeType: scopeType === 'CLUBE' ? 'CLUBE' : 'TORCIDA',
    scopeId,
    tenantFocus: scopeType === 'CLUBE' ? tenantFocus : undefined,
  }

  const buildHref = (p: number) =>
    buildAdminHref('/super-admin/relatorios/perfis-torcedores-privados', { ...baseQuery, page: p })

  return (
    <div className="flex min-h-full flex-col">
      {header}

      <div className="app-container min-w-0 flex-1 space-y-6 py-5 sm:py-8">
        <form
          method="get"
          className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5"
        >
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-[rgb(var(--foreground))]">Escopo</label>
              <select
                name="scopeType"
                defaultValue={scopeType}
                className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--color-primary))] focus:ring-1 focus:ring-[rgb(var(--color-primary))]"
              >
                <option value="TORCIDA">Torcida</option>
                <option value="CLUBE">Clube</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[rgb(var(--foreground))]">
                {scopeType === 'TORCIDA' ? 'Torcida' : 'Clube (afiliacao)'}
              </label>
              <select
                name="scopeId"
                defaultValue={scopeId}
                className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--color-primary))] focus:ring-1 focus:ring-[rgb(var(--color-primary))]"
              >
                {scopeType === 'TORCIDA' ? (
                  torcidas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                      {t.clubeNome ? ` — ${t.clubeNome}` : ''}
                      {t.clubeUf ? `/${t.clubeUf}` : ''}
                    </option>
                  ))
                ) : (
                  afiliacoes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.apelido ?? a.nome}
                    </option>
                  ))
                )}
              </select>
            </div>

            {scopeType === 'CLUBE' && (
              <div>
                <label className="block text-sm font-medium text-[rgb(var(--foreground))]">
                  Torcida em foco
                </label>
                <select
                  name="tenantFocus"
                  defaultValue={tenantFocus}
                  className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--color-primary))] focus:ring-1 focus:ring-[rgb(var(--color-primary))]"
                >
                  {clubesTenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome} ({t.slug})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="mt-4 flex gap-3">
            <AppButton
              variant="primary"
              icon={Filter}
              type="submit"
              className="rounded-lg px-4 py-2 text-sm font-semibold"
            >
              Filtrar
            </AppButton>
            <Link
              href="/super-admin/relatorios/perfis-torcedores-privados"
              className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-4 py-2 text-sm font-semibold text-[rgb(var(--foreground))] hover:bg-[rgb(var(--surface-raised))]"
            >
              Resetar
            </Link>
          </div>
        </form>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
            <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Resumo — foco</h2>
            <div className="mt-3 space-y-2 text-sm text-[rgb(var(--foreground))]">
              <div>
                <span className="text-[rgb(var(--foreground-muted))]">Torcida:</span>{' '}
                {resumoFocus.tenantNome} ({resumoFocus.tenantSlug})
              </div>
              <div>
                <span className="text-[rgb(var(--foreground-muted))]">Torcedores aprovados:</span>{' '}
                {resumoFocus.totalTorcedoresAprovados}
              </div>
              <div>
                <span className="text-[rgb(var(--foreground-muted))]">
                  Marcados como privados (perfil_privado=true):
                </span>{' '}
                {resumoFocus.torcedoresComPerfilMarcadoPrivado}
              </div>
              <div>
                <span className="text-[rgb(var(--foreground-muted))]">Publicos efetivos (após regra):</span>{' '}
                {resumoFocus.torcedoresPublicosEfetivos}
              </div>
            </div>
          </div>

          {scopeType === 'CLUBE' && (
            <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
              <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Resumo — clube</h2>
              <div className="mt-3 space-y-2 text-sm text-[rgb(var(--foreground))]">
                {resumoClubSorted.slice(0, 6).map((r) => (
                  <div key={r.tenantId} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="truncate">{r.tenantNome}</span>
                      <span className="ml-2 text-xs text-[rgb(var(--foreground-muted))]">{r.tenantSlug}</span>
                    </div>
                    <div className="shrink-0 font-mono text-xs text-[rgb(var(--foreground))]">
                      {r.torcedoresComPerfilMarcadoPrivado}
                    </div>
                  </div>
                ))}
                {resumoClubSorted.length > 6 && (
                  <p className="text-xs text-[rgb(var(--foreground-muted))]">
                    + {resumoClubSorted.length - 6} torcida(s)
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <TableShell
          title={
            <span>
              Lista — privados no foco{' '}
              <span className="font-normal text-[rgb(var(--foreground-muted))]">
                ({total} resultado{total === 1 ? '' : 's'})
              </span>
            </span>
          }
          isEmpty={total === 0}
          empty={{
            title: 'Nenhum torcedor com perfil marcado como privado',
            description: 'Nenhum registro encontrado para este foco.',
          }}
          footer={<TablePagination page={page} totalPages={totalPages} buildHref={buildHref} />}
        >
          <thead className="bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground))]">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Torcedor</th>
              <th className="px-3 py-2 text-left font-semibold">User</th>
              <th className="px-3 py-2 text-left font-semibold">perfilPrivado</th>
              <th className="px-3 py-2 text-left font-semibold">Atualizado em</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--border))]">
            {reportFocus.rows.map((r) => (
              <tr key={r.userId}>
                <td className="px-3 py-2 text-[rgb(var(--foreground))]">
                  <div className="font-medium">{r.torcedorNome}</div>
                  <div className="font-mono text-xs text-[rgb(var(--foreground-muted))]">{r.userId}</div>
                </td>
                <td className="px-3 py-2 text-[rgb(var(--foreground))]">
                  <div className="font-medium">{r.userNome ?? '—'}</div>
                  <div className="text-xs text-[rgb(var(--foreground-muted))]">{r.userEmail ?? '—'}</div>
                </td>
                <td className="px-3 py-2 font-mono text-[rgb(var(--foreground))]">
                  {String(r.perfilPrivadoBanco)}
                </td>
                <td className="px-3 py-2 text-[rgb(var(--foreground))]">
                  {r.atualizadoEm.toISOString()}
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      </div>
    </div>
  )
}
