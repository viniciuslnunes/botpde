import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { getActiveTenant } from '@/lib/tenant'
import { carregarHomeAssociado } from '@/lib/associacao-home'
import {
  formatarMoedaBRL,
  formatDataCompetenciaInput,
} from '@torcida/types'
import {
  CreditCard,
  Calendar,
  Users,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Wallet,
} from 'lucide-react'
import { MotionReveal } from '@/components/motion/motion-reveal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Início' }

export default async function PortalHomePage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const tenant = await getActiveTenant(session.user.id, session.user.email)
  if (!tenant) redirect('/portal/comunidade')

  const home = await carregarHomeAssociado(tenant.id, session.user.id)
  const nome = session.user.name ?? home.membro?.nome ?? 'Associado'

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <MotionReveal>
        <div>
          <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">
            Olá, {nome.split(' ')[0]}!
          </h1>
          <p className="text-sm text-[rgb(var(--foreground-muted))]">{tenant.nome}</p>
        </div>
      </MotionReveal>

      {home.membro?.desligadoEm && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Você está registrado como desligado(a) desta torcida.</p>
        </div>
      )}

      {!home.membro && (
        <MotionReveal>
          <div className="rounded-2xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 text-center">
            <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
              Ainda sem vínculo com a torcida
            </p>
            <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
              Solicite o cadastro para ver status financeiro, carteirinha e cobranças.
            </p>
            <Link
              href="/portal/cadastro"
              className="mt-3 inline-flex items-center gap-1 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-white"
            >
              Solicitar cadastro
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </MotionReveal>
      )}

      {home.membro && home.membro.status === 'PENDENTE' && (
        <MotionReveal>
          <div className="flex items-start gap-3 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-950 dark:border-yellow-900 dark:bg-yellow-950/30 dark:text-yellow-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Seu cadastro está em análise. A home financeira libera após a aprovação.</p>
          </div>
        </MotionReveal>
      )}

      {home.membro && home.membro.status === 'APROVADO' && !home.membro.desligadoEm && (
        <MotionReveal>
          <div
            className={[
              'flex items-center gap-3 rounded-xl border px-4 py-3',
              home.membro.adimplente
                ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30'
                : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30',
            ].join(' ')}
          >
            {home.membro.adimplente ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            )}
            <div>
              <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
                {home.membro.adimplente ? 'Situação regular' : 'Inadimplente'}
              </p>
              {home.membro.planoNome && (
                <p className="text-xs text-[rgb(var(--foreground-muted))]">
                  Plano: {home.membro.planoNome}
                </p>
              )}
            </div>
          </div>
        </MotionReveal>
      )}

      {home.cobrancaAberta && (
        <MotionReveal>
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
            <div className="flex items-start gap-3">
              <Wallet className="mt-0.5 h-5 w-5 text-[rgb(var(--primary))]" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
                  Cobrança em aberto
                </p>
                <p className="text-sm text-[rgb(var(--foreground-muted))]">
                  {home.cobrancaAberta.descricao}
                </p>
                <p className="mt-1 font-mono text-lg font-bold">
                  {formatarMoedaBRL(home.cobrancaAberta.valor)}
                </p>
                <p className="text-xs text-[rgb(var(--foreground-muted))]">
                  Venc. {formatDataCompetenciaInput(home.cobrancaAberta.vencimento)}
                  {home.cobrancaAberta.status === 'VENCIDA' ? ' · Vencida' : ''}
                </p>
                <Link
                  href={`/portal/cobrancas/${home.cobrancaAberta.id}`}
                  className="mt-3 inline-flex items-center gap-1 rounded-lg bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-white"
                >
                  Pagar agora
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </MotionReveal>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <MotionReveal>
          <Link
            href="/portal/carteirinha"
            className="flex items-center gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 transition-colors hover:bg-[rgb(var(--background-subtle))]"
          >
            <CreditCard className="h-5 w-5 text-[rgb(var(--primary))]" />
            <div>
              <p className="text-sm font-semibold">Carteirinha</p>
              <p className="text-xs text-[rgb(var(--foreground-muted))]">
                {home.socio ? `Nº ${String(home.socio.numeroSocio).padStart(5, '0')}` : 'Ver status'}
              </p>
            </div>
          </Link>
        </MotionReveal>

        <MotionReveal>
          <Link
            href="/portal/cobrancas"
            className="flex items-center gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 transition-colors hover:bg-[rgb(var(--background-subtle))]"
          >
            <Wallet className="h-5 w-5 text-[rgb(var(--primary))]" />
            <div>
              <p className="text-sm font-semibold">Mensalidades</p>
              <p className="text-xs text-[rgb(var(--foreground-muted))]">Histórico de cobranças</p>
            </div>
          </Link>
        </MotionReveal>
      </div>

      {home.proximoEvento && (
        <MotionReveal>
          <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
            <div className="flex items-start gap-3">
              <Calendar className="mt-0.5 h-5 w-5 text-[rgb(var(--primary))]" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                  Próximo evento
                </p>
                <p className="font-semibold text-[rgb(var(--foreground))]">{home.proximoEvento.titulo}</p>
                <p className="text-sm text-[rgb(var(--foreground-muted))]">
                  {new Date(home.proximoEvento.data).toLocaleString('pt-BR', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </p>
                {home.proximaAcao?.tipo === 'CONFIRMAR_PRESENCA' && (
                  <Link
                    href={`/portal/eventos/${home.proximaAcao.evento.id}`}
                    className="mt-2 inline-block text-sm font-medium text-[rgb(var(--primary))] hover:underline"
                  >
                    Confirmar presença →
                  </Link>
                )}
              </div>
            </div>
          </div>
        </MotionReveal>
      )}

      <MotionReveal>
        <Link
          href="/portal/comunidade"
          className="flex items-center justify-between rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-4 transition-colors hover:bg-[rgb(var(--background-subtle))]"
        >
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-[rgb(var(--primary))]" />
            <span className="text-sm font-semibold">Comunidade</span>
          </div>
          <ArrowRight className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
        </Link>
      </MotionReveal>
    </div>
  )
}
