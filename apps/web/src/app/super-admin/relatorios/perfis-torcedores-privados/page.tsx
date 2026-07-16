import Link from 'next/link'
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

function buildQuery(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue
    sp.set(k, String(v))
  }
  const qs = sp.toString()
  return qs ? `?${qs}` : ''
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

  if (!scopeId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-zinc-100">Relatório</h1>
        <p className="text-sm text-zinc-400">Nenhum escopo disponível.</p>
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
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-zinc-100">Relatório</h1>
        <p className="text-sm text-zinc-400">Nenhuma torcida disponível para esse clube.</p>
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
  const hasPrev = page > 1
  const hasNext = page < totalPages

  const baseQuery = {
    scopeType: scopeType === 'CLUBE' ? 'CLUBE' : 'TORCIDA',
    scopeId,
    tenantFocus: scopeType === 'CLUBE' ? tenantFocus : undefined,
  }

  const prevHref = `${buildQuery({ ...baseQuery, page: hasPrev ? page - 1 : 1 })}`
  const nextHref = `${buildQuery({ ...baseQuery, page: hasNext ? page + 1 : totalPages })}`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Perfis — torcedores marcados como privados</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Relatório operacional para validar o backfill (e regressões) do campo `perfil_privado`
          para torcedores aprovados.
        </p>
      </div>

      <form method="get" className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-zinc-200">Escopo</label>
            <select
              name="scopeType"
              defaultValue={scopeType}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            >
              <option value="TORCIDA">Torcida</option>
              <option value="CLUBE">Clube</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-200">
              {scopeType === 'TORCIDA' ? 'Torcida' : 'Clube (afiliacao)'}
            </label>
            <select
              name="scopeId"
              defaultValue={scopeId}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
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
              <label className="block text-sm font-medium text-zinc-200">Torcida em foco</label>
              <select
                name="tenantFocus"
                defaultValue={tenantFocus}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
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
          <button
            type="submit"
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Filtrar
          </button>
          <Link
            href="/super-admin/relatorios/perfis-torcedores-privados"
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-700"
          >
            Resetar
          </Link>
        </div>
      </form>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-sm font-semibold text-zinc-200">Resumo — foco</h2>
          <div className="mt-3 space-y-2 text-sm text-zinc-300">
            <div>
              <span className="text-zinc-500">Torcida:</span> {resumoFocus.tenantNome} ({resumoFocus.tenantSlug})
            </div>
            <div>
              <span className="text-zinc-500">Torcedores aprovados:</span> {resumoFocus.totalTorcedoresAprovados}
            </div>
            <div>
              <span className="text-zinc-500">Marcados como privados (perfil_privado=true):</span>{' '}
              {resumoFocus.torcedoresComPerfilMarcadoPrivado}
            </div>
            <div>
              <span className="text-zinc-500">Publicos efetivos (após regra):</span>{' '}
              {resumoFocus.torcedoresPublicosEfetivos}
            </div>
          </div>
        </div>

        {scopeType === 'CLUBE' && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-sm font-semibold text-zinc-200">Resumo — clube</h2>
            <div className="mt-3 space-y-2 text-sm text-zinc-300">
              {resumoClubSorted.slice(0, 6).map((r) => (
                <div key={r.tenantId} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="truncate">{r.tenantNome}</span>
                    <span className="ml-2 text-xs text-zinc-500">{r.tenantSlug}</span>
                  </div>
                  <div className="shrink-0 font-mono text-xs text-zinc-200">
                    {r.torcedoresComPerfilMarcadoPrivado}
                  </div>
                </div>
              ))}
              {resumoClubSorted.length > 6 && (
                <p className="text-xs text-zinc-500">+ {resumoClubSorted.length - 6} torcida(s)</p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-200">Lista — privados no foco</h2>
          <div className="text-xs text-zinc-500">
            {total} resultado(s) · página {page} / {totalPages}
          </div>
        </div>

        {total === 0 ? (
          <p className="mt-4 text-sm text-zinc-400">Nenhum torcedor com perfil marcado como privado neste foco.</p>
        ) : (
          <>
            <div className="mt-4 overflow-auto rounded-lg border border-zinc-800">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-950 text-zinc-300">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Torcedor</th>
                    <th className="px-3 py-2 text-left font-semibold">User</th>
                    <th className="px-3 py-2 text-left font-semibold">perfilPrivado</th>
                    <th className="px-3 py-2 text-left font-semibold">Atualizado em</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800 bg-zinc-900">
                  {reportFocus.rows.map((r) => (
                    <tr key={r.userId}>
                      <td className="px-3 py-2 text-zinc-200">
                        <div className="font-medium">{r.torcedorNome}</div>
                        <div className="text-xs text-zinc-500 font-mono">{r.userId}</div>
                      </td>
                      <td className="px-3 py-2 text-zinc-200">
                        <div className="font-medium">{r.userNome ?? '—'}</div>
                        <div className="text-xs text-zinc-500">{r.userEmail ?? '—'}</div>
                      </td>
                      <td className="px-3 py-2 font-mono text-zinc-200">{String(r.perfilPrivadoBanco)}</td>
                      <td className="px-3 py-2 text-zinc-300">
                        {r.atualizadoEm.toISOString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <Link
                href={`/super-admin/relatorios/perfis-torcedores-privados${prevHref}`}
                className={hasPrev ? 'rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-700' : 'pointer-events-none rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-500'}
              >
                Página anterior
              </Link>

              <Link
                href={`/super-admin/relatorios/perfis-torcedores-privados${nextHref}`}
                className={hasNext ? 'rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90' : 'pointer-events-none rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-violet-200'}
              >
                Próxima página
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

