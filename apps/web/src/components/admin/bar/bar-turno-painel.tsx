'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Lock, Unlock } from 'lucide-react'
import { LIMIAR_DIVERGENCIA_ABS, LIMIAR_DIVERGENCIA_PCT } from '@torcida/types'
import { toast } from '@torcida/ui'
import { abrirTurnoBar, fecharTurnoBar } from '@/app/admin/bar/actions'

function formatarPreco(valor: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

function formatarHora(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso))
}

export type BarTurnoComandaAbertaResumo = {
  id: string
  codigo: string
  total: number
}

export type BarTurnoPainelProps = {
  turno: {
    id: string
    abertoEm: string
    abertoPorNome: string | null
  } | null
  resumo: {
    totalPago: number
    quantidadePaga: number
    dinheiroEsperado: number
    pendentes: number
  } | null
  podeGerir: boolean
  compact?: boolean
  /** Comandas ABERTA da unidade — ciência obrigatória no fechamento se houver. */
  comandasAbertas?: BarTurnoComandaAbertaResumo[]
}

export function BarTurnoPainel({
  turno,
  resumo,
  podeGerir,
  compact = false,
  comandasAbertas = [],
}: BarTurnoPainelProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [fechando, setFechando] = useState(false)
  // Deixa em branco de propósito: o operador deve digitar a contagem real do
  // caixa, não aceitar um valor pré-preenchido igual ao esperado (mascararia
  // divergência).
  const [dinheiroContado, setDinheiroContado] = useState('')
  const [sangria, setSangria] = useState('0')
  const [observacao, setObservacao] = useState('')
  const [cienciaComandas, setCienciaComandas] = useState(false)

  const diferenca = useMemo(() => {
    if (!resumo || dinheiroContado.trim() === '') return null
    const contado = Number(dinheiroContado)
    if (Number.isNaN(contado)) return null
    const sangriaNum = Number(sangria) || 0
    return Math.round((contado - resumo.dinheiroEsperado + sangriaNum) * 100) / 100
  }, [resumo, dinheiroContado, sangria])

  const divergenciaAlta =
    resumo && diferenca != null
      ? Math.abs(diferenca) > Math.max(LIMIAR_DIVERGENCIA_ABS, resumo.dinheiroEsperado * LIMIAR_DIVERGENCIA_PCT)
      : false

  const exigeCiencia = comandasAbertas.length > 0

  function abrir() {
    startTransition(async () => {
      const result = await abrirTurnoBar()
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Turno aberto')
      router.refresh()
    })
  }

  function fechar() {
    if (exigeCiencia && !cienciaComandas) {
      toast.error('Confirme ciência das comandas abertas antes de fechar.')
      return
    }
    startTransition(async () => {
      const result = await fecharTurnoBar({
        dinheiroContado: Number(dinheiroContado),
        sangria: Number(sangria) || 0,
        observacao: observacao.trim() || undefined,
        cienciaComandasAbertas: exigeCiencia ? cienciaComandas : undefined,
      })
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Turno fechado')
      setFechando(false)
      setCienciaComandas(false)
      router.refresh()
    })
  }

  if (!turno) {
    return (
      <div
        className={[
          'rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))]',
          compact ? 'p-4' : 'p-5',
        ].join(' ')}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
            <div>
              <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
                Turno fechado
              </p>
              <p className="text-xs text-[rgb(var(--foreground-muted))]">
                Abra o caixa para registrar vendas no PDV.
              </p>
            </div>
          </div>
          {podeGerir && (
            <button
              type="button"
              disabled={pending}
              onClick={abrir}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              <Unlock className="h-3.5 w-3.5" />
              Abrir turno
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    // @container: em `compact` o painel mora na sidebar do PDV (~15rem úteis).
    // Com `sm:grid-cols-3` as três caixas ficavam com ~75px e o valor vazava.
    <div
      className={[
        '@container space-y-3 rounded-2xl border border-[rgb(var(--color-success)_/_0.35)] bg-[rgb(var(--surface))]',
        compact ? 'p-4' : 'p-5',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-[rgb(var(--color-success-fg))]" />
          <div>
            <p className="text-sm font-semibold text-[rgb(var(--foreground))]">Turno aberto</p>
            <p className="text-xs text-[rgb(var(--foreground-muted))]">
              Desde {formatarHora(turno.abertoEm)}
              {turno.abertoPorNome ? ` · ${turno.abertoPorNome}` : ''}
            </p>
          </div>
        </div>
        {podeGerir && !fechando && (
          <button
            type="button"
            onClick={() => {
              setFechando(true)
              setCienciaComandas(false)
            }}
            className="rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]"
          >
            Fechar turno
          </button>
        )}
      </div>

      {resumo && (
        <div className="@[15rem]:grid-cols-2 @[26rem]:grid-cols-3 grid gap-2">
          <div className="rounded-xl bg-[rgb(var(--background-subtle))] px-3 py-2">
            <p className="text-xs text-[rgb(var(--foreground-muted))]">Vendido (pago)</p>
            <p className="text-sm font-semibold tabular-nums text-[rgb(var(--foreground))]">
              {formatarPreco(resumo.totalPago)}
            </p>
            <p className="text-xs text-[rgb(var(--foreground-muted))]">
              {resumo.quantidadePaga} venda{resumo.quantidadePaga === 1 ? '' : 's'}
            </p>
          </div>
          <div className="rounded-xl bg-[rgb(var(--background-subtle))] px-3 py-2">
            <p className="text-xs text-[rgb(var(--foreground-muted))]">Dinheiro esperado</p>
            <p className="text-sm font-semibold tabular-nums text-[rgb(var(--foreground))]">
              {formatarPreco(resumo.dinheiroEsperado)}
            </p>
          </div>
          <div className="rounded-xl bg-[rgb(var(--background-subtle))] px-3 py-2">
            <p className="text-xs text-[rgb(var(--foreground-muted))]">PIX pendente</p>
            <p className="text-sm font-semibold tabular-nums text-[rgb(var(--foreground))]">
              {resumo.pendentes}
            </p>
          </div>
        </div>
      )}

      {fechando && podeGerir && (
        <div className="space-y-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] p-3">
          <p className="text-sm font-medium text-[rgb(var(--foreground))]">Fechamento de caixa</p>
          <div className="@[22rem]:grid-cols-2 grid gap-3">
            <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Dinheiro contado (R$)
              <input
                type="number"
                min={0}
                step="0.01"
                value={dinheiroContado}
                onChange={(e) => setDinheiroContado(e.target.value)}
                placeholder="Conte o caixa e digite aqui"
                required
                className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
              />
            </label>
            <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
              Sangria (R$)
              <input
                type="number"
                min={0}
                step="0.01"
                value={sangria}
                onChange={(e) => setSangria(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
              />
            </label>
          </div>
          <label className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
            Observação
            <input
              type="text"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              maxLength={300}
              placeholder="Opcional"
              className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
            />
          </label>

          {exigeCiencia && (
            <div className="space-y-2 rounded-lg border border-[rgb(var(--color-warning)_/_0.35)] bg-[rgb(var(--color-warning)_/_0.08)] px-3 py-2">
              <p className="text-xs font-medium text-[rgb(var(--color-warning-fg))]">
                {comandasAbertas.length} comanda
                {comandasAbertas.length !== 1 ? 's' : ''} ainda aberta
                {comandasAbertas.length !== 1 ? 's' : ''} — o fechamento não as encerra.
              </p>
              <ul className="max-h-28 space-y-1 overflow-y-auto text-xs text-[rgb(var(--foreground-muted))]">
                {comandasAbertas.map((c) => (
                  <li key={c.id} className="flex justify-between gap-2">
                    <span>{c.codigo}</span>
                    <span className="tabular-nums">{formatarPreco(c.total)}</span>
                  </li>
                ))}
              </ul>
              <label className="flex items-start gap-2 text-xs text-[rgb(var(--foreground))]">
                <input
                  type="checkbox"
                  checked={cienciaComandas}
                  onChange={(e) => setCienciaComandas(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Estou ciente de que estas comandas permanecem abertas após o fechamento do
                  turno.
                </span>
              </label>
            </div>
          )}

          {diferenca != null && (
            <p
              className={[
                'rounded-lg px-3 py-2 text-xs font-medium',
                divergenciaAlta
                  ? 'bg-[rgb(var(--color-danger)_/_0.1)] text-[rgb(var(--color-danger-fg))]'
                  : diferenca !== 0
                    ? 'bg-[rgb(var(--color-warning)_/_0.12)] text-[rgb(var(--color-warning-fg))]'
                    : 'bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
              ].join(' ')}
            >
              Diferença: {formatarPreco(diferenca)}
              {divergenciaAlta
                ? ' — divergência alta, será sinalizada para os gestores.'
                : diferenca === 0
                  ? ' — caixa bateu certinho.'
                  : ' — dentro do esperado.'}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={
                pending ||
                dinheiroContado.trim() === '' ||
                (exigeCiencia && !cienciaComandas)
              }
              onClick={fechar}
              className="rounded-lg bg-[rgb(var(--primary))] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Confirmar fechamento
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setFechando(false)
                setCienciaComandas(false)
              }}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-[rgb(var(--foreground-muted))]"
            >
              Voltar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
