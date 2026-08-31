'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { CalendarRange, Plus, Repeat, Target, Users, Wallet } from 'lucide-react'
import {
  atualizarProjeto,
  atualizarStatusProjeto,
  abrirCampanhaDoAno,
  criarProjeto,
  registrarRealizadoProjeto,
  type ActionState,
} from '@/app/portal/departamentos/projetos-actions'
import {
  labelStatusProjeto,
  labelTipoProjeto,
  progressoMeta,
  saudeOrcamento,
  STATUS_PROJETO,
  STATUS_PROJETOS,
  TIPO_PROJETO,
  TIPOS_PROJETO,
} from '@torcida/types'
import { useActionStateToast, isRedirectError } from '@/lib/toast-action'
import { DatePicker } from '@/components/ui/date-picker'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { toast } from '@torcida/ui/services/toast'
import { classeFocoCard, useFocoCard } from '../../_components/departamento-foco'

/** Tudo já serializado no server — nunca `Decimal`/`Date` cruzando a fronteira. */
export type ProjetoResumo = {
  id: string
  titulo: string
  descricao: string | null
  tipo: string
  status: string
  areaId: string | null
  areaNome: string | null
  inicioIso: string
  fimIso: string | null
  inicioLabel: string
  fimLabel: string | null
  recorrenteAnual: boolean
  naJanela: boolean
  metaQuantidade: number | null
  metaUnidade: string | null
  realizadoQuantidade: number
  orcamentoPrevisto: number | null
  gastoRealizado: number
  responsavelNome: string | null
  participantes: number
  /** Próximos eventos da Agenda vinculados a este projeto. */
  eventos: Array<{ id: string; titulo: string; dataLabel: string }>
}

export type AreaOpcao = { id: string; nome: string }

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const numero = new Intl.NumberFormat('pt-BR')

const TOM_STATUS: Record<string, string> = {
  neutral: 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
  primary: 'bg-[rgb(var(--primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]',
  success: 'bg-[rgb(var(--color-success)_/_0.16)] text-[rgb(var(--color-success-fg))]',
  danger: 'bg-[rgb(var(--color-danger)_/_0.16)] text-[rgb(var(--color-danger-fg))]',
}

function StatusChip({ status }: { status: string }) {
  const tom = STATUS_PROJETO[status as keyof typeof STATUS_PROJETO]?.tom ?? 'neutral'
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TOM_STATUS[tom] ?? TOM_STATUS.neutral}`}
    >
      {labelStatusProjeto(status)}
    </span>
  )
}

function BarraProgresso({ percentual, alerta }: { percentual: number; alerta?: boolean }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-[rgb(var(--background-subtle))]"
      role="presentation"
    >
      <div
        className={
          alerta
            ? 'h-full rounded-full bg-[rgb(var(--color-danger-fg))]'
            : 'h-full rounded-full bg-[rgb(var(--primary))]'
        }
        style={{ width: `${Math.min(100, percentual)}%` }}
      />
    </div>
  )
}

export function DepartamentoProjetosBlock({
  departamentoId,
  slug,
  projetos,
  areas,
  podeGerir,
  areasSazonaisSemCampanha = [],
  focoProjetoId,
}: {
  departamentoId: string
  slug: string
  projetos: ProjetoResumo[]
  areas: AreaOpcao[]
  podeGerir: boolean
  /** Áreas sazonais ativas sem campanha do ano — CTA rápido. */
  areasSazonaisSemCampanha?: Array<{ id: string; nome: string }>
  /** Deep-link `?projeto=` — destaca o card. */
  focoProjetoId?: string
}) {
  const [criando, setCriando] = useState(false)
  const [areaFiltro, setAreaFiltro] = useState<string | null>(null)
  const [pendingCampanha, startCampanha] = useTransition()
  const ano = new Date().getFullYear()

  const visiveis = areaFiltro
    ? projetos.filter((p) => (areaFiltro === 'sem-area' ? !p.areaId : p.areaId === areaFiltro))
    : projetos

  async function abrirCampanhaArea(areaId: string, nome: string) {
    try {
      const res = await abrirCampanhaDoAno(departamentoId, areaId, slug)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`Campanha ${ano} aberta`, {
        description: `${nome} — ajuste meta e datas se precisar.`,
      })
    } catch (e) {
      if (isRedirectError(e)) throw e
      toast.error(e instanceof Error ? e.message : 'Não foi possível abrir')
    }
  }

  const atalhoSazonal =
    podeGerir && areasSazonaisSemCampanha.length > 0 ? (
      <div className="space-y-2 rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.5)] p-3">
        <p className="text-xs font-medium text-[rgb(var(--foreground))]">
          Abrir campanha {ano} a partir da área
        </p>
        <div className="flex flex-wrap gap-2">
          {areasSazonaisSemCampanha.map((a) => (
            <button
              key={a.id}
              type="button"
              disabled={pendingCampanha}
              onClick={() => startCampanha(() => abrirCampanhaArea(a.id, a.nome))}
              className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2.5 py-1.5 text-xs font-medium text-[rgb(var(--foreground))] hover:border-[rgb(var(--primary))] disabled:opacity-60"
            >
              <Target className="h-3 w-3" aria-hidden />
              {a.nome}
            </button>
          ))}
        </div>
      </div>
    ) : null

  if (projetos.length === 0) {
    return (
      <div>
        <MotionEmptyState
          icon={<Target className="mb-3 h-8 w-8 text-[rgb(var(--foreground-muted))]" />}
          title="Nenhum projeto cadastrado."
          description={
            podeGerir
              ? 'Campanhas, projetos contínuos, ações e parcerias do departamento — com meta, período e prestação de contas. Abra uma campanha sazonal ou cadastre o primeiro projeto.'
              : 'Quando o gestor cadastrar as campanhas e projetos do departamento, eles aparecem aqui.'
          }
        />
        {atalhoSazonal ? <div className="mt-4">{atalhoSazonal}</div> : null}
        {podeGerir && (
          <div className="mt-4 flex justify-center">
            {criando ? (
              <ProjetoForm
                departamentoId={departamentoId}
                slug={slug}
                areas={areas}
                onDone={() => setCriando(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setCriando(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Novo projeto
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  const temSemArea = projetos.some((p) => !p.areaId)

  return (
    <div className="space-y-4">
      {atalhoSazonal}

      {(areas.length > 0 || temSemArea) && (
        <div className="flex flex-wrap gap-1.5">
          <ChipFiltro ativo={areaFiltro === null} onClick={() => setAreaFiltro(null)}>
            Todos ({projetos.length})
          </ChipFiltro>
          {areas.map((a) => {
            const n = projetos.filter((p) => p.areaId === a.id).length
            if (n === 0) return null
            return (
              <ChipFiltro
                key={a.id}
                ativo={areaFiltro === a.id}
                onClick={() => setAreaFiltro(a.id)}
              >
                {a.nome} ({n})
              </ChipFiltro>
            )
          })}
          {temSemArea && (
            <ChipFiltro
              ativo={areaFiltro === 'sem-area'}
              onClick={() => setAreaFiltro('sem-area')}
            >
              Sem área ({projetos.filter((p) => !p.areaId).length})
            </ChipFiltro>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {visiveis.map((p) => (
          <ProjetoCard
            key={p.id}
            departamentoId={departamentoId}
            slug={slug}
            projeto={p}
            areas={areas}
            podeGerir={podeGerir}
            foco={p.id === focoProjetoId}
          />
        ))}
      </div>

      {visiveis.length === 0 && (
        <p className="rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-6 text-center text-sm text-[rgb(var(--foreground-muted))]">
          Nenhum projeto nesta área.
        </p>
      )}

      {podeGerir &&
        (criando ? (
          <ProjetoForm
            departamentoId={departamentoId}
            slug={slug}
            areas={areas}
            onDone={() => setCriando(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setCriando(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:border-[rgb(var(--primary))] hover:text-[rgb(var(--foreground))]"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Novo projeto
          </button>
        ))}
    </div>
  )
}

function ChipFiltro({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={
        ativo
          ? 'rounded-full bg-[rgb(var(--primary))] px-2.5 py-1 text-xs font-medium text-white'
          : 'rounded-full border border-[rgb(var(--border))] px-2.5 py-1 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]'
      }
    >
      {children}
    </button>
  )
}

function ProjetoCard({
  departamentoId,
  slug,
  projeto,
  areas,
  podeGerir,
  foco,
}: {
  departamentoId: string
  slug: string
  projeto: ProjetoResumo
  areas: AreaOpcao[]
  podeGerir: boolean
  foco: boolean
}) {
  const [editando, setEditando] = useState(false)
  const [registrando, setRegistrando] = useState(false)
  const [pending, startTransition] = useTransition()
  const focoRef = useFocoCard(foco)

  const meta = progressoMeta(projeto.realizadoQuantidade, projeto.metaQuantidade)
  const orcamento = saudeOrcamento(projeto.gastoRealizado, projeto.orcamentoPrevisto)

  function mudarStatus(status: string) {
    startTransition(async () => {
      const r = await atualizarStatusProjeto(departamentoId, projeto.id, slug, status)
      if (r.error) window.alert(r.error)
    })
  }

  if (editando) {
    return (
      <div className="sm:col-span-2">
        <ProjetoForm
          departamentoId={departamentoId}
          slug={slug}
          areas={areas}
          projeto={projeto}
          onDone={() => setEditando(false)}
        />
      </div>
    )
  }

  return (
    <div
      ref={focoRef}
      id={`projeto-${projeto.id}`}
      aria-current={foco ? 'true' : undefined}
      className={[
        'flex flex-col rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] p-4',
        classeFocoCard(foco),
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-sm font-semibold text-[rgb(var(--foreground))]">
              {projeto.titulo}
            </h3>
            <StatusChip status={projeto.status} />
            {projeto.naJanela && (
              <span className="rounded-full bg-[rgb(var(--color-warning)_/_0.16)] px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--color-warning-fg))]">
                Na janela
              </span>
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[rgb(var(--foreground-muted))]">
            <span>{labelTipoProjeto(projeto.tipo)}</span>
            {projeto.areaNome && <span>· {projeto.areaNome}</span>}
            {projeto.recorrenteAnual && (
              <span className="inline-flex items-center gap-1">
                · <Repeat className="h-3 w-3" aria-hidden /> anual
              </span>
            )}
          </p>
        </div>
      </div>

      {projeto.descricao && (
        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-[rgb(var(--foreground-muted))]">
          {projeto.descricao}
        </p>
      )}

      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[rgb(var(--foreground-muted))]">
        <CalendarRange className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {projeto.inicioLabel}
        {projeto.fimLabel ? ` até ${projeto.fimLabel}` : ' · contínuo'}
      </p>

      {projeto.eventos.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-[rgb(var(--border))] pt-2">
          {projeto.eventos.map((ev) => (
            <li key={ev.id}>
              <Link
                href={`/portal/eventos/${ev.id}`}
                className="flex items-center justify-between gap-2 text-[11px] text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--color-primary-fg))]"
              >
                <span className="truncate">{ev.titulo}</span>
                <span className="shrink-0 tabular-nums">{ev.dataLabel}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 space-y-2">
        {projeto.metaQuantidade != null && meta != null ? (
          <div>
            <p className="flex items-center justify-between text-[11px] text-[rgb(var(--foreground-muted))]">
              <span className="inline-flex items-center gap-1">
                <Target className="h-3.5 w-3.5" aria-hidden />
                {numero.format(projeto.realizadoQuantidade)} de{' '}
                {numero.format(projeto.metaQuantidade)}
                {projeto.metaUnidade ? ` ${projeto.metaUnidade}` : ''}
              </span>
              <span className="font-medium text-[rgb(var(--foreground))]">{meta}%</span>
            </p>
            <div className="mt-1">
              <BarraProgresso percentual={meta} />
            </div>
          </div>
        ) : (
          <p className="flex items-center gap-1 text-[11px] text-[rgb(var(--foreground-muted))]">
            <Target className="h-3.5 w-3.5" aria-hidden />
            Sem meta declarada
          </p>
        )}

        {orcamento ? (
          <div>
            <p className="flex items-center justify-between text-[11px] text-[rgb(var(--foreground-muted))]">
              <span className="inline-flex items-center gap-1">
                <Wallet className="h-3.5 w-3.5" aria-hidden />
                {moeda.format(projeto.gastoRealizado)} de{' '}
                {moeda.format(projeto.orcamentoPrevisto ?? 0)}
              </span>
              <span
                className={
                  orcamento.estourou
                    ? 'font-medium text-[rgb(var(--color-danger-fg))]'
                    : 'font-medium text-[rgb(var(--foreground))]'
                }
              >
                {orcamento.percentual}%
              </span>
            </p>
            <div className="mt-1">
              <BarraProgresso percentual={orcamento.percentual} alerta={orcamento.estourou} />
            </div>
          </div>
        ) : projeto.gastoRealizado > 0 ? (
          <p className="flex items-center gap-1 text-[11px] text-[rgb(var(--foreground-muted))]">
            <Wallet className="h-3.5 w-3.5" aria-hidden />
            {moeda.format(projeto.gastoRealizado)} lançados · sem orçamento previsto
          </p>
        ) : null}
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[rgb(var(--foreground-muted))]">
        {projeto.responsavelNome && <span>Responsável: {projeto.responsavelNome}</span>}
        <span className="inline-flex items-center gap-1">
          <Users className="h-3.5 w-3.5" aria-hidden />
          {projeto.participantes}{' '}
          {projeto.participantes === 1 ? 'voluntário' : 'voluntários'}
        </span>
      </p>

      {podeGerir && (
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="rounded-lg border border-[rgb(var(--border))] px-2.5 py-1 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
          >
            Editar
          </button>

          {projeto.metaQuantidade != null && (
            <button
              type="button"
              onClick={() => setRegistrando((v) => !v)}
              className="rounded-lg border border-[rgb(var(--border))] px-2.5 py-1 text-xs font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))]"
            >
              Registrar alcance
            </button>
          )}

          <label className="sr-only" htmlFor={`status-${projeto.id}`}>
            Status do projeto
          </label>
          <select
            id={`status-${projeto.id}`}
            value={projeto.status}
            disabled={pending}
            onChange={(e) => mudarStatus(e.target.value)}
            className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2 py-1 text-xs text-[rgb(var(--foreground))]"
          >
            {STATUS_PROJETOS.map((s) => (
              <option key={s} value={s}>
                {labelStatusProjeto(s)}
              </option>
            ))}
          </select>
        </div>
      )}

      {podeGerir && registrando && (
        <RealizadoForm
          departamentoId={departamentoId}
          slug={slug}
          projeto={projeto}
          onDone={() => setRegistrando(false)}
        />
      )}
    </div>
  )
}

function RealizadoForm({
  departamentoId,
  slug,
  projeto,
  onDone,
}: {
  departamentoId: string
  slug: string
  projeto: ProjetoResumo
  onDone: () => void
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    registrarRealizadoProjeto,
    {},
  )
  useActionStateToast(state, pending, 'Alcance atualizado.')
  useEffect(() => {
    if (state.ok) onDone()
  }, [state.ok, onDone])

  return (
    <form action={formAction} className="mt-3 flex items-end gap-2">
      <input type="hidden" name="departamentoId" value={departamentoId} />
      <input type="hidden" name="projetoId" value={projeto.id} />
      <input type="hidden" name="slug" value={slug} />
      <div className="flex-1">
        <label
          htmlFor={`realizado-${projeto.id}`}
          className="block text-[11px] font-medium text-[rgb(var(--foreground-muted))]"
        >
          {projeto.metaUnidade || 'Quantidade'} alcançada
        </label>
        <input
          id={`realizado-${projeto.id}`}
          name="realizado"
          type="number"
          min={0}
          defaultValue={projeto.realizadoQuantidade}
          className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2 py-1 text-sm text-[rgb(var(--foreground))]"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
      >
        Salvar
      </button>
      <button
        type="button"
        onClick={onDone}
        className="rounded-lg px-2 py-1.5 text-xs text-[rgb(var(--foreground-muted))]"
      >
        Cancelar
      </button>
    </form>
  )
}

function ProjetoForm({
  departamentoId,
  slug,
  areas,
  projeto,
  onDone,
}: {
  departamentoId: string
  slug: string
  areas: AreaOpcao[]
  projeto?: ProjetoResumo
  onDone: () => void
}) {
  const editando = Boolean(projeto)
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    editando ? atualizarProjeto : criarProjeto,
    {},
  )
  useActionStateToast(state, pending, editando ? 'Projeto salvo.' : 'Projeto criado.')
  useEffect(() => {
    if (state.ok) onDone()
  }, [state.ok, onDone])

  const campo =
    'mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2.5 py-1.5 text-sm text-[rgb(var(--foreground))]'
  const rotulo = 'block text-[11px] font-medium text-[rgb(var(--foreground-muted))]'

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] p-4"
    >
      <input type="hidden" name="departamentoId" value={departamentoId} />
      <input type="hidden" name="slug" value={slug} />
      {projeto && <input type="hidden" name="projetoId" value={projeto.id} />}

      <div>
        <label className={rotulo} htmlFor="titulo">
          Nome do projeto
        </label>
        <input
          id="titulo"
          name="titulo"
          required
          maxLength={120}
          defaultValue={projeto?.titulo ?? ''}
          placeholder="Campanha do Agasalho"
          className={campo}
        />
      </div>

      <div>
        <label className={rotulo} htmlFor="descricao">
          O que este projeto faz
        </label>
        <textarea
          id="descricao"
          name="descricao"
          rows={2}
          maxLength={2000}
          defaultValue={projeto?.descricao ?? ''}
          placeholder="Arrecadação e distribuição de roupas de frio, em conjunto com as subsedes."
          className={campo}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={rotulo} htmlFor="tipo">
            Tipo
          </label>
          <select id="tipo" name="tipo" defaultValue={projeto?.tipo ?? 'CAMPANHA'} className={campo}>
            {TIPOS_PROJETO.map((t) => (
              <option key={t} value={t}>
                {TIPO_PROJETO[t].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={rotulo} htmlFor="status">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={projeto?.status ?? 'PLANEJADO'}
            className={campo}
          >
            {STATUS_PROJETOS.map((s) => (
              <option key={s} value={s}>
                {labelStatusProjeto(s)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={rotulo} htmlFor="areaId">
            Área
          </label>
          <select id="areaId" name="areaId" defaultValue={projeto?.areaId ?? ''} className={campo}>
            <option value="">Departamento inteiro</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={rotulo} htmlFor="inicio">
            Início
          </label>
          <DatePicker
            id="inicio"
            name="inicio"
            required
            defaultValue={projeto?.inicioIso ?? ''}
            aria-label="Início do projeto"
            className="mt-1"
          />
        </div>
        <div>
          <label className={rotulo} htmlFor="fim">
            Término (vazio = contínuo)
          </label>
          <DatePicker
            id="fim"
            name="fim"
            defaultValue={projeto?.fimIso ?? ''}
            aria-label="Término do projeto"
            className="mt-1"
          />
        </div>
        <label className="flex items-end gap-2 pb-1.5 text-xs text-[rgb(var(--foreground-muted))]">
          <input
            type="checkbox"
            name="recorrenteAnual"
            defaultChecked={projeto?.recorrenteAnual ?? false}
            className="h-4 w-4"
          />
          Repete todo ano
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={rotulo} htmlFor="metaQuantidade">
            Meta (quantidade)
          </label>
          <input
            id="metaQuantidade"
            name="metaQuantidade"
            type="number"
            min={0}
            defaultValue={projeto?.metaQuantidade ?? ''}
            placeholder="10000"
            className={campo}
          />
        </div>
        <div>
          <label className={rotulo} htmlFor="metaUnidade">
            Unidade da meta
          </label>
          <input
            id="metaUnidade"
            name="metaUnidade"
            maxLength={40}
            defaultValue={projeto?.metaUnidade ?? ''}
            placeholder="pessoas atendidas"
            className={campo}
          />
        </div>
        <div>
          <label className={rotulo} htmlFor="orcamentoPrevisto">
            Orçamento previsto (R$)
          </label>
          <input
            id="orcamentoPrevisto"
            name="orcamentoPrevisto"
            type="number"
            min={0}
            step="0.01"
            defaultValue={projeto?.orcamentoPrevisto ?? ''}
            className={campo}
          />
        </div>
      </div>

      <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
        O gasto realizado vem dos lançamentos do Financeiro vinculados a este projeto — não é
        digitado aqui.
      </p>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {editando ? 'Salvar' : 'Criar projeto'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg px-3 py-1.5 text-sm text-[rgb(var(--foreground-muted))]"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
