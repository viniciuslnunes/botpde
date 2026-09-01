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
  podeGerirAcervoBandeiras,
  podeGerirPatrimonio,
  podeVerCaravanas,
  podeVerBateria,
  podeVerPedidos,
  podeModerar,
  podeGerirFinanceiro,
  kpis,
  temFila = false,
  totalPendentes,
  carnavalProximos,
  atalhos,
  canal,
  canaisDisponiveis,
  acervoPage,
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
  podeGerirAcervoBandeiras: boolean
  podeGerirPatrimonio: boolean
  podeVerCaravanas: boolean
  podeVerBateria: boolean
  podeVerPedidos: boolean
  podeModerar: boolean
  podeGerirFinanceiro: boolean
  kpis: DiretoriaKpis | null
  /** Aba Fila existe neste cockpit — só então o painel cita pendentes. */
  temFila?: boolean
  totalPendentes: number
  carnavalProximos: number
  atalhos: SubareaAtalho[]
  canal: DeptoRow['canalConversa']
  canaisDisponiveis: Array<{ id: string; nome: string | null }>
  acervoPage: number
}) {
  function renderDominio(): ReactNode {
    if (panel === 'financeiro') {
      if (!podeVerFinanceiro) {
        return (
          <Link
            href="/portal/cobrancas"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
          >
            Mensalidades
            <ArrowRight className="h-4 w-4" />
          </Link>
        )
      }
      return (
        <Suspense fallback={<FinanceiroCaixaSkeleton />}>
          <FinanceiroCaixaAside
            tenantId={tenantId}
            isGestor={isGestor}
            moduloHref={moduloHref}
            operacaoHref={operacaoHref}
          />
        </Suspense>
      )
    }
    if (panel === 'patrimonio') {
      if (!podeVerPatrimonio) return null
      return (
        <Suspense fallback={<PatrimonioInventarioSkeleton />}>
          <PatrimonioInventarioAside
            tenantId={tenantId}
            isGestor={isGestor}
            podeGerirAcervo={podeGerirPatrimonio}
            moduloHref={moduloHref}
            operacaoHref={operacaoHref}
            basePath={`/portal/departamentos/${depto.slug}`}
            page={acervoPage}
          />
        </Suspense>
      )
    }
    if (panel === 'bandeiras') {
      if (!podeVerAcervoBandeiras) return null
      return (
        <Suspense fallback={<BandeirasAcervoSkeleton />}>
          <BandeirasAcervoAside
            tenantId={tenantId}
            isGestor={isGestor}
            podeGerirAcervo={podeGerirAcervoBandeiras}
            moduloHref={moduloHref}
            operacaoHref={operacaoHref}
            basePath={`/portal/departamentos/${depto.slug}`}
          />
        </Suspense>
      )
    }
    if (panel === 'caravanas') {
      if (!podeVerCaravanas) return null
      return (
        <Suspense fallback={<CaravanasAgendaSkeleton />}>
          <CaravanasAgendaAside
            tenantId={tenantId}
            isGestor={isGestor}
            moduloHref={moduloHref}
            operacaoHref={operacaoHref}
          />
        </Suspense>
      )
    }
    if (panel === 'bateria') {
      if (!podeVerBateria) return null
      return (
        <Suspense fallback={<BateriaEnsaiosSkeleton />}>
          <BateriaEnsaiosAside
            tenantId={tenantId}
            departamentoId={depto.id}
            isGestor={isGestor}
            podeVerPatrimonio={podeVerPatrimonio}
            podeGerirAcervo={podeGerirPatrimonio}
            moduloHref={moduloHref}
            operacaoHref={operacaoHref}
            basePath={`/portal/departamentos/${depto.slug}`}
            page={acervoPage}
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
      if (!isGestor) return null
      if (!temFila && !operacaoHref) return null
      return (
        <div className="space-y-4">
          {temFila && kpis ? <DepartamentoDiretoriaKpis kpis={kpis} /> : null}
          {temFila ? (
            <PainelDominio operacaoHref={operacaoHref} totalPendentes={totalPendentes} />
          ) : operacaoHref ? (
            <Link
              href={operacaoHref}
              prefetch={false}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
            >
              <Shield className="h-4 w-4 text-[rgb(var(--color-primary-fg))]" />
              Operação completa (admin)
            </Link>
          ) : null}
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

  const dominio = renderDominio()
  const temAtalhos = atalhos.length > 0
  const temAside = temAtalhos || Boolean(canal) || isGestor
  if (!dominio && !temAside) return null

  return (
    <div className={dominio && temAside ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]' : undefined}>
      {dominio ? <div className="min-w-0 space-y-4">{dominio}</div> : null}
      {temAside ? (
        <aside className="space-y-4">
          {temAtalhos && (
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
      ) : null}
    </div>
  )
}

function PainelDominio({
  operacaoHref,
  totalPendentes,
}: {
  operacaoHref: string | null
  totalPendentes: number
}) {
  return (
    <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Diretoria</h2>
      <p className="mt-2 text-sm text-[rgb(var(--foreground-muted))]">
        {totalPendentes > 0
          ? `${totalPendentes} solicitação${totalPendentes === 1 ? '' : 'ões'} na fila. Aprove ou reprove na aba Fila.`
          : 'Fila de solicitações neste departamento. Quando alguém pedir ingresso, aparece na aba Fila.'}
      </p>
      {operacaoHref && (
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
