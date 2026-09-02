import { redirect } from 'next/navigation'
import { assertPermission } from '@/lib/authz'
import { PERMISSIONS, resolveLojaVitrine } from '@torcida/types'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { LojaVitrineForm } from './loja-vitrine-form'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Vitrine — Loja Admin' }

export default async function AdminLojaVitrinePage() {
  let tenant: Awaited<ReturnType<typeof assertPermission>>['tenant']
  try {
    ;({ tenant } = await assertPermission(PERMISSIONS.STORE_MANAGE))
  } catch {
    redirect('/admin')
  }

  const vitrine = resolveLojaVitrine(tenant.design, tenant.corPrimaria)

  return (
    <div className="space-y-6">
      <p className="text-sm text-[rgb(var(--foreground-muted))]">
        Capa e hero do catálogo no portal desta unidade. Cores e logo da loja continuam em Design.
      </p>
      <MotionReveal>
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:p-6">
          <LojaVitrineForm
            key={`${vitrine.bannerUrl ?? ''}-${vitrine.usarDestaqueComoCapa}`}
            bannerUrl={vitrine.bannerUrl}
            usarDestaqueComoCapa={vitrine.usarDestaqueComoCapa}
            tenantId={tenant.id}
          />
        </div>
      </MotionReveal>

      <p className="text-xs text-[rgb(var(--foreground-muted))]">
        A Sede controla se a própria loja aparece nas unidades em{' '}
        <a
          href="/admin/configuracoes/transparencia?secao=unidades"
          className="font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
        >
          Transparência → Loja e agenda nas unidades
        </a>
        .
      </p>
    </div>
  )
}
