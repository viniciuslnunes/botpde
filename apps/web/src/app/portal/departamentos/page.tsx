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
          Abra sua área de atuação. Financeiro, Patrimônio, Bateria e Caravanas têm
          módulo próprio; outras áreas usam Eventos, Loja ou Comunidade.
        </p>
      </div>

      <Suspense fallback={<DepartamentosFallback />}>
        <DepartamentosSection />
      </Suspense>
    </div>
  )
}
