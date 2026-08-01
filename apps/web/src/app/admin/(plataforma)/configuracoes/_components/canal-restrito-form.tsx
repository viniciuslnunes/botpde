'use client'

import { useState, useTransition } from 'react'
import { Loader2, Lock, LockOpen, ShieldOff } from 'lucide-react'
import { useConfirmAction } from '@/lib/confirm-action'
import { runPersistAction } from '@/lib/toast-action'
import {
  ativarCanalRestrito,
  desativarCanalRestrito,
  responderReativacaoCanal,
} from '../actions'

export interface SolicitacaoReativacaoView {
  solicitadoPorNome: string | null
  mensagem: string | null
  /** ISO — renderizado no cliente para respeitar o fuso do usuário. */
  prazoIso: string
  diasRestantes: number
}

interface CanalRestritoFormProps {
  restrito: boolean
  solicitacao: SolicitacaoReativacaoView | null
  ultimaRecusaMotivo: string | null
}

/**
 * O texto do modal é parte do produto, não decoração: a liderança precisa
 * entender exatamente o que perde e o que continua valendo antes de fechar o
 * canal — e que a decisão é reversível a qualquer momento.
 */
const DESCRICAO_ATIVAR = [
  'Ao restringir o canal desta unidade:',
  '',
  '• ela sai do onboarding público, da busca e da comunidade nacional;',
  '• deixa de aparecer para torcidas coirmãs, aliados e torcedores de fora;',
  '• salas, lojas e conversas com quem é de fora param de funcionar;',
  '• alianças ficam suspensas — nada é apagado, elas voltam ao reabrir.',
  '',
  'O que continua igual:',
  '',
  '• toda a administração e a comunidade internas da unidade;',
  '• comunicados e eventos da Sede continuam chegando aqui;',
  '• novos pedidos de sócio seguem sendo registrados na Sede;',
  '• Presidente e Vice continuam acompanhando a unidade em modo leitura;',
  '• novos torcedores e sócios entram pelo link de convite.',
  '',
  'Você pode reabrir o canal quando quiser.',
].join('\n')

const DESCRICAO_DESATIVAR = [
  'Ao reabrir o canal, todos os vínculos voltam automaticamente:',
  '',
  '• alianças ativas voltam a valer;',
  '• a unidade reaparece no onboarding, na busca e na comunidade nacional;',
  '• salas, lojas e conversas externas voltam a funcionar;',
  '• novas publicações voltam a alcançar a rede do clube.',
  '',
  'Nenhuma informação foi perdida enquanto o canal esteve restrito.',
].join('\n')

export function CanalRestritoForm({
  restrito,
  solicitacao,
  ultimaRecusaMotivo,
}: CanalRestritoFormProps) {
  const confirmarAcao = useConfirmAction()
  const [pending, startTransition] = useTransition()
  const [recusando, setRecusando] = useState(false)
  const [motivo, setMotivo] = useState('')

  /**
   * Confirmação fora de `startTransition`: esperar o modal dentro da transição
   * trava o componente em pending para sempre (o modal só monta quando a
   * transição termina, e a transição só termina depois do clique no modal).
   */
  function alternar(proximo: boolean) {
    void confirmarAcao({
      titulo: proximo ? 'Restringir o canal da unidade?' : 'Reabrir o canal da unidade?',
      descricao: proximo ? DESCRICAO_ATIVAR : DESCRICAO_DESATIVAR,
      labelConfirmar: proximo ? 'Restringir canal' : 'Reabrir canal',
      variante: proximo ? 'destructive' : 'success',
      run: () => (proximo ? ativarCanalRestrito() : desativarCanalRestrito()),
      success: proximo
        ? 'Canal restrito. A unidade saiu das interações externas.'
        : 'Canal reaberto. Os vínculos da unidade foram reestabelecidos.',
    })
  }

  function responder(decisao: 'aprovar' | 'recusar') {
    const fd = new FormData()
    fd.set('decisao', decisao)
    if (decisao === 'recusar') fd.set('motivo', motivo)

    startTransition(async () => {
      const ok = await runPersistAction(() => responderReativacaoCanal(fd), {
        success:
          decisao === 'aprovar'
            ? 'Canal reaberto. Os vínculos da unidade foram reestabelecidos.'
            : 'Recusa registrada e enviada à Sede.',
      })
      if (ok && decisao === 'recusar') {
        setRecusando(false)
        setMotivo('')
      }
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[rgb(var(--foreground-muted))]">
        O canal restrito isola esta unidade das interações externas — comunidade
        nacional, coirmãs, aliados, salas, lojas e conversas de fora. A
        administração e a comunidade internas continuam funcionando normalmente,
        e a Sede continua enxergando a unidade na estrutura da torcida.
      </p>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-4 py-3">
        <input
          type="checkbox"
          checked={restrito}
          disabled={pending}
          onChange={(e) => alternar(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-[rgb(var(--border))] text-[rgb(var(--color-primary-fg))]"
        />
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-sm font-medium text-[rgb(var(--foreground))]">
            {restrito ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
            Restringir o canal desta unidade
          </span>
          <span className="mt-0.5 block text-xs text-[rgb(var(--foreground-muted))]">
            {pending
              ? 'Salvando…'
              : restrito
                ? 'Canal restrito — a unidade está fora das interações externas'
                : 'Canal aberto — a unidade participa normalmente da rede da torcida'}
          </span>
        </span>
      </label>

      {ultimaRecusaMotivo && restrito && !solicitacao ? (
        <p className="flex items-start gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-4 py-3 text-xs text-[rgb(var(--foreground-muted))]">
          <ShieldOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Última resposta à Sede: <strong>recusada</strong> — “{ultimaRecusaMotivo}”
          </span>
        </p>
      ) : null}

      {solicitacao ? (
        <div className="space-y-3 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-4 dark:border-amber-500/40 dark:bg-amber-950/30">
          <div>
            <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
              A Sede pediu a reabertura do canal
            </p>
            <p className="mt-1 text-xs text-[rgb(var(--foreground-muted))]">
              {solicitacao.solicitadoPorNome
                ? `Solicitado por ${solicitacao.solicitadoPorNome}. `
                : ''}
              Você tem{' '}
              <strong>
                {solicitacao.diasRestantes === 0
                  ? 'menos de um dia'
                  : `${solicitacao.diasRestantes} dia${solicitacao.diasRestantes > 1 ? 's' : ''}`}
              </strong>{' '}
              para responder. Sem resposta até lá, o canal é reaberto
              automaticamente. Se você recusar, o Presidente ainda pode impor a
              reabertura com justificativa registrada.
            </p>
            {solicitacao.mensagem ? (
              <p className="mt-2 text-xs italic text-[rgb(var(--foreground-muted))]">
                “{solicitacao.mensagem}”
              </p>
            ) : null}
          </div>

          {recusando ? (
            <div className="space-y-2">
              <label
                htmlFor="motivo-recusa-canal"
                className="block text-xs font-medium text-[rgb(var(--foreground))]"
              >
                Por que a unidade prefere manter o canal restrito?
              </label>
              <textarea
                id="motivo-recusa-canal"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                maxLength={600}
                placeholder="Mínimo de 10 caracteres. A Sede recebe esta justificativa."
                className="w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-[rgb(var(--foreground))]"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending || motivo.trim().length < 10}
                  onClick={() => responder('recusar')}
                  className="inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--foreground))] px-3 py-2 text-xs font-semibold text-[rgb(var(--background))] disabled:opacity-50"
                >
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Enviar recusa
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setRecusando(false)}
                  className="rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-xs font-medium text-[rgb(var(--foreground-muted))]"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => responder('aprovar')}
                className="inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--color-primary))] px-3 py-2 text-xs font-semibold text-[rgb(var(--color-primary-fg))] disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Reabrir canal agora
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setRecusando(true)}
                className="rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-xs font-medium text-[rgb(var(--foreground))]"
              >
                Recusar
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
