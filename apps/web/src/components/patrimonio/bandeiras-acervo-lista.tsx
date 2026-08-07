'use client'

import { useState } from 'react'
import { Flag, ShieldAlert, ShieldCheck } from 'lucide-react'
import { STATUS_PATRIMONIO_LABEL } from '@torcida/types'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { VistoriaBandeiraForm } from '@/components/patrimonio/vistoria-bandeira-form'

export type BandeiraRow = {
  id: string
  nome: string
  status: string
  localizacao: string | null
  temVistoria: boolean
  vistoriaVencendo: boolean
  vistoria: {
    larguraM: number
    alturaM: number
    comMastro: boolean
    orgao: string | null
    protocolo: string | null
    validade: string | null
    observacao: string | null
  } | null
}

const fmtData = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
})

function rotuloVistoria(item: BandeiraRow): { texto: string; tom: 'ok' | 'alerta' | 'ausente' } {
  if (!item.vistoria) return { texto: 'Sem ficha de vistoria', tom: 'ausente' }
  const medidas = `${item.vistoria.larguraM}×${item.vistoria.alturaM} m${item.vistoria.comMastro ? ' · com mastro' : ''}`
  if (!item.vistoria.validade) return { texto: `${medidas} · sem prazo`, tom: 'ok' }
  const validade = fmtData.format(new Date(`${item.vistoria.validade}T12:00:00`))
  return {
    texto: `${medidas} · liberada até ${validade}`,
    tom: item.vistoriaVencendo ? 'alerta' : 'ok',
  }
}

/**
 * Acervo de bandeiras com a ficha de vistoria embutida. Vistoria é o dado que
 * decide se a bandeira entra no estádio, então aparece na linha do item — não
 * atrás de um clique a mais.
 */
export function BandeirasAcervoLista({
  itens,
  podeGerir,
}: {
  itens: BandeiraRow[]
  podeGerir: boolean
}) {
  const [editandoId, setEditandoId] = useState<string | null>(null)

  if (itens.length === 0) {
    return (
      <MotionEmptyState
        icon={<Flag className="h-6 w-6" />}
        title="Nenhuma bandeira cadastrada"
        description="Cadastre bandeirões, faixas e mastros no inventário — categoria Bandeira."
      />
    )
  }

  return (
    <ul className="divide-y divide-[rgb(var(--border))] overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
      {itens.map((item) => {
        const vistoria = rotuloVistoria(item)
        return (
          <li key={item.id} className="px-4 py-3">
            {editandoId === item.id ? (
              <VistoriaBandeiraForm
                itemId={item.id}
                itemNome={item.nome}
                inicial={item.vistoria}
                onCancel={() => setEditandoId(null)}
              />
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[rgb(var(--foreground))]">{item.nome}</p>
                  <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
                    {STATUS_PATRIMONIO_LABEL[item.status] ?? item.status}
                    {item.localizacao ? ` · ${item.localizacao}` : ''}
                  </p>
                  <p
                    className={
                      vistoria.tom === 'ok'
                        ? 'mt-1 inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400'
                        : vistoria.tom === 'alerta'
                          ? 'mt-1 inline-flex items-center gap-1 text-xs text-red-700 dark:text-red-400'
                          : 'mt-1 inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400'
                    }
                  >
                    {vistoria.tom === 'ok' ? (
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {vistoria.texto}
                  </p>
                </div>
                {podeGerir && (
                  <button
                    type="button"
                    onClick={() => setEditandoId(item.id)}
                    className="self-end rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))] sm:self-start"
                  >
                    {item.temVistoria ? 'Atualizar vistoria' : 'Registrar vistoria'}
                  </button>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
