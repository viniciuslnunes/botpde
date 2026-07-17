import { Suspense } from 'react'
import type { Metadata } from 'next'
import { Briefcase } from 'lucide-react'
import {
  DepartamentosFallback,
  DepartamentosSection,
} from './_components/departamentos-lista'

export const metadata: Metadata = { title: 'Departamentos' }

export default function DepartamentosPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--primary)_/_0.12)] text-[rgb(var(--primary))]">
          <Briefcase className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Departamentos</h1>
          <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
            Seus departamentos de atuação na torcida
          </p>
        </div>
      </div>

      <Suspense fallback={<DepartamentosFallback />}>
        <DepartamentosSection />
      </Suspense>
    </div>
  )
}
