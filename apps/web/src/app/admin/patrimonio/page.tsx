import { redirect } from 'next/navigation'
import { Landmark } from 'lucide-react'
import { assertPermission } from '@/lib/authz'
import { PERMISSIONS } from '@torcida/types'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Patrimônio — Admin' }

export default async function PatrimonioAdminPage() {
  try {
    await assertPermission(PERMISSIONS.PATRIMONY_MANAGE)
  } catch {
    redirect('/admin')
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <MotionReveal>
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-500/15 text-stone-700 dark:text-stone-300">
            <Landmark className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[rgb(var(--foreground))]">Patrimônio</h1>
            <p className="text-sm text-[rgb(var(--foreground-muted))]">
              Instrumentos, bandeirões e espaços físicos da sede.
            </p>
          </div>
        </div>
      </MotionReveal>

      <MotionEmptyState
        title="Módulo em construção"
        description="A área de patrimônio já está segregada no menu e no RBAC. Em breve: inventário e responsáveis por item."
      />
    </div>
  )
}
