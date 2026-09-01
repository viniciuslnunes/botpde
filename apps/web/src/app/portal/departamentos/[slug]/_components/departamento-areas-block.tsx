'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { Archive, Check, Layers, ListChecks, Loader2, MessageCircle, Plus, RotateCcw, Star, Target, Trash2, UserMinus, UserPlus } from 'lucide-react'
import {
  adicionarMembroAreaDepartamento,
  adicionarChecklistItemArea,
  aplicarModeloChecklistArea,
  arquivarAreaDepartamento,
  atualizarAreaDepartamento,
  buscarCandidatosParaArea,
  criarAreaDepartamento,
  definirResponsavelArea,
  removerChecklistItemArea,
  removerMembroAreaDepartamento,
  toggleChecklistItemArea,
  vincularCanalDepartamentoArea,
  type ActionState,
} from '@/app/portal/departamentos/actions'
import { abrirCampanhaDoAno } from '@/app/portal/departamentos/projetos-actions'
import { isRedirectError, useActionStateToast } from '@/lib/toast-action'
import { useConfirmAction } from '@/lib/confirm-action'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { AvatarFoto } from '@/components/media/avatar-foto'
import type { AreaAcesso } from '@/lib/departamentos-portal-access'
import { toast } from '@torcida/ui/services/toast'
import { CanalDepartamentoAvatarField } from '../../_components/canal-departamento-avatar-field'
import { classeFocoCard, useFocoCard } from '../../_components/departamento-foco'
import {
  AREA_CHECKLIST_MODELOS,
  checklistItemsFromMeta,
  checklistProgress,
} from '@torcida/types'

export type AreaMembroResumo = {
  userId: string
  nome: string | null
  nickname: string | null
  avatarUrl: string | null
  papel: 'MEMBRO' | 'RESPONSAVEL'
}

export type AreaResumo = AreaAcesso & {
  /** Todos os vínculos da área — responsáveis primeiro. */
  membros: AreaMembroResumo[]
  /** Já existe Projeto CAMPANHA `{slug}-{anoAtual}` desta área. */
  campanhaAnoAberta: boolean
}

function rotuloPessoa(m: { nome: string | null; nickname: string | null }, fallback: string) {
  return m.nome?.trim() || (m.nickname ? `@${m.nickname}` : null) || fallback
}

function initials(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function Avatar({
  nome,
  avatarUrl,
  size = 7,
}: {
  nome: string
  avatarUrl: string | null
  size?: number
}) {
  const dim = `${size / 4}rem`
  if (avatarUrl) {
    return (
      <AvatarFoto
        src={avatarUrl}
        px={size * 4}
        className="shrink-0 rounded-full object-cover"
        style={{ width: dim, height: dim }}
      />
    )
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-[rgb(var(--primary)_/_0.15)] text-[10px] font-semibold text-[rgb(var(--color-primary-fg))]"
      style={{ width: dim, height: dim }}
    >
      {initials(nome)}
    </div>
  )
}

export function DepartamentoAreasBlock({
  departamentoId,
  slug,
  areas,
  podeGerir,
  canaisDisponiveis = [],
  focoAreaId,
}: {
  departamentoId: string
  slug: string
  areas: AreaResumo[]
  podeGerir: boolean
  canaisDisponiveis?: Array<{ id: string; nome: string | null }>
  /** Deep-link `?area=` — destaca o card e abre gente se faltar responsável. */
  focoAreaId?: string
}) {
  const [criando, setCriando] = useState(false)

  if (areas.length === 0) {
    return (
      <div>
        <MotionEmptyState
          icon={<Layers className="mb-3 h-8 w-8 text-[rgb(var(--foreground-muted))]" />}
          title="Este departamento ainda não organizou áreas."
          description={
            podeGerir
              ? 'Áreas agrupam gente e trabalho dentro do departamento (ex.: Campanha do Agasalho, Ensaios). Crie a primeira.'
              : 'Quando o gestor organizar as frentes de trabalho, elas aparecem aqui.'
          }
        />
        {podeGerir && (
          <div className="mt-4 flex justify-center">
            {criando ? (
              <DepartamentoAreaForm
                departamentoId={departamentoId}
                slug={slug}
                onDone={() => setCriando(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setCriando(true)}
                className="app-action inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-3 py-2 text-sm font-medium text-primary-on hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                Criar área
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {areas.map((area) => (
          <DepartamentoAreaCard
            key={area.id}
            departamentoId={departamentoId}
            slug={slug}
            area={area}
            podeGerir={podeGerir}
            canaisDisponiveis={canaisDisponiveis}
            foco={area.id === focoAreaId}
          />
        ))}
      </div>

      {podeGerir &&
        (criando ? (
          <DepartamentoAreaForm departamentoId={departamentoId} slug={slug} onDone={() => setCriando(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setCriando(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:border-[rgb(var(--primary))] hover:text-[rgb(var(--foreground))]"
          >
            <Plus className="h-4 w-4" />
            Nova área
          </button>
        ))}
    </div>
  )
}

export function DepartamentoAreaCriar({
  departamentoId,
  slug,
}: {
  departamentoId: string
  slug: string
}) {
  const [criando, setCriando] = useState(false)
  if (criando) {
    return <DepartamentoAreaForm departamentoId={departamentoId} slug={slug} onDone={() => setCriando(false)} />
  }
  return (
    <button
      type="button"
      onClick={() => setCriando(true)}
      className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:border-[rgb(var(--primary))] hover:text-[rgb(var(--foreground))]"
    >
      <Plus className="h-4 w-4" />
      Nova área
    </button>
  )
}

export function DepartamentoAreaCard({
  departamentoId,
  slug,
  area,
  podeGerir,
  canaisDisponiveis,
  foco,
}: {
  departamentoId: string
  slug: string
  area: AreaResumo
  podeGerir: boolean
  canaisDisponiveis: Array<{ id: string; nome: string | null }>
  foco: boolean
}) {
  const [editando, setEditando] = useState(false)
  const [gerindoPessoas, setGerindoPessoas] = useState(false)
  const [ultimoFoco, setUltimoFoco] = useState(false)
  const [checklistAberto, setChecklistAberto] = useState(false)
  const [pendingCampanha, startCampanha] = useTransition()
  const confirmAction = useConfirmAction()
  const responsaveis = area.membros.filter((m) => m.papel === 'RESPONSAVEL')
  if (foco !== ultimoFoco) {
    setUltimoFoco(foco)
    if (foco && podeGerir && responsaveis.length === 0) setGerindoPessoas(true)
  }
  const focoRef = useFocoCard(foco)
  const ano = new Date().getFullYear()
  const podeAbrirCampanha =
    podeGerir && area.ativa && area.sazonal && !area.campanhaAnoAberta
  const progress = checklistProgress(area.meta)
  const temChecklist = progress.total > 0
  const temModelo = Object.prototype.hasOwnProperty.call(AREA_CHECKLIST_MODELOS, area.slug)

  return (
    <div
      ref={focoRef}
      id={`area-${area.id}`}
      aria-current={foco ? 'true' : undefined}
      className={[
        'rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] p-4',
        area.ativa ? '' : 'opacity-60',
        classeFocoCard(foco),
      ].join(' ')}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3 className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">
            {area.nome}
          </h3>
          {area.sazonal && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              Sazonal
            </span>
          )}
          {area.isMembro && (
            <span className="rounded-full bg-[rgb(var(--primary)_/_0.12)] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--color-primary-fg))]">
              Você participa
            </span>
          )}
          {!area.ativa && (
            <span className="rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--foreground-muted))]">
              Inativa
            </span>
          )}
          {area.campanhaAnoAberta && (
            <span className="rounded-full bg-[rgb(var(--color-success)_/_0.14)] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--color-success-fg))]">
              Campanha {ano}
            </span>
          )}
          {temChecklist && (
            <span className="rounded-full bg-[rgb(var(--background-subtle))] px-2 py-0.5 text-[10px] font-medium tabular-nums text-[rgb(var(--foreground-muted))]">
              {progress.done}/{progress.total} checklist
            </span>
          )}
        </div>
        {area.descricao && (
          <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">{area.descricao}</p>
        )}
      </div>

      {podeAbrirCampanha && (
        <button
          type="button"
          disabled={pendingCampanha}
          onClick={() =>
            startCampanha(async () => {
              try {
                const res = await abrirCampanhaDoAno(departamentoId, area.id, slug)
                if (res.error) {
                  toast.error(res.error)
                  return
                }
                toast.success(`Campanha ${ano} aberta`, {
                  description: `${area.nome} — edite meta e datas em Projetos.`,
                })
              } catch (e) {
                if (isRedirectError(e)) throw e
                toast.error(e instanceof Error ? e.message : 'Não foi possível abrir')
              }
            })
          }
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-2.5 py-1.5 text-xs font-medium text-[rgb(var(--foreground))] transition-colors hover:border-[rgb(var(--primary))] disabled:opacity-60"
        >
          <Target className="h-3.5 w-3.5" aria-hidden />
          Abrir campanha {ano}
        </button>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {responsaveis.slice(0, 4).map((r) => (
            <Avatar key={r.userId} nome={rotuloPessoa(r, 'Responsável')} avatarUrl={r.avatarUrl} size={6} />
          ))}
          <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
            {area.membros.length} {area.membros.length === 1 ? 'pessoa' : 'pessoas'}
          </p>
        </div>

        {podeGerir && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setChecklistAberto((v) => !v)}
              className="app-action rounded-md p-1.5 text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
              title="Checklist da frente"
            >
              <ListChecks className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setGerindoPessoas((v) => !v)}
              className="app-action rounded-md p-1.5 text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
              title="Gerenciar pessoas"
            >
              <UserPlus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setEditando((v) => !v)}
              className="app-action rounded-md px-2 py-1 text-[11px] font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={() =>
                void confirmAction({
                  titulo: area.ativa ? `Arquivar ${area.nome}?` : `Reativar ${area.nome}?`,
                  descricao: area.ativa
                    ? 'A área fica inativa, mas nada é apagado — pode reativar depois.'
                    : 'A área volta a aparecer como ativa para o departamento.',
                  labelConfirmar: area.ativa ? 'Arquivar' : 'Reativar',
                  variante: area.ativa ? 'destructive' : 'success',
                  cancelled: false,
                  run: async () => {
                    const fd = new FormData()
                    fd.set('areaId', area.id)
                    fd.set('departamentoId', departamentoId)
                    fd.set('slug', slug)
                    fd.set('ativa', area.ativa ? 'false' : 'true')
                    return arquivarAreaDepartamento({}, fd)
                  },
                  success: area.ativa ? `${area.nome} arquivada` : `${area.nome} reativada`,
                })
              }
              className="app-action rounded-md p-1.5 text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
              title={area.ativa ? 'Arquivar área' : 'Reativar área'}
            >
              {area.ativa ? <Archive className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}
      </div>

      {editando && (
        <div className="mt-3 border-t border-[rgb(var(--border))] pt-3">
          <DepartamentoAreaForm
            departamentoId={departamentoId}
            slug={slug}
            area={area}
            onDone={() => setEditando(false)}
          />
        </div>
      )}

      {gerindoPessoas && (
        <div className="mt-3 border-t border-[rgb(var(--border))] pt-3">
          <AreaPessoasPainel departamentoId={departamentoId} slug={slug} area={area} />
        </div>
      )}

      {(checklistAberto || (!podeGerir && temChecklist)) && (
        <div className="mt-3 border-t border-[rgb(var(--border))] pt-3">
          <AreaChecklistPainel
            departamentoId={departamentoId}
            slug={slug}
            area={area}
            podeGerir={podeGerir}
            temModelo={temModelo}
          />
        </div>
      )}

      {(area.canalConversaId || podeGerir) && (
        <div className="mt-3 border-t border-[rgb(var(--border))] pt-3">
          <AreaCanalPainel
            departamentoId={departamentoId}
            slug={slug}
            area={area}
            podeGerir={podeGerir}
            canaisDisponiveis={canaisDisponiveis}
          />
        </div>
      )}
    </div>
  )
}

function AreaCanalPainel({
  departamentoId,
  slug,
  area,
  podeGerir,
  canaisDisponiveis,
}: {
  departamentoId: string
  slug: string
  area: AreaResumo
  podeGerir: boolean
  canaisDisponiveis: Array<{ id: string; nome: string | null }>
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const canalId = area.canalConversaId ?? null
  const nomeCanal = area.canalNome?.trim() || 'Canal da frente'

  if (canalId && !podeGerir) {
    return (
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Avatar
            nome={nomeCanal}
            avatarUrl={area.canalAvatarUrl ?? null}
            size={6}
          />
          <p className="truncate text-xs text-[rgb(var(--foreground))]">{nomeCanal}</p>
        </div>
        <Link
          href={`/portal/mensagens?c=${canalId}`}
          className="shrink-0 text-[11px] font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
        >
          Abrir
        </Link>
      </div>
    )
  }

  if (!podeGerir) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          <MessageCircle className="h-3.5 w-3.5" />
          Canal
        </p>
        {canalId && (
          <Link
            href={`/portal/mensagens?c=${canalId}`}
            className="text-[11px] font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
          >
            Abrir mensagens
          </Link>
        )}
      </div>
      <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
        Vincule um canal existente — não cria canal novo (evita spam).
      </p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          setError(null)
          startTransition(async () => {
            const res = await vincularCanalDepartamentoArea({}, fd)
            if (res.error) {
              setError(res.error)
              return
            }
            toast.success(fd.get('conversaId') === '__none__' ? 'Canal removido' : 'Canal vinculado')
          })
        }}
      >
        <input type="hidden" name="departamentoId" value={departamentoId} />
        <input type="hidden" name="areaId" value={area.id} />
        <input type="hidden" name="slug" value={slug} />
        <select
          name="conversaId"
          defaultValue={canalId ?? '__none__'}
          className="min-w-[10rem] flex-1 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2 py-1.5 text-xs"
        >
          <option value="__none__">Sem canal</option>
          {canaisDisponiveis.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome?.trim() || c.id.slice(0, 8)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-[rgb(var(--border))] px-2 py-1.5 text-xs font-medium hover:bg-[rgb(var(--background-subtle))] disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Salvar'}
        </button>
      </form>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {canalId ? (
        <CanalDepartamentoAvatarField
          conversaId={canalId}
          nome={nomeCanal}
          avatarUrl={area.canalAvatarUrl ?? null}
          slug={slug}
          compact
        />
      ) : null}
    </div>
  )
}

function AreaChecklistPainel({
  departamentoId,
  slug,
  area,
  podeGerir,
  temModelo,
}: {
  departamentoId: string
  slug: string
  area: AreaResumo
  podeGerir: boolean
  temModelo: boolean
}) {
  const items = checklistItemsFromMeta(area.meta)
  const progress = checklistProgress(area.meta)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [label, setLabel] = useState('')
  const confirmAction = useConfirmAction()

  function runFd(
    action: (prev: ActionState, fd: FormData) => Promise<ActionState>,
    extra: Record<string, string>,
    successMsg?: string,
  ) {
    const fd = new FormData()
    fd.set('departamentoId', departamentoId)
    fd.set('areaId', area.id)
    fd.set('slug', slug)
    for (const [k, v] of Object.entries(extra)) fd.set(k, v)
    startTransition(async () => {
      try {
        const res = await action({}, fd)
        if (res.error) toast.error(res.error)
        else if (successMsg) toast.success(successMsg)
      } catch (e) {
        if (isRedirectError(e)) throw e
        toast.error(e instanceof Error ? e.message : 'Falha na checklist')
      } finally {
        setPendingId(null)
      }
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Checklist
          {progress.total > 0 ? (
            <span className="ml-1.5 font-normal normal-case tabular-nums">
              {progress.done}/{progress.total}
            </span>
          ) : null}
        </p>
        {podeGerir && temModelo && (
          <button
            type="button"
            disabled={pending}
            onClick={() => runFd(aplicarModeloChecklistArea, {}, 'Modelo aplicado')}
            className="text-[11px] font-medium text-[rgb(var(--color-primary-fg))] hover:underline disabled:opacity-60"
          >
            Usar modelo
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-[rgb(var(--foreground-muted))]">
          {podeGerir
            ? temModelo
              ? 'Sem itens — use o modelo sugerido ou adicione à mão.'
              : 'Sem itens — adicione etapas desta frente (ex.: coleta, entrega).'
            : 'Nenhuma etapa cadastrada nesta frente.'}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => {
            const itemPending = pending && pendingId === item.id
            return (
              <li key={item.id} className="flex items-center gap-2 text-sm">
                {podeGerir ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setPendingId(item.id)
                      runFd(toggleChecklistItemArea, {
                        itemId: item.id,
                        done: item.done ? 'false' : 'true',
                      })
                    }}
                    className={[
                      'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border',
                      item.done
                        ? 'border-[rgb(var(--color-success)_/_0.4)] bg-[rgb(var(--color-success)_/_0.1)] text-[rgb(var(--color-success-fg))]'
                        : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))]',
                    ].join(' ')}
                    aria-label={item.done ? `Desmarcar ${item.label}` : `Marcar ${item.label}`}
                  >
                    {itemPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : item.done ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : null}
                  </button>
                ) : item.done ? (
                  <Check className="h-4 w-4 shrink-0 text-success" />
                ) : (
                  <span className="inline-block w-4 shrink-0 text-center text-[rgb(var(--foreground-muted))]">
                    —
                  </span>
                )}
                <span
                  className={
                    item.done
                      ? 'min-w-0 flex-1 text-[rgb(var(--foreground-muted))] line-through'
                      : 'min-w-0 flex-1 text-[rgb(var(--foreground))]'
                  }
                >
                  {item.label}
                </span>
                {podeGerir && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      void confirmAction({
                        titulo: `Remover “${item.label}”?`,
                        descricao: 'Só some da checklist desta área.',
                        labelConfirmar: 'Remover',
                        variante: 'destructive',
                        cancelled: false,
                        run: async () => {
                          const fd = new FormData()
                          fd.set('departamentoId', departamentoId)
                          fd.set('areaId', area.id)
                          fd.set('slug', slug)
                          fd.set('itemId', item.id)
                          return removerChecklistItemArea({}, fd)
                        },
                        success: 'Item removido',
                      })
                    }
                    className="rounded-md p-1 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--color-danger-fg))]"
                    aria-label={`Remover ${item.label}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {podeGerir && (
        <form
          className="flex gap-1.5 pt-1"
          onSubmit={(e) => {
            e.preventDefault()
            if (!label.trim()) return
            runFd(adicionarChecklistItemArea, { label: label.trim() }, 'Item adicionado')
            setLabel('')
          }}
        >
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={80}
            placeholder="Nova etapa…"
            className="min-w-0 flex-1 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-2 py-1.5 text-xs text-[rgb(var(--foreground))]"
          />
          <button
            type="submit"
            disabled={pending || label.trim().length < 2}
            className="inline-flex items-center gap-1 rounded-md bg-[rgb(var(--primary))] px-2 py-1.5 text-xs font-medium text-primary-on disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        </form>
      )}
    </div>
  )
}

export function DepartamentoAreaForm({
  departamentoId,
  slug,
  area,
  onDone,
}: {
  departamentoId: string
  slug: string
  area?: AreaResumo
  onDone: () => void
}) {
  const actionFn = area ? atualizarAreaDepartamento : criarAreaDepartamento
  const [state, action, pending] = useActionState(actionFn, {} as ActionState)
  useActionStateToast(state, pending, area ? 'Área atualizada' : 'Área criada', {
    onSuccess: onDone,
  })

  return (
    <form action={action} className="space-y-2">
      {area && <input type="hidden" name="areaId" value={area.id} />}
      <input type="hidden" name="departamentoId" value={departamentoId} />
      <input type="hidden" name="slug" value={slug} />
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Nome
        </span>
        <input
          type="text"
          name="nome"
          required
          minLength={2}
          maxLength={80}
          defaultValue={area?.nome}
          className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[rgb(var(--foreground-muted))]">
          Descrição (o que a área faz)
        </span>
        <textarea
          name="descricao"
          rows={2}
          maxLength={500}
          defaultValue={area?.descricao ?? ''}
          className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-[rgb(var(--foreground-muted))]">
        <input type="checkbox" name="sazonal" defaultChecked={area?.sazonal} className="h-3.5 w-3.5" />
        Sazonal (ativa em época do ano, ex.: Agasalho, Natal)
      </label>
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="app-action inline-flex items-center rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-xs font-medium text-primary-on disabled:opacity-50"
        >
          {area ? 'Salvar' : 'Criar área'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

function AreaPessoasPainel({
  departamentoId,
  slug,
  area,
}: {
  departamentoId: string
  slug: string
  area: AreaResumo
}) {
  const confirmAction = useConfirmAction()
  const [q, setQ] = useState('')
  /** Última busca concluída — o termo junto evita mostrar resultado de outro. */
  const [busca, setBusca] = useState<{
    termo: string
    itens: Array<{ id: string; nome: string | null; email: string; nickname: string | null }>
  }>({ termo: '', itens: [] })
  const [pendingSearch, startSearch] = useTransition()
  const qBusca = q.trim().length >= 2 ? q.trim() : ''
  const candidatos = busca.termo === qBusca ? busca.itens : []

  useEffect(() => {
    if (!qBusca) return
    let cancelled = false
    const t = setTimeout(() => {
      startSearch(() => {
        void buscarCandidatosParaArea(area.id, departamentoId, qBusca).then((rows) => {
          if (!cancelled) setBusca({ termo: qBusca, itens: rows })
        })
      })
    }, 280)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [qBusca, area.id, departamentoId])

  return (
    <div className="space-y-3">
      {area.membros.length === 0 ? (
        <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
          Ninguém nesta área ainda. Busque abaixo por quem já está no departamento.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {area.membros.map((m) => (
            <li key={m.userId} className="flex items-center gap-2">
              <Avatar nome={rotuloPessoa(m, 'Pessoa')} avatarUrl={m.avatarUrl} size={6} />
              <span className="min-w-0 flex-1 truncate text-xs text-[rgb(var(--foreground))]">
                {rotuloPessoa(m, 'Pessoa')}
              </span>
              <ResponsavelToggle
                departamentoId={departamentoId}
                slug={slug}
                area={area}
                membro={m}
              />
              <RemoverPessoaBotao
                departamentoId={departamentoId}
                slug={slug}
                area={area}
                targetUserId={m.userId}
                label={rotuloPessoa(m, 'Pessoa')}
                confirmAction={confirmAction}
              />
            </li>
          ))}
        </ul>
      )}

      <label className="block">
        <span className="sr-only">Buscar pessoa do departamento</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar pessoa já no departamento"
          className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-xs text-[rgb(var(--foreground))] outline-none focus:border-[rgb(var(--primary))]"
        />
      </label>
      {pendingSearch && qBusca && (
        <p className="text-[11px] text-[rgb(var(--foreground-muted))]">Buscando…</p>
      )}
      {!pendingSearch && qBusca && candidatos.length === 0 && (
        <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
          Ninguém do departamento encontrado para “{qBusca}”.
        </p>
      )}
      {candidatos.length > 0 && (
        <ul className="divide-y divide-[rgb(var(--border))] rounded-lg border border-[rgb(var(--border))]">
          {candidatos.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-2.5 py-1.5">
              <span className="min-w-0 flex-1 truncate text-xs text-[rgb(var(--foreground))]">
                {c.nome?.trim() || c.email}
              </span>
              <AdicionarPessoaBotao
                departamentoId={departamentoId}
                slug={slug}
                areaId={area.id}
                targetUserId={c.id}
                onDone={() =>
                  setBusca((prev) => ({
                    ...prev,
                    itens: prev.itens.filter((p) => p.id !== c.id),
                  }))
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ResponsavelToggle({
  departamentoId,
  slug,
  area,
  membro,
}: {
  departamentoId: string
  slug: string
  area: AreaResumo
  membro: AreaMembroResumo
}) {
  const isResponsavel = membro.papel === 'RESPONSAVEL'
  const [state, action, pending] = useActionState(definirResponsavelArea, {} as ActionState)
  useActionStateToast(
    state,
    pending,
    isResponsavel ? `${rotuloPessoa(membro, 'Pessoa')} virou membro` : `${rotuloPessoa(membro, 'Pessoa')} virou responsável`,
  )

  return (
    <form action={action}>
      <input type="hidden" name="areaId" value={area.id} />
      <input type="hidden" name="departamentoId" value={departamentoId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="targetUserId" value={membro.userId} />
      <input type="hidden" name="papel" value={isResponsavel ? 'MEMBRO' : 'RESPONSAVEL'} />
      <button
        type="submit"
        disabled={pending}
        className={[
          'app-action inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-50',
          isResponsavel
            ? 'bg-[rgb(var(--primary)_/_0.12)] text-[rgb(var(--color-primary-fg))]'
            : 'text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background-subtle))]',
        ].join(' ')}
        title={isResponsavel ? 'Tornar membro' : 'Tornar responsável'}
      >
        <Star className="h-3 w-3" fill={isResponsavel ? 'currentColor' : 'none'} />
        {isResponsavel ? 'Responsável' : 'Membro'}
      </button>
    </form>
  )
}

function AdicionarPessoaBotao({
  departamentoId,
  slug,
  areaId,
  targetUserId,
  onDone,
}: {
  departamentoId: string
  slug: string
  areaId: string
  targetUserId: string
  onDone: () => void
}) {
  const [state, action, pending] = useActionState(adicionarMembroAreaDepartamento, {} as ActionState)
  useActionStateToast(state, pending, 'Incluído na área', { onSuccess: onDone })

  return (
    <form action={action}>
      <input type="hidden" name="areaId" value={areaId} />
      <input type="hidden" name="departamentoId" value={departamentoId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="targetUserId" value={targetUserId} />
      <button
        type="submit"
        disabled={pending}
        className="app-action inline-flex items-center gap-1 rounded-lg bg-[rgb(var(--primary))] px-2 py-1 text-[11px] font-medium text-primary-on disabled:opacity-50"
      >
        <UserPlus className="h-3 w-3" />
        Incluir
      </button>
    </form>
  )
}

function RemoverPessoaBotao({
  departamentoId,
  slug,
  area,
  targetUserId,
  label,
  confirmAction,
}: {
  departamentoId: string
  slug: string
  area: AreaResumo
  targetUserId: string
  label: string
  confirmAction: ReturnType<typeof useConfirmAction>
}) {
  return (
    <button
      type="button"
      onClick={() =>
        void confirmAction({
          titulo: `Remover ${label} de ${area.nome}?`,
          descricao: 'A pessoa continua no departamento; só sai desta área.',
          labelConfirmar: 'Remover',
          variante: 'destructive',
          cancelled: false,
          run: async () => {
            const fd = new FormData()
            fd.set('areaId', area.id)
            fd.set('departamentoId', departamentoId)
            fd.set('slug', slug)
            fd.set('targetUserId', targetUserId)
            return removerMembroAreaDepartamento({}, fd)
          },
          success: `${label} removido de ${area.nome}`,
        })
      }
      className="app-action rounded-md p-1 text-[rgb(var(--foreground-muted))] hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
      title={`Remover ${label}`}
    >
      <UserMinus className="h-3.5 w-3.5" />
    </button>
  )
}
