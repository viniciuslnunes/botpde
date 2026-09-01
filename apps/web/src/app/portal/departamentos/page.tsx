import { Suspense } from 'react'
import type { Metadata } from 'next'
import { PortalModuloHeader } from '@/components/portal/portal-modulo-header'
import {
  DepartamentosFallback,
  DepartamentosSection,
} from './_components/departamentos-lista'

export const metadata: Metadata = { title: 'Departamentos' }

export default function DepartamentosPage() {
  return (
    <div className="space-y-6">
      <PortalModuloHeader
        kicker="[ Áreas de atuação ]"
        title="Departamentos"
        description="Seus departamentos de atuação na torcida"
      />

      <Suspense fallback={<DepartamentosFallback />}>
        <DepartamentosSection />
      </Suspense>
    </div>
  )
}
