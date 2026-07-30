'use client'

import { useTransition } from 'react'
import { TriangleAlert } from 'lucide-react'
import { toast } from '@torcida/ui/services/toast'
import { sincronizarNumerosSocio } from './actions'

/**
 * Aviso do desalinho entre o nº da carteirinha legada (sequencial) e o nº
 * informado no recrutamento. A correção é um clique, não um efeito colateral de
 * abrir a lista — a escrita antiga rodava em GET, sem auditoria.
 */
export function SincronizarNumerosAviso({ quantidade }: { quantidade: number }) {
  const [pendente, startTransition] = useTransition()

  return (
    <div className="app-container">
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm">
        <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <p className="min-w-0 flex-1 text-[rgb(var(--foreground))]">
          {quantidade === 1
            ? '1 carteirinha desta página tem número interno diferente do nº informado no recrutamento'
            : `${quantidade} carteirinhas desta página têm número interno diferente do nº informado no recrutamento`}
          . A lista mostra o número do cadastro, mas a ordenação por número usa o
          interno.
        </p>
        <button
          type="button"
          disabled={pendente}
          onClick={() =>
            startTransition(async () => {
              try {
                const { corrigidas, conflitos } = await sincronizarNumerosSocio()
                if (corrigidas === 0 && conflitos === 0) {
                  toast.success('Os números já estavam alinhados.')
                  return
                }
                toast.success(
                  conflitos > 0
                    ? `${corrigidas} carteirinha(s) alinhada(s); ${conflitos} com número já em uso — corrija a duplicidade no recrutamento.`
                    : `${corrigidas} carteirinha(s) alinhada(s).`,
                )
              } catch {
                toast.error('Não foi possível sincronizar os números agora.')
              }
            })
          }
          className="shrink-0 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))] disabled:opacity-60"
        >
          {pendente ? 'Sincronizando…' : 'Sincronizar números'}
        </button>
      </div>
    </div>
  )
}
