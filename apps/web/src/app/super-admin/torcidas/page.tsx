import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { isSuperAdminEmail, listarTorcidasParaSelecao } from '@/lib/tenant-context'
import { TenantSwitcher } from '@/components/admin/tenant-switcher'
import { ArrowRight, Building2, Settings, Users } from 'lucide-react'
import type { Metadata } from 'next'
import { TransferirOwnerForm } from './transferir-owner-form'

export const metadata: Metadata = { title: 'Torcidas — Super Admin' }

export default async function TorcidasPage() {
  const session = await auth()

  if (!session?.user?.email || !isSuperAdminEmail(session.user.email)) {
    redirect('/')
  }

  const [torcidas, tenantAtual, totalTenants] = await Promise.all([
    listarTorcidasParaSelecao(),
    getTenantFromHost(),
    db.tenant.count({ where: { ativo: true } }),
  ])

  const semProvisionamento = totalTenants <= 1

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Gerenciar torcidas</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Selecione a torcida no menu ao lado (ou abaixo) e você entra no painel administrativo
          dela — aprovar membros, eventos, comunicados, tudo isolado por torcida.
        </p>
      </div>

      {torcidas.length > 0 && (
        <div className="rounded-2xl border border-violet-800 bg-violet-950/40 p-6">
          <h2 className="text-sm font-semibold text-violet-200">Selecionar torcida</h2>
          <p className="mt-1 text-xs text-violet-300/80">
            {tenantAtual
              ? `Ativa agora: ${tenantAtual.nome}`
              : 'Nenhuma selecionada — escolha para abrir o admin.'}
          </p>
          <div className="mt-4">
            <TenantSwitcher
              torcidas={torcidas}
              torcidaAtualSlug={tenantAtual?.slug ?? null}
              destino="admin"
              variant="super-admin"
            />
          </div>
          {tenantAtual && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                <Settings className="h-4 w-4" />
                Abrir admin — {tenantAtual.nome}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/admin/membros"
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
              >
                <Users className="h-4 w-4" />
                Aprovar membros
              </Link>
            </div>
          )}
        </div>
      )}

      {semProvisionamento && (
        <div className="rounded-xl border border-amber-800 bg-amber-950/40 p-4 text-sm text-amber-200">
          <p className="font-semibold">Provisionar torcidas no banco</p>
          <p className="mt-1 text-amber-300/90">
            Rode o seed nacional para criar Camisa 12, Pavilhão Nove, Mancha Alviverde, etc.:
          </p>
          <code className="mt-2 block rounded bg-zinc-950 px-3 py-2 text-xs text-zinc-300">
            pnpm --filter @torcida/db seed:afiliacoes
            <br />
            pnpm --filter @torcida/db seed:torcidas-nacional
          </code>
        </div>
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
          <Building2 className="h-4 w-4" />
          {totalTenants} torcida(s) ativa(s)
        </h2>
        <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto text-sm text-zinc-400">
          {torcidas.map((t) => (
            <li key={t.id} className="flex justify-between gap-2 rounded px-2 py-1 hover:bg-zinc-800">
              <span className="truncate text-zinc-300">{t.nome}</span>
              <span className="shrink-0 font-mono text-xs text-zinc-500">{t.slug}</span>
            </li>
          ))}
        </ul>
      </div>

      <details className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <summary className="cursor-pointer text-sm font-medium text-zinc-300">
          Transferir propriedade (presidente)
        </summary>
        <p className="mt-2 text-xs text-zinc-500">
          Quando a diretoria estiver pronta, transfira o cargo owner para o e-mail do presidente.
        </p>
        {torcidas.slice(0, 5).map((t) => (
          <div key={t.id} className="mt-4 border-t border-zinc-800 pt-4 first:mt-2">
            <p className="mb-2 text-xs font-medium text-zinc-400">{t.nome}</p>
            <TransferirOwnerForm tenantId={t.id} ownerAtual={null} />
          </div>
        ))}
        {torcidas.length > 5 && (
          <p className="mt-2 text-xs text-zinc-600">+ {torcidas.length - 5} torcidas (use o admin de cada uma).</p>
        )}
      </details>
    </div>
  )
}
