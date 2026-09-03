'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore, Loader2, Trash2, X } from 'lucide-react'
import { toast } from '@torcida/ui'
import { alternarSituacaoClubeAction, excluirClubeAction } from '../actions'
import { AppButton } from '@/components/ui/button'

interface Props {
  clubeId: string
  nome: string
  ativo: boolean
  /** Falso quando o clube tem qualquer vínculo — o caminho passa a ser arquivar. */
  podeExcluir: boolean
  motivoBloqueio: string
}

const BOTAO =
  'inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60'

/**
 * Arquivar / reativar / excluir.
 *
 * Arquivar é o caminho normal: tira o clube do onboarding e do seletor sem
 * tocar em histórico. Excluir só aparece habilitado com todos os vínculos
 * zerados — `Partida` e `Noticia` são `onDelete: Cascade` na afiliação, então a
 * exclusão de um clube em uso levaria jogos e notícias junto, em silêncio. Para
 * confirmar, o operador digita o nome exato.
 */
export function ClubeSituacaoAcoes({ clubeId, nome, ativo, podeExcluir, motivoBloqueio }: Props) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [confirmando, setConfirmando] = useState(false)
  const [confirmacao, setConfirmacao] = useState('')

  function alternarSituacao() {
    iniciar(async () => {
      const resultado = await alternarSituacaoClubeAction(clubeId, !ativo)
      if (!resultado.ok) {
        toast.error(resultado.erro ?? 'Não foi possível alterar a situação.')
        return
      }
      toast.success(ativo ? 'Clube arquivado.' : 'Clube reativado.')
      router.refresh()
    })
  }

  function excluir() {
    iniciar(async () => {
      const resultado = await excluirClubeAction(clubeId, confirmacao)
      if (!resultado.ok) {
        toast.error(resultado.erro ?? 'Não foi possível excluir.')
        return
      }
      toast.success('Clube excluído.')
      router.push('/super-admin/clubes')
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={alternarSituacao}
        disabled={pendente}
        className={`${BOTAO} text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]`}
      >
        {pendente ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : ativo ? (
          <Archive className="h-4 w-4" aria-hidden />
        ) : (
          <ArchiveRestore className="h-4 w-4" aria-hidden />
        )}
        {ativo ? 'Arquivar' : 'Reativar'}
      </button>

      {!confirmando ? (
        <AppButton
          variant="none"
          icon={Trash2}
          type="button"
          onClick={() => setConfirmando(true)}
          disabled={!podeExcluir || pendente}
          title={
            podeExcluir
              ? 'Excluir definitivamente'
              : `Clube com vínculos (${motivoBloqueio}). Arquive em vez de excluir.`
          }
          className={`${BOTAO} border-[rgb(var(--color-danger)_/_0.4)] text-[rgb(var(--color-danger-fg))] hover:bg-[rgb(var(--color-danger)_/_0.08)]`}
        >
          Excluir
        </AppButton>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[rgb(var(--color-danger)_/_0.4)] bg-[rgb(var(--color-danger)_/_0.06)] p-2">
          <label className="text-xs text-[rgb(var(--color-danger-fg))]">
            Digite <strong>{nome}</strong> para confirmar
            <input
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              className="mt-1 block w-56 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2 py-1 text-sm text-[rgb(var(--foreground))] outline-none"
              autoFocus
            />
          </label>
          <AppButton
            variant="none"
            icon={Trash2}
            loading={pendente}
            type="button"
            onClick={excluir}
            disabled={pendente || confirmacao.trim().toLowerCase() !== nome.trim().toLowerCase()}
            className={`${BOTAO} border-transparent bg-[rgb(var(--color-danger))] text-white hover:opacity-90`}
          >
            Excluir definitivamente
          </AppButton>
          <AppButton
            variant="none"
            icon={X}
            type="button"
            onClick={() => {
              setConfirmando(false)
              setConfirmacao('')
            }}
            className={`${BOTAO} text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]`}
          >
            Cancelar
          </AppButton>
        </div>
      )}
    </div>
  )
}
