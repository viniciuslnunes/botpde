'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { AlertTriangle, Loader2, X } from 'lucide-react'
import {
  CATEGORIAS_REPROVACAO,
  MOTIVO_REPROVACAO_MAX,
  MOTIVO_REPROVACAO_MIN,
  PONTOS_REPROVACAO,
  categoriaExigePontos,
} from '@torcida/types'
import { lightboxBackdrop, lightboxContent, springGentle } from '@/lib/motion-presets'
import { runPersistAction } from '@/lib/toast-action'
import type { ReprovarMembroInput } from '@/app/admin/membros/actions'

type PontoCatalogo = {
  id: string
  label: string
  grupo: string
  tab: string
  soSocio: boolean
}

const CATEGORIA_PADRAO = 'DADOS_INCORRETOS'

interface ReprovarMembroDialogProps {
  aberto: boolean
  nomeMembro?: string | null
  /** Torcedor não preenche LGE nem envia anexos — esconde esses pontos. */
  isSocio?: boolean
  /** Etapas já detectadas como incompletas; vêm pré-marcadas. */
  pontosSugeridos?: string[]
  /** Aviso extra quando a decisão vale para Sede e unidade de origem. */
  avisoEspelho?: string | null
  /** `members:block`. Sem ela o bloqueio nem aparece — o servidor revalida. */
  podeBloquear?: boolean
  onFechar: () => void
  reprovar: (input: ReprovarMembroInput) => Promise<unknown>
}

/**
 * Quem renderiza troca a `key` ao abrir, então o estado nasce do zero a cada
 * análise — já com as pendências do checklist marcadas, sem efeito de reset.
 */
export function ReprovarMembroDialog({
  aberto,
  nomeMembro,
  isSocio = true,
  pontosSugeridos,
  avisoEspelho,
  podeBloquear = false,
  onFechar,
  reprovar,
}: ReprovarMembroDialogProps) {
  const [categoria, setCategoria] = useState(CATEGORIA_PADRAO)
  const [motivo, setMotivo] = useState('')
  const [pontos, setPontos] = useState<string[]>(() => pontosSugeridos ?? [])
  const [permiteReenvio, setPermiteReenvio] = useState(true)
  const [bloquear, setBloquear] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [tentouEnviar, setTentouEnviar] = useState(false)

  // Captura antes do listener de Escape do modal de detalhes — fechar o
  // diálogo não pode derrubar o card por baixo (e perder o rascunho).
  useEffect(() => {
    if (!aberto) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onFechar()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [aberto, onFechar])

  const grupos = useMemo(() => {
    const disponiveis = (PONTOS_REPROVACAO as PontoCatalogo[]).filter(
      (p) => isSocio || !p.soSocio,
    )
    const mapa = new Map<string, PontoCatalogo[]>()
    for (const ponto of disponiveis) {
      const atual = mapa.get(ponto.grupo)
      if (atual) atual.push(ponto)
      else mapa.set(ponto.grupo, [ponto])
    }
    return [...mapa.entries()]
  }, [isSocio])

  const exigePontos = categoriaExigePontos(categoria)
  const motivoCurto = motivo.trim().length < MOTIVO_REPROVACAO_MIN
  const faltamPontos = exigePontos && pontos.length === 0
  const podeEnviar = !motivoCurto && !faltamPontos && !enviando

  function alternarPonto(id: string) {
    setPontos((atual) =>
      atual.includes(id) ? atual.filter((p) => p !== id) : [...atual, id],
    )
  }

  async function handleConfirmar() {
    setTentouEnviar(true)
    if (motivoCurto || faltamPontos) return
    setEnviando(true)
    try {
      const ok = await runPersistAction(
        () =>
          reprovar({
            categoria,
            motivo: motivo.trim(),
            pontos,
            permiteReenvio,
            bloquear: podeBloquear && bloquear,
          }),
        {
          success: 'Reprovação registrada.',
          successDescription:
            podeBloquear && bloquear
              ? 'A pessoa foi avisada e ficou bloqueada nesta unidade.'
              : permiteReenvio
                ? 'A pessoa foi avisada e pode corrigir o cadastro.'
                : 'A pessoa foi avisada. O reenvio ficou bloqueado.',
          errorFallback: 'Não foi possível registrar a reprovação.',
        },
      )
      if (ok) onFechar()
    } finally {
      setEnviando(false)
    }
  }

  return (
    <AnimatePresence>
      {aberto && (
        <m.div
          variants={lightboxBackdrop}
          initial="hidden"
          animate="show"
          exit="exit"
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 text-left sm:items-center sm:p-4"
          role="presentation"
          onClick={onFechar}
        >
          <m.div
            variants={lightboxContent}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={springGentle}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reprovar-membro-titulo"
            className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[rgb(var(--border))] px-4 py-4 sm:px-5">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
                  <AlertTriangle className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h2
                    id="reprovar-membro-titulo"
                    className="text-base font-semibold text-[rgb(var(--foreground))]"
                  >
                    Reprovar solicitação
                  </h2>
                  <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                    {nomeMembro ? `${nomeMembro} · ` : ''}
                    A justificativa fica registrada na auditoria e é enviada à pessoa.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onFechar}
                aria-label="Fechar"
                className="shrink-0 rounded-lg p-1.5 text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
              {avisoEspelho && (
                <p className="rounded-lg bg-[rgb(var(--background-subtle))] px-3 py-2 text-xs text-[rgb(var(--foreground-muted))]">
                  {avisoEspelho}
                </p>
              )}

              <div className="space-y-1.5">
                <label
                  htmlFor="reprovar-categoria"
                  className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]"
                >
                  Tipo de problema
                </label>
                <select
                  id="reprovar-categoria"
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
                >
                  {CATEGORIAS_REPROVACAO.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-[rgb(var(--foreground-muted))]">
                  {CATEGORIAS_REPROVACAO.find((c) => c.id === categoria)?.descricao}
                </p>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                  Onde está o erro
                  {exigePontos ? (
                    <span className="text-red-600 dark:text-red-400"> *</span>
                  ) : (
                    <span className="font-normal normal-case tracking-normal">
                      {' '}
                      · opcional
                    </span>
                  )}
                </legend>
                <p className="text-xs text-[rgb(var(--foreground-muted))]">
                  As etapas marcadas aparecem em vermelho no cadastro, para o admin e para
                  quem for corrigir.
                </p>
                <div className="space-y-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle)_/_0.55)] p-3">
                  {grupos.map(([grupo, itens]) => (
                    <div key={grupo}>
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                        {grupo}
                      </p>
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {itens.map((ponto) => {
                          const marcado = pontos.includes(ponto.id)
                          return (
                            <label
                              key={ponto.id}
                              className={[
                                'flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors',
                                marcado
                                  ? 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200'
                                  : 'text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]',
                              ].join(' ')}
                            >
                              <input
                                type="checkbox"
                                checked={marcado}
                                onChange={() => alternarPonto(ponto.id)}
                                className="mt-0.5 h-4 w-4 shrink-0 accent-red-600"
                              />
                              <span>{ponto.label}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {tentouEnviar && faltamPontos && (
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">
                    Aponte ao menos uma etapa do cadastro com problema.
                  </p>
                )}
              </fieldset>

              <div className="space-y-1.5">
                <label
                  htmlFor="reprovar-motivo"
                  className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]"
                >
                  Justificativa <span className="text-red-600 dark:text-red-400">*</span>
                </label>
                <textarea
                  id="reprovar-motivo"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value.slice(0, MOTIVO_REPROVACAO_MAX))}
                  rows={4}
                  placeholder="Ex.: A foto do RG está cortada e o CPF informado não confere com o documento enviado."
                  className="w-full resize-y rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] placeholder-[rgb(var(--foreground-muted))] outline-none focus:border-[rgb(var(--primary))]"
                />
                <div className="flex items-baseline justify-between gap-2">
                  <p
                    className={[
                      'text-xs',
                      tentouEnviar && motivoCurto
                        ? 'font-medium text-red-600 dark:text-red-400'
                        : 'text-[rgb(var(--foreground-muted))]',
                    ].join(' ')}
                  >
                    Mínimo de {MOTIVO_REPROVACAO_MIN} caracteres. Esse texto vai na
                    notificação.
                  </p>
                  <span className="shrink-0 text-xs text-[rgb(var(--foreground-muted))]">
                    {motivo.trim().length}/{MOTIVO_REPROVACAO_MAX}
                  </span>
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-[rgb(var(--border))] px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={permiteReenvio}
                  onChange={(e) => setPermiteReenvio(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span className="text-sm text-[rgb(var(--foreground))]">
                  Permitir correção e reenvio
                  <span className="mt-0.5 block text-xs text-[rgb(var(--foreground-muted))]">
                    {permiteReenvio
                      ? 'A pessoa pode ajustar o cadastro e voltar para a fila.'
                      : 'Reprovação definitiva: o reenvio fica bloqueado até um admin reverter para pendente.'}
                  </span>
                </span>
              </label>

              {podeBloquear && (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-[rgb(var(--border))] px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={bloquear}
                    onChange={(e) => setBloquear(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span className="text-sm text-[rgb(var(--foreground))]">
                    Bloquear novas solicitações nesta unidade
                    <span className="mt-0.5 block text-xs text-[rgb(var(--foreground-muted))]">
                      {bloquear
                        ? 'A pessoa não consegue mais se cadastrar aqui nem nas unidades abaixo desta, até alguém remover o bloqueio.'
                        : 'Só reprova esta solicitação. A pessoa segue livre para tentar de novo.'}
                    </span>
                  </span>
                </label>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[rgb(var(--border))] px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={onFechar}
                disabled={enviando}
                className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground-muted))] transition-colors hover:text-[rgb(var(--foreground))] disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmar()}
                disabled={enviando}
                aria-disabled={!podeEnviar}
                className="btn-danger-soft app-action inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
                Reprovar cadastro
              </button>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
