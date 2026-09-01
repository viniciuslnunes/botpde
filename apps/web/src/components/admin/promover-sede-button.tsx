'use client'

import { useRouter } from 'next/navigation'
import { ArrowRight, Building2, Check, Users } from 'lucide-react'
import { promoverSedeAction } from '@/app/admin/(estrutura)/sedes/actions'
import { trocarTorcidaAction } from '@/app/portal/tenant-context-actions'
import { useConfirmAction } from '@/lib/confirm-action'

/**
 * CTA para promover SUBSEDE/PDE a portal próprio (Caso B).
 * Confirmação via modal do design system — nunca `window.confirm`.
 * Após sucesso, troca o cookie de contexto e abre o admin da unidade.
 */
export function PromoverSedeButton({
  sedeId,
  sedeNome,
}: {
  sedeId: string
  sedeNome: string
}) {
  const confirmAction = useConfirmAction()
  const router = useRouter()

  function handlePromover() {
    void confirmAction({
      titulo: `Criar portal próprio de “${sedeNome}”?`,
      descricao:
        'A unidade passa a ter login e administração próprios. Membros desta unidade e PDEs filhos migram automaticamente. A liderança vinculada vira owner do novo portal — e você será levado ao admin dele.',
      labelConfirmar: 'Criar portal próprio',
      labelCancelar: 'Agora não',
      cancelled: false,
      run: async () => {
        const result = await promoverSedeAction(sedeId)
        if (!result.ok) return result

        // Entra direto no admin do portal criado — senão header/selects
        // ficam na Sede mãe até troca manual.
        const fd = new FormData()
        fd.set('slug', result.novoSlug)
        fd.set('destino', 'admin')
        const troca = await trocarTorcidaAction({}, fd)
        // Sem redirect: operador sem vínculo no portal novo. A promoção
        // já concluiu — mantém sucesso e deixa o toast avisar.
        if (troca.message) {
          return {
            ok: true as const,
            novoSlug: result.novoSlug,
            membrosMigrados: result.membrosMigrados,
            filhosMovidos: result.filhosMovidos,
            message: `Portal criado, mas não foi possível abrir o admin: ${troca.message}`,
          }
        }
        return result
      },
      success: 'Portal próprio criado.',
      successDescription: 'Abrindo o admin da unidade…',
      id: `promover-sede-${sedeId}`,
    }).then((ok) => {
      // Só chega aqui se não houve redirect (troca de contexto falhou
      // ou cancelou). Refresh mostra o estado Caso B na ficha da mãe.
      if (ok) router.refresh()
    })
  }

  return (
    <section
      aria-labelledby={`promover-portal-${sedeId}`}
      className="overflow-hidden rounded-2xl border border-[rgb(var(--primary)_/_0.35)] bg-[rgb(var(--primary)_/_0.06)]"
    >
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:gap-5 sm:p-5">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--primary)_/_0.14)] text-[rgb(var(--primary-fg))]"
          aria-hidden
        >
          <Building2 className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--primary-fg))]">
              Próximo passo
            </p>
            <h3
              id={`promover-portal-${sedeId}`}
              className="mt-0.5 text-balance text-base font-semibold text-[rgb(var(--foreground))]"
            >
              Criar portal próprio
            </h3>
            <p className="mt-1 max-w-prose text-sm leading-relaxed text-[rgb(var(--foreground-muted))]">
              “{sedeNome}” ainda vive no portal da Sede. Com portal próprio, a liderança local
              administra membros, agenda e loja no próprio contexto — sem misturar com a
              operação da Sede.
            </p>
          </div>

          <ul className="grid gap-1.5 text-xs text-[rgb(var(--foreground-muted))] sm:grid-cols-2">
            <li className="flex items-start gap-1.5">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[rgb(var(--primary-fg))]" aria-hidden />
              <span>Login e admin próprios (Caso B)</span>
            </li>
            <li className="flex items-start gap-1.5">
              <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[rgb(var(--primary-fg))]" aria-hidden />
              <span>Membros e filhos migrados com a unidade</span>
            </li>
            <li className="flex items-start gap-1.5 sm:col-span-2">
              <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[rgb(var(--primary-fg))]" aria-hidden />
              <span>Após criar, você entra direto no admin desta unidade</span>
            </li>
          </ul>

          <div className="pt-0.5">
            <button
              type="button"
              onClick={handlePromover}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[rgb(var(--primary))] px-4 py-2.5 text-sm font-semibold text-primary-on transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--primary))]"
            >
              <Building2 className="h-3.5 w-3.5" aria-hidden />
              Criar portal próprio
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
