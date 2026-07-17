import Link from 'next/link'
import { ArrowRight, Shield, Wallet } from 'lucide-react'
import {
  formatarMoedaBRL,
  formatDataCompetenciaInput,
  CATEGORIA_FINANCEIRO_LABEL,
  TIPO_FINANCEIRO_LABEL,
} from '@torcida/types'
import { carregarPainelFinanceiro } from '@/lib/financeiro'
import { db } from '@torcida/db'
import { sincronizarCobrancasVencidas } from '@/lib/cobrancas'

export async function FinanceiroCaixaAside({
  tenantId,
  nome,
  isGestor,
  moduloHref,
  operacaoHref,
  podeVerFinanceiro,
}: {
  tenantId: string
  nome: string
  isGestor: boolean
  moduloHref: string | null
  operacaoHref: string | null
  podeVerFinanceiro: boolean
}) {
  if (!podeVerFinanceiro) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
            <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Caixa</h2>
          </div>
          <p className="mt-3 text-sm text-[rgb(var(--foreground-muted))]">
            Você faz parte de {nome}, mas não tem permissão para ver o livro-caixa. Peça
            <span className="font-medium text-[rgb(var(--foreground))]"> finance:view </span>
            ao gestor ou à Presidência.
          </p>
        </div>
        <Link
          href="/portal/cobrancas"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
        >
          Mensalidades
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    )
  }

  await sincronizarCobrancasVencidas(tenantId)

  type PlanoLite = { id: string; nome: string; valor: { toNumber(): number } | number }
  const [painel, planosAtivos, abertas, vencidas]: [
    Awaited<ReturnType<typeof carregarPainelFinanceiro>>,
    PlanoLite[],
    number,
    number,
  ] = await Promise.all([
    carregarPainelFinanceiro(tenantId, 5),
    db.planoAssociacao.findMany({
      where: { tenantId, ativo: true },
      orderBy: { nome: 'asc' },
      take: 5,
      select: { id: true, nome: true, valor: true },
    }),
    db.cobrancaAssociacao.count({
      where: { tenantId, status: { in: ['PENDENTE', 'VENCIDA'] } },
    }),
    db.cobrancaAssociacao.count({
      where: { tenantId, status: 'VENCIDA' },
    }),
  ])

  const { resumo, recentes } = painel

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Caixa</h2>
        </div>
        {resumo.quantidade > 0 ? (
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-[rgb(var(--foreground-muted))]">Receitas</dt>
              <dd className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatarMoedaBRL(resumo.totalReceitas)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[rgb(var(--foreground-muted))]">Despesas</dt>
              <dd className="font-semibold tabular-nums text-red-600 dark:text-red-400">
                {formatarMoedaBRL(resumo.totalDespesas)}
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-[rgb(var(--border))] pt-2">
              <dt className="font-medium text-[rgb(var(--foreground))]">Saldo</dt>
              <dd
                className={[
                  'font-bold tabular-nums',
                  resumo.saldo >= 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400',
                ].join(' ')}
              >
                {formatarMoedaBRL(resumo.saldo)}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-[rgb(var(--foreground-muted))]">
            Ainda sem lançamentos. Gestores registram o caixa no módulo Financeiro.
          </p>
        )}

        {recentes.length > 0 && (
          <ul className="mt-4 space-y-2 border-t border-[rgb(var(--border))] pt-3">
            {recentes.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-medium text-[rgb(var(--foreground))]">{l.descricao}</p>
                  <p className="text-[rgb(var(--foreground-muted))]">
                    {TIPO_FINANCEIRO_LABEL[l.tipo]} · {CATEGORIA_FINANCEIRO_LABEL[l.categoria]} ·{' '}
                    {formatDataCompetenciaInput(l.data).split('-').reverse().join('/')}
                  </p>
                </div>
                <span
                  className={[
                    'shrink-0 font-semibold tabular-nums',
                    l.tipo === 'RECEITA'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400',
                  ].join(' ')}
                >
                  {l.tipo === 'RECEITA' ? '+' : '−'}
                  {formatarMoedaBRL(Number(l.valor))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <h2 className="text-sm font-semibold text-[rgb(var(--foreground))]">Associação</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-[rgb(var(--foreground-muted))]">Cobranças abertas</dt>
            <dd className="font-semibold tabular-nums">{abertas}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[rgb(var(--foreground-muted))]">Vencidas</dt>
            <dd
              className={[
                'font-semibold tabular-nums',
                vencidas > 0 ? 'text-red-600 dark:text-red-400' : '',
              ].join(' ')}
            >
              {vencidas}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[rgb(var(--foreground-muted))]">Planos ativos</dt>
            <dd className="font-semibold tabular-nums">{planosAtivos.length}</dd>
          </div>
        </dl>
        {planosAtivos.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-[rgb(var(--border))] pt-3 text-xs">
            {planosAtivos.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span className="truncate text-[rgb(var(--foreground))]">{p.nome}</span>
                <span className="tabular-nums text-[rgb(var(--foreground-muted))]">
                  {formatarMoedaBRL(typeof p.valor === 'number' ? p.valor : p.valor.toNumber())}
                </span>
              </li>
            ))}
          </ul>
        )}
        {isGestor && (
          <Link
            href="/admin/planos-associacao"
            prefetch={false}
            className="mt-3 block text-xs font-medium text-[rgb(var(--primary))] hover:underline"
          >
            Gerir planos →
          </Link>
        )}
      </div>

      {moduloHref && (
        <Link
          href={moduloHref}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Abrir financeiro
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
      <Link
        href="/portal/cobrancas"
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
      >
        Mensalidades
        <ArrowRight className="h-4 w-4" />
      </Link>
      {isGestor && operacaoHref && (
        <Link
          href={operacaoHref}
          prefetch={false}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
        >
          <Shield className="h-4 w-4 text-[rgb(var(--primary))]" />
          Operação (admin)
        </Link>
      )}
    </div>
  )
}

export function FinanceiroCaixaSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <div className="h-4 w-20 rounded bg-[rgb(var(--border))]" />
        <div className="mt-4 space-y-2">
          <div className="h-4 w-full rounded bg-[rgb(var(--border))]" />
          <div className="h-4 w-full rounded bg-[rgb(var(--border))]" />
          <div className="h-4 w-2/3 rounded bg-[rgb(var(--border))]" />
        </div>
      </div>
      <div className="h-28 rounded-2xl bg-[rgb(var(--border))]" />
      <div className="h-10 rounded-lg bg-[rgb(var(--border))]" />
    </div>
  )
}
