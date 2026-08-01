import { redirect } from 'next/navigation'
import {
  Beer,
  Building2,
  CalendarDays,
  Lock,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react'
import type { Metadata } from 'next'
import { db } from '@torcida/db'
import { formatarMoedaBRL, formatDataCompetenciaInput, formatNomeTorcida } from '@torcida/types'
import { assertPresidentePodeLerUnidade } from '@/lib/authz'
import { listarEventosDaUnidade, type EventoUnidadeItem } from '@/lib/eventos'
import { listarLancamentosFinanceiro, resumirFinanceiro } from '@/lib/financeiro'
import {
  listarMembrosDaUnidade,
  listarPostsDaUnidade,
  resumoBarDaUnidade,
  type BarVendaUnidadeItem,
  type MembroUnidadeItem,
  type PostUnidadeItem,
} from '@/lib/unidade-oversight'
import {
  parseFiltroFinanceiro,
  type FinanceiroSearchParams,
} from '@/lib/financeiro-filtros'
import {
  FinanceiroLancamentosLista,
  type LancamentoRow,
} from '@/components/financeiro/financeiro-lancamentos-lista'
import { FinanceiroResumoCards } from '@/components/financeiro/financeiro-resumo-cards'
import { MotionReveal } from '@/components/motion/motion-reveal'
import { AdminDetailHeader, AdminTabs, adminTabIds } from '@/components/admin/ui'

export const metadata: Metadata = { title: 'Administração da unidade — Visão da torcida' }

const ICONE_TAB = 'h-4 w-4 shrink-0'

type Props = {
  params: Promise<{ tenantId: string }>
  searchParams: Promise<FinanceiroSearchParams & { modulo?: string }>
}

const MODULOS = ['financeiro', 'agenda', 'bar', 'membros', 'comunidade'] as const
type ModuloUnidade = (typeof MODULOS)[number]

function parseModulo(valor: string | undefined): ModuloUnidade {
  return MODULOS.includes(valor as ModuloUnidade) ? (valor as ModuloUnidade) : 'financeiro'
}

/**
 * Drill-down READ-ONLY do Presidente (R1) sobre uma unidade descendente
 * (Caso B — tenant próprio). Gate `assertPresidentePodeLerUnidade` garante no
 * SERVIDOR que o alvo é da árvore da Sede; nenhuma ação de mutação é montada
 * (loaders read-only + `podeGerir={false}`), e a própria action de mutação da
 * unidade re-checaria a permissão no tenant-filho (dupla camada). MVP: módulo
 * Financeiro. Eventos / Bar / Membros (com PII mascarada) entram na sequência.
 */
export default async function UnidadeAdminPage({ params, searchParams }: Props) {
  const { tenantId } = await params

  try {
    await assertPresidentePodeLerUnidade(tenantId)
  } catch {
    redirect('/admin/torcida')
  }

  const unidade: { nome: string } | null = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { nome: true },
  })
  if (!unidade) redirect('/admin/torcida')

  const sp = await searchParams
  const modulo = parseModulo(sp.modulo)
  const { filtro, values } = parseFiltroFinanceiro(sp)
  const filtroResumo = { ...filtro }
  delete filtroResumo.page

  const basePath = `/admin/torcida/unidade/${tenantId}`

  // Só a aba visível consulta o banco: antes eram 5 leituras por render, mesmo
  // com o Presidente olhando um módulo só.
  const [resumo, lista] =
    modulo === 'financeiro'
      ? await Promise.all([
          resumirFinanceiro(tenantId, filtroResumo),
          listarLancamentosFinanceiro(tenantId, { filtro }),
        ])
      : [null, null]
  const eventos: EventoUnidadeItem[] =
    modulo === 'agenda' ? await listarEventosDaUnidade(tenantId) : []
  const bar = modulo === 'bar' ? await resumoBarDaUnidade(tenantId) : null
  const membros = modulo === 'membros' ? await listarMembrosDaUnidade(tenantId) : null
  const comunidade = modulo === 'comunidade' ? await listarPostsDaUnidade(tenantId) : null

  const itens: LancamentoRow[] = (lista?.itens ?? []).map((l) => ({
    id: l.id,
    tipo: l.tipo,
    categoria: l.categoria,
    valor: Number(l.valor),
    descricao: l.descricao,
    data: formatDataCompetenciaInput(l.data),
    observacao: l.observacao,
    criadoPorNome: l.criadoPor.nome,
  }))

  const { tabId, panelId } = adminTabIds('modulo', modulo)

  return (
    <div className="space-y-6">
      <AdminDetailHeader
        title={formatNomeTorcida(unidade.nome)}
        eyebrow="Administração da unidade"
        backHref="/admin/torcida"
        backLabel="Visão da torcida"
        icon={<Building2 className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2">
            <Lock className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
            <span className="text-xs text-[rgb(var(--foreground-muted))]">
              Somente leitura — a operação é da liderança da unidade
            </span>
          </div>
        }
      />

      <AdminTabs
        tabs={[
          { id: 'financeiro', label: 'Financeiro', icon: <Wallet className={ICONE_TAB} /> },
          { id: 'agenda', label: 'Agenda', icon: <CalendarDays className={ICONE_TAB} /> },
          { id: 'bar', label: 'Bar', icon: <Beer className={ICONE_TAB} /> },
          { id: 'membros', label: 'Membros', icon: <Users className={ICONE_TAB} /> },
          { id: 'comunidade', label: 'Comunidade', icon: <MessageSquare className={ICONE_TAB} /> },
        ]}
        basePath={basePath}
        activeId={modulo}
        paramKey="modulo"
      />

      <div id={panelId} role="tabpanel" aria-labelledby={tabId} className="space-y-6">
      {modulo === 'financeiro' && resumo && lista && (
      <MotionReveal>
        <section className="space-y-4">
          <FinanceiroResumoCards
            totalReceitas={resumo.totalReceitas}
            totalDespesas={resumo.totalDespesas}
            saldo={resumo.saldo}
          />

          <FinanceiroLancamentosLista
            itens={itens}
            podeGerir={false}
            total={lista.total}
            page={lista.page}
            pageSize={lista.pageSize}
            basePath={basePath}
            query={{ ...values, modulo }}
          />
        </section>
      </MotionReveal>
      )}

      {modulo === 'agenda' && (
      <MotionReveal>
        <section className="space-y-4">
          {eventos.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-8 text-center text-sm text-[rgb(var(--foreground-muted))]">
              Esta unidade ainda não tem eventos na agenda.
            </p>
          ) : (
            <ul className="divide-y divide-[rgb(var(--border))] rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
              {eventos.map((ev) => (
                <EventoLinha key={ev.id} ev={ev} />
              ))}
            </ul>
          )}
        </section>
      </MotionReveal>
      )}

      {modulo === 'bar' && bar && (
      <MotionReveal>
        <section className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Vendido (pago)
              </p>
              <p className="mt-1 text-xl font-bold text-[rgb(var(--foreground))]">
                {formatarMoedaBRL(bar.totalVendido)}
              </p>
            </div>
            <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                Vendas pagas
              </p>
              <p className="mt-1 text-xl font-bold text-[rgb(var(--foreground))]">{bar.qtdVendas}</p>
            </div>
          </div>

          {bar.recentes.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-8 text-center text-sm text-[rgb(var(--foreground-muted))]">
              Sem vendas registradas no bar desta unidade.
            </p>
          ) : (
            <ul className="divide-y divide-[rgb(var(--border))] rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
              {bar.recentes.map((v) => (
                <BarLinha key={v.id} v={v} />
              ))}
            </ul>
          )}
        </section>
      </MotionReveal>
      )}

      {modulo === 'membros' && membros && (
      <MotionReveal>
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-[rgb(var(--foreground))]">
              {membros.total} membro{membros.total === 1 ? '' : 's'}
            </p>
            <span className="inline-flex items-center gap-1 text-xs text-[rgb(var(--foreground-muted))]">
              <ShieldCheck className="h-3.5 w-3.5" />
              RG/CPF e endereço ocultos (LGE)
            </span>
          </div>

          {membros.itens.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-8 text-center text-sm text-[rgb(var(--foreground-muted))]">
              Esta unidade ainda não tem membros.
            </p>
          ) : (
            <ul className="divide-y divide-[rgb(var(--border))] rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
              {membros.itens.map((m) => (
                <MembroLinha key={m.id} m={m} />
              ))}
            </ul>
          )}
        </section>
      </MotionReveal>
      )}

      {modulo === 'comunidade' && comunidade && (
      <MotionReveal>
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-[rgb(var(--foreground))]">
              {comunidade.total} publicaç{comunidade.total === 1 ? 'ão' : 'ões'}
            </p>
            <span className="inline-flex items-center gap-1 text-xs text-[rgb(var(--foreground-muted))]">
              <Lock className="h-3.5 w-3.5" />
              Acompanhamento — sem publicar, reagir ou comentar
            </span>
          </div>

          {comunidade.itens.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-8 text-center text-sm text-[rgb(var(--foreground-muted))]">
              Esta unidade ainda não tem publicações.
            </p>
          ) : (
            <ul className="divide-y divide-[rgb(var(--border))] rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
              {comunidade.itens.map((p) => (
                <PostLinha key={p.id} p={p} />
              ))}
            </ul>
          )}
        </section>
      </MotionReveal>
      )}
      </div>
    </div>
  )
}

function PostLinha({ p }: { p: PostUnidadeItem }) {
  return (
    <li className="px-4 py-3">
      <p className="line-clamp-3 whitespace-pre-wrap text-sm text-[rgb(var(--foreground))]">
        {p.conteudo}
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[rgb(var(--foreground-muted))]">
        <span>{p.autorNome ?? 'Autor removido'}</span>
        <span>·</span>
        <span>{dtFmt.format(p.criadoEm)}</span>
        <span className="rounded bg-[rgb(var(--background-subtle))] px-1.5 py-0.5 text-[10px] font-semibold">
          {p.visibilidade}
        </span>
        {p.oculto && (
          <span className="rounded bg-[rgb(var(--foreground)_/_0.08)] px-1.5 py-0.5 text-[10px] font-semibold">
            Oculto
          </span>
        )}
        <span>·</span>
        <span>
          {p.totalReacoes} reaç{p.totalReacoes === 1 ? 'ão' : 'ões'} · {p.totalComentarios}{' '}
          coment{p.totalComentarios === 1 ? 'ário' : 'ários'}
        </span>
      </p>
    </li>
  )
}

const TIPO_EVENTO_LABEL: Record<string, string> = {
  GERAL: 'Evento',
  CARAVANA: 'Caravana',
  ENSAIO: 'Ensaio',
  REUNIAO: 'Reunião',
  JOGO: 'Jogo',
}

const dtFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

function EventoLinha({ ev }: { ev: EventoUnidadeItem }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">{ev.titulo}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[rgb(var(--foreground-muted))]">
          <span>{dtFmt.format(ev.data)}</span>
          <span className="rounded bg-[rgb(var(--background-subtle))] px-1.5 py-0.5 text-[10px] font-semibold">
            {TIPO_EVENTO_LABEL[ev.tipo] ?? ev.tipo}
          </span>
          {ev.local && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {ev.local}
            </span>
          )}
        </p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-[rgb(var(--foreground-muted))]">
        <Users className="h-3.5 w-3.5" />
        {ev.rsvps}
      </span>
    </li>
  )
}

const METODO_BAR_LABEL: Record<string, string> = {
  PIX: 'PIX',
  DINHEIRO: 'Dinheiro',
  CARTAO: 'Cartão',
  CARTAO_CREDITO: 'Crédito',
  CARTAO_DEBITO: 'Débito',
}

function BarLinha({ v }: { v: BarVendaUnidadeItem }) {
  const paga = v.status === 'PAGA'
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">
          {formatarMoedaBRL(v.total)}
          <span className="ml-1.5 text-xs font-normal text-[rgb(var(--foreground-muted))]">
            {METODO_BAR_LABEL[v.metodoPagamento] ?? v.metodoPagamento}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
          {dtFmt.format(v.criadoEm)}
          {v.operadorNome ? ` · ${v.operadorNome}` : ''}
          {` · ${v.unidadeNome}`}
        </p>
      </div>
      <span
        className={[
          'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
          paga
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
            : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
        ].join(' ')}
      >
        {v.status}
      </span>
    </li>
  )
}

const TIPO_MEMBRO_LABEL: Record<string, string> = { SOCIO: 'Sócio', TORCEDOR: 'Torcedor' }

function MembroLinha({ m }: { m: MembroUnidadeItem }) {
  const aprovado = m.status === 'APROVADO'
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[rgb(var(--foreground))]">{m.nome}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[rgb(var(--foreground-muted))]">
          <span>{TIPO_MEMBRO_LABEL[m.tipo] ?? m.tipo}</span>
          {m.numeroAssociado && <span>nº {m.numeroAssociado}</span>}
          {m.cidade && <span>{m.cidade}</span>}
        </p>
      </div>
      <span
        className={[
          'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
          aprovado
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
            : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
        ].join(' ')}
      >
        {m.status}
      </span>
    </li>
  )
}
