import { Suspense, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, Shield } from 'lucide-react'
import {
  FinanceiroCaixaAside,
  FinanceiroCaixaSkeleton,
} from '../../_components/financeiro-caixa-aside'
import {
  PatrimonioInventarioAside,
  PatrimonioInventarioSkeleton,
} from '../../_components/patrimonio-inventario-aside'
import {
  BandeirasAcervoAside,
  BandeirasAcervoSkeleton,
} from '../../_components/bandeiras-acervo-aside'
import {
  CaravanasAgendaAside,
  CaravanasAgendaSkeleton,
} from '../../_components/caravanas-agenda-aside'
import {
  BateriaEnsaiosAside,
  BateriaEnsaiosSkeleton,
} from '../../_components/bateria-ensaios-aside'
import {
  DepartamentoThinAside,
  DepartamentoThinSkeleton,
} from '../../_components/departamento-thin-aside'
import {
  CarnavalBarracaoAside,
  CarnavalBarracaoSkeleton,
} from '../../_components/carnaval-barracao-aside'
import {
  DepartamentoDiretoriaKpis,
  type DiretoriaKpis,
} from '../../_components/departamento-diretoria-kpis'
import { DepartamentoCanalBlock } from '../../_components/departamento-canal-block'
import type { DeptoRow } from '../_lib/contexto'

export type SubareaAtalho = {
  id: string
  label: string
  href: string
}

export function DepartamentoDominioPanel({
  panel,
  depto,
  tenantId,
  isGestor,
  moduloHref,
  operacaoHref,
  podeVerFinanceiro,
  podeVerPatrimonio,
  podeVerAcervoBandeiras,
  podeVerCaravanas,
  podeVerBateria,
  podeVerPedidos,
  podeModerar,
  podeGerirFinanceiro,
  kpis,
  totalPendentes,
  carnavalProximos,
  atalhos,
  canal,
  canaisDisponiveis,
}: {
  panel: string
  depto: DeptoRow
  tenantId: string
  isGestor: boolean
  moduloHref: string | null
  operacaoHref: string | null
  podeVerFinanceiro: boolean
  podeVerPatrimonio: boolean
  podeVerAcervoBandeiras: boolean
  podeVerCaravanas: boolean
  podeVerBateria: boolean
  podeVerPedidos: boolean
  podeModerar: boolean
  podeGerirFinanceiro: boolean
  kpis: DiretoriaKpis | null
  totalPendentes: number
  carnavalProximos: number
  atalhos: SubareaAtalho[]
  canal: DeptoRow['canalConversa']
  canaisDisponiveis: Array<{ id: string; nome: string | null }>
}) {
  function renderDominio(): ReactNode {
    if (panel === 'financeiro') {
      return (
        <Suspense fallback={<FinanceiroCaixaSkeleton />}>
          <FinanceiroCaixaAside
            tenantId={tenantId}
            nome={depto.nome}
            isGestor={isGestor}
            moduloHref={moduloHref}
            operacaoHref={operacaoHref}
            podeVerFinanceiro={podeVerFinanceiro}
          />
        </Suspense>
      )
    }
    if (panel === 'patrimonio') {
      return (
        <Suspense fallback={<PatrimonioInventarioSkeleton />}>
          <PatrimonioInventarioAside
            tenantId={tenantId}
            nome={depto.nome}
            isGestor={isGestor}
            moduloHref={moduloHref}
            operacaoHref={operacaoHref}
            podeVerPatrimonio={podeVerPatrimonio}
          />
        </Suspense>
      )
    }
    if (panel === 'bandeiras') {
      return (
        <Suspense fallback={<BandeirasAcervoSkeleton />}>
          <BandeirasAcervoAside
            tenantId={tenantId}
            nome={depto.nome}
            isGestor={isGestor}
            moduloHref={moduloHref}
            operacaoHref={operacaoHref}
            podeVer={podeVerAcervoBandeiras}
          />
        </Suspense>
      )
    }
    if (panel === 'caravanas') {
      return (
        <Suspense fallback={<CaravanasAgendaSkeleton />}>
          <CaravanasAgendaAside
            tenantId={tenantId}
            nome={depto.nome}
            isGestor={isGestor}
            moduloHref={moduloHref}
            operacaoHref={operacaoHref}
            podeVer={podeVerCaravanas}
          />
        </Suspense>
      )
    }
    if (panel === 'bateria') {
      return (
        <Suspense fallback={<BateriaEnsaiosSkeleton />}>
          <BateriaEnsaiosAside
            tenantId={tenantId}
            departamentoId={depto.id}
            nome={depto.nome}
            isGestor={isGestor}
            moduloHref={moduloHref}
            operacaoHref={operacaoHref}
            podeVer={podeVerBateria}
          />
        </Suspense>
      )
    }
    if (panel === 'carnaval') {
      return (
        <Suspense fallback={<CarnavalBarracaoSkeleton />}>
          <CarnavalBarracaoAside
            departamentoId={depto.id}
            slug={depto.slug}
            nome={depto.nome}
            isGestor={isGestor}
            meta={depto.meta}
            proximosCount={carnavalProximos}
          />
        </Suspense>
      )
    }
    if (panel === 'diretoria') {
      return (
        <div className="space-y-4">
          {isGestor && kpis ? <DepartamentoDiretoriaKpis kpis={kpis} /> : null}
          <PainelDominio
            isGestor={isGestor}
            operacaoHref={operacaoHref}
            totalPendentes={totalPendentes}
          />
        </div>
      )
    }
    return (
      <Suspense fallback={<DepartamentoThinSkeleton />}>
        <DepartamentoThinAside
          tenantId={tenantId}
          slug={depto.slug}
          nome={depto.nome}
          departamentoId={depto.id}
          isGestor={isGestor}
          moduloHref={moduloHref}
          operacaoHref={operacaoHref}
          podeVerPedidos={podeVerPedidos}
          podeModerar={podeModerar}
          podeVerFinanceiro={podeVerFinanceiro}
          podeGerirFinanceiro={podeGerirFinanceiro}
        />
      </Suspense>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 space-y-4">{renderDominio()}</div>
      <aside className="space-y-4">
        {atalhos.length > 0 && (
          <nav
            aria-label="Atalhos do departamento"
            className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
          >
            <p className="text-xs font-semibold text-[rgb(var(--foreground-muted))]">Atalhos</p>
            <ul className="mt-2 space-y-1">
              {atalhos.map((a) => (
                <li key={a.id}>
                  <Link
                    href={a.href}
                    prefetch={a.href.startsWith('/admin') ? false : undefined}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                  >
                    {a.label}
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--foreground-muted))]" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <DepartamentoCanalBlock
          departamentoId={depto.id}
          slug={depto.slug}
          isGestor={isGestor}
          canal={canal}
          canaisDisponiveis={canaisDisponiveis}
        />
      </aside>
    </div>
  )
}

function PainelDominio({
  isGestor,
  operacaoHref,
  totalPendentes,
}: {
  isGestor: boolean
  operacaoHref: string | null
  totalPendentes: number
}) {
  return (
    <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Diretoria</h2>
      <p className="mt-2 text-sm text-[rgb(var(--foreground-muted))]">
        {isGestor
          ? totalPendentes > 0
            ? `${totalPendentes} solicitação${totalPendentes === 1 ? '' : 'ões'} na fila. Aprove ou reprove na aba Fila.`
            : 'Fila de solicitações neste departamento. Quando alguém pedir ingresso, aparece na aba Fila.'
          : 'Você é membro deste departamento. A gestão da Diretoria é feita pelos gestores.'}
      </p>
      {isGestor && operacaoHref && (
        <Link
          href={operacaoHref}
          prefetch={false}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
        >
          <Shield className="h-4 w-4 text-[rgb(var(--color-primary-fg))]" />
          Operação completa (admin)
        </Link>
      )}
    </div>
  )
}
