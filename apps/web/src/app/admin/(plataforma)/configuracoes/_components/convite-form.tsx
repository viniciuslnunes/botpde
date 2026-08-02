'use client'

import { useState, useTransition } from 'react'
import { Check, Copy, Link2, Loader2, RefreshCw } from 'lucide-react'
import { useConfirmAction } from '@/lib/confirm-action'
import { runPersistAction } from '@/lib/toast-action'
import { alternarConviteTenant, gerarConviteTenant } from '../actions'

interface ConviteFormProps {
  slug: string | null
  ativo: boolean
  /** Unidade com canal restrito: o convite deixa de ser atalho e vira a porta. */
  canalRestrito: boolean
}

export function ConviteForm({ slug, ativo, canalRestrito }: ConviteFormProps) {
  const confirmarAcao = useConfirmAction()
  const [pending, startTransition] = useTransition()
  const [copiado, setCopiado] = useState(false)

  const link = slug && typeof window !== 'undefined' ? `${window.location.origin}/convite/${slug}` : null

  /**
   * Rotacionar pede confirmação. O diálogo NÃO pode ser esperado dentro de
   * `startTransition`: montar o modal viraria uma atualização da própria
   * transição, que só termina quando o callback resolve — e o callback espera
   * o clique num modal que nunca chega a aparecer. Resultado: botão travado em
   * "Salvando…" para sempre. `useConfirmAction` roda a mutação dentro do modal.
   */
  function gerar() {
    if (slug) {
      void confirmarAcao({
        titulo: 'Gerar um novo link?',
        descricao:
          'O link atual para de funcionar imediatamente. Use isto se o convite tiver vazado — quem já entrou continua na torcida.',
        labelConfirmar: 'Gerar novo link',
        variante: 'destructive',
        run: () => gerarConviteTenant(),
        success: 'Novo link gerado. O anterior foi invalidado.',
      })
      return
    }

    startTransition(async () => {
      await runPersistAction(() => gerarConviteTenant(), {
        success: 'Link de convite criado.',
      })
    })
  }

  function alternar(proximo: boolean) {
    const fd = new FormData()
    fd.set('conviteAtivo', proximo ? 'true' : 'false')
    startTransition(async () => {
      await runPersistAction(() => alternarConviteTenant(fd), {
        success: proximo ? 'Convite ativado.' : 'Convite desativado.',
      })
    })
  }

  async function copiar() {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopiado(true)
    window.setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[rgb(var(--foreground-muted))]">
        O link de convite adianta as etapas de clube, torcida e unidade e
        vincula quem abrir a esta torcida/unidade: a pessoa vai direto para a
        escolha entre sócio e torcedor. Criar a conta, confirmar o e-mail e
        definir o apelido (@) continuam sendo pedidos — são a identidade na
        plataforma.
        {canalRestrito
          ? ' Como o canal desta unidade está restrito, este é o único caminho de entrada.'
          : ''}
      </p>

      {slug ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2">
            <Link2 className="h-4 w-4 shrink-0 text-[rgb(var(--foreground-muted))]" />
            <code className="min-w-0 flex-1 truncate text-xs text-[rgb(var(--foreground))]">
              {link ?? `/convite/${slug}`}
            </code>
            <button
              type="button"
              onClick={copiar}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-2 py-1 text-[11px] font-medium text-[rgb(var(--foreground))]"
            >
              {copiado ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-4 py-3">
            <input
              type="checkbox"
              checked={ativo}
              disabled={pending}
              onChange={(e) => alternar(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-[rgb(var(--border))] text-[rgb(var(--color-primary-fg))]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-[rgb(var(--foreground))]">
                Convite ativo
              </span>
              <span className="mt-0.5 block text-xs text-[rgb(var(--foreground-muted))]">
                {pending
                  ? 'Salvando…'
                  : ativo
                    ? 'O link está aceitando novas entradas'
                    : 'O link está pausado — ninguém entra por ele'}
              </span>
            </span>
          </label>
        </div>
      ) : null}

      <button
        type="button"
        disabled={pending}
        onClick={gerar}
        className="inline-flex items-center gap-2 rounded-xl bg-[rgb(var(--color-primary)_/_0.12)] px-3 py-2 text-xs font-semibold text-[rgb(var(--color-primary-fg))] ring-1 ring-inset ring-[rgb(var(--color-primary)_/_0.28)] disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        {slug ? 'Gerar novo link' : 'Criar link de convite'}
      </button>
    </div>
  )
}
