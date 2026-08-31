'use client'

import { useRef, useState, useTransition, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import {
  SETOR_ARQUIBANCADA_LABEL,
  formatarSetorArquibancada,
  setorAceitaGeral,
} from '@torcida/types'
import { salvarSetorArquibancada } from '@/app/admin/(plataforma)/configuracoes/actions'
import { SetorArquibancadaPicker } from '@/components/admin/setor-arquibancada-picker'
import { StickyPersistBar } from '@/components/sticky-persist-bar'
import { useTrackedForm } from '@/lib/unsaved-changes'
import { runPersistAction } from '@/lib/toast-action'
import type { SetorArquibancadaCardeal } from '@/lib/setor-arquibancada'

type Props = {
  cardeal: SetorArquibancadaCardeal | null
  geral: boolean
  nomeLocal: string | null
  portao: string | null
  /** Unidade (não-raiz): só leitura, valor herdado da Sede. */
  somenteLeitura?: boolean
  sedeNome?: string | null
}

export function SetorArquibancadaForm({
  cardeal: cardealInicial,
  geral: geralInicial,
  nomeLocal,
  portao,
  somenteLeitura = false,
  sedeNome,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [cardeal, setCardeal] = useState<SetorArquibancadaCardeal | null>(cardealInicial)
  const [geral, setGeral] = useState(geralInicial && setorAceitaGeral(cardealInicial))
  const { formRef, markPristine, isDirty } = useTrackedForm({
    title: 'Setor na arquibancada',
    labels: {
      cardeal: 'Setor',
      geral: 'Geral',
      nomeLocal: 'Nome local',
      portao: 'Portão',
    },
    enabled: !somenteLeitura,
  })
  const cardealInputRef = useRef<HTMLInputElement>(null)

  function escolher(next: SetorArquibancadaCardeal) {
    setCardeal(next)
    if (!setorAceitaGeral(next)) setGeral(false)
    const input = cardealInputRef.current
    if (input) {
      input.value = next
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const ok = await runPersistAction(() => salvarSetorArquibancada(fd), {
        success: 'Setor na arquibancada salvo.',
      })
      if (ok) markPristine()
    })
  }

  if (somenteLeitura) {
    const linha = formatarSetorArquibancada({
      cardeal,
      geral,
      nomeLocal,
      portao,
    })
    return (
      <div className="space-y-4">
        <SetorArquibancadaPicker cardeal={cardeal} geral={geral} onCardeal={() => undefined} disabled />
        <p className="text-sm text-[rgb(var(--foreground))]">
          {linha || 'A Sede ainda não cadastrou o setor.'}
        </p>
        <p className="text-xs text-[rgb(var(--foreground-muted))]">
          Definido pela Sede{sedeNome ? ` (${sedeNome})` : ''}. Unidades herdam o mesmo setor no
          estádio do time apoiado.
        </p>
      </div>
    )
  }

  const aceitaGeral = setorAceitaGeral(cardeal)

  return (
    <form ref={formRef} onSubmit={handleSubmit} data-persist-bar-root className="space-y-5">
      <input ref={cardealInputRef} type="hidden" name="cardeal" defaultValue={cardeal ?? ''} />
      <input type="hidden" name="geral" value={geral && aceitaGeral ? 'true' : 'false'} />
      <SetorArquibancadaPicker cardeal={cardeal} geral={geral} onCardeal={escolher} />

      {cardeal ? (
        <p className="text-center text-sm font-medium text-[rgb(var(--foreground))]">
          {SETOR_ARQUIBANCADA_LABEL[cardeal]}
          {geral && aceitaGeral ? ' · Geral' : ''}
        </p>
      ) : (
        <p className="text-center text-sm text-[rgb(var(--foreground-muted))]">
          Toque no setor onde a torcida se concentra.
        </p>
      )}

      <label
        className={`flex items-start gap-3 rounded-xl border border-[rgb(var(--border))] p-3 ${
          aceitaGeral ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
        }`}
      >
        <input
          type="checkbox"
          checked={geral && aceitaGeral}
          disabled={!aceitaGeral}
          onChange={(e) => {
            setGeral(e.target.checked)
            formRef.current?.dispatchEvent(new Event('input', { bubbles: true }))
          }}
          className="mt-0.5"
        />
        <span>
          <span className="block text-sm font-medium text-[rgb(var(--foreground))]">Geral</span>
          <span className="block text-xs text-[rgb(var(--foreground-muted))]">
            Em pé, na cabeceira (Setor Norte ou Setor Sul). Laterais não usam Geral.
          </span>
        </span>
      </label>

      <div>
        <label className="block text-sm font-medium text-[rgb(var(--foreground))]" htmlFor="setor-nome-local">
          Nome local (opcional)
        </label>
        <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
          Como a torcida chama no estádio — “Arquibancada Norte”, “setor Amarelo”.
        </p>
        <input
          id="setor-nome-local"
          name="nomeLocal"
          defaultValue={nomeLocal ?? ''}
          maxLength={80}
          className="mt-1.5 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none transition-colors focus:border-[rgb(var(--primary))] focus:ring-1 focus:ring-[rgb(var(--primary)_/_0.3)]"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-[rgb(var(--foreground))]" htmlFor="setor-portao">
          Portão (opcional)
        </label>
        <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
          Entrada da torcida — “Portão O”, “Portões Q, S, U e W”.
        </p>
        <input
          id="setor-portao"
          name="portao"
          defaultValue={portao ?? ''}
          maxLength={80}
          className="mt-1.5 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] outline-none transition-colors focus:border-[rgb(var(--primary))] focus:ring-1 focus:ring-[rgb(var(--primary)_/_0.3)]"
        />
      </div>

      <StickyPersistBar
        locked={isDirty || pending}
        dirtyLabel={isDirty ? 'Setor na arquibancada' : undefined}
      >
        <button
          type="submit"
          disabled={pending || !cardeal}
          className="flex items-center gap-2 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Salvar setor
        </button>
      </StickyPersistBar>
    </form>
  )
}
