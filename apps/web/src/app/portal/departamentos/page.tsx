import { Suspense } from 'react'
import type { Metadata } from 'next'
import {
  DepartamentosFallback,
  DepartamentosSection,
} from './_components/departamentos-lista'

export const metadata: Metadata = { title: 'Departamentos' }

export default function DepartamentosPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">Departamentos</h1>
        <p className="mt-0.5 text-sm text-[rgb(var(--foreground-muted))]">
          Escolha a área em que você atua. Caravanas, bateria, financeiro e demais
          módulos abrem a partir daqui — não pela barra superior.
        </p>
      </div>

      <Suspense fallback={<DepartamentosFallback />}>
        <DepartamentosSection />
      </Suspense>
    </div>
  )
}
