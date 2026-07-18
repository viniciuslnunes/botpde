import { getTenantFromHost } from '@/lib/tenant'
import { TenantDesignBridge } from '@/components/tenant-design-bridge'
import { CriarContaForm } from './criar-conta-form'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Criar conta' }

export default async function CriarContaPage() {
  const tenant = await getTenantFromHost()
  const cor = tenant?.corPrimaria ?? '#7c3aed'

  return (
    <div className="app-shell-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-4">
      {tenant ? (
        <TenantDesignBridge corPrimaria={tenant.corPrimaria} design={tenant.design} />
      ) : null}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          background: `radial-gradient(ellipse 80% 60% at 50% -10%, ${cor}, transparent)`,
        }}
      />

      <div className="relative z-10 w-full max-w-sm">
        <Link
          href="/entrar"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>

        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-[rgb(var(--foreground))]">
            Criar conta
          </h1>
          <p className="mt-1.5 text-sm text-[rgb(var(--foreground-muted))]">
            Defina nome, @apelido, e-mail e senha pra começar
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-8 shadow-xl shadow-black/5">
          <CriarContaForm corPrimaria={cor} />
        </div>
      </div>
    </div>
  )
}
