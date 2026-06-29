import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CadastroForm } from '@/components/portal/cadastro-form'
import { ArrowLeft, CheckCircle2, Clock } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Solicitar cadastro' }

export default async function CadastroPage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])

  if (!session?.user?.id) redirect('/entrar')

  const membro = tenant
    ? await db.saasMembro.findUnique({
        where: { tenantId_userId: { tenantId: tenant.id, userId: session.user.id } },
        select: { id: true, status: true, nome: true, tipo: true },
      })
    : null

  // Cadastro aprovado → redireciona para o portal
  if (membro?.status === 'APROVADO') redirect('/portal')

  // Cadastro pendente → mostra aviso, não o formulário
  if (membro?.status === 'PENDENTE') {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <div>
          <Link
            href="/portal"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao portal
          </Link>
          <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">
            Solicitação em análise
          </h1>
        </div>

        <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-6 dark:border-yellow-800 dark:bg-yellow-950">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900">
              <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <h2 className="font-semibold text-yellow-900 dark:text-yellow-100">
                Aguardando aprovação
              </h2>
              <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
                Sua solicitação foi recebida e está sendo analisada pelos administradores da
                torcida. Em breve você receberá uma resposta.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 text-sm text-[rgb(var(--foreground-muted))]">
          <p className="font-medium text-[rgb(var(--foreground))]">O que acontece depois?</p>
          <ul className="mt-2 space-y-1.5 list-disc list-inside">
            <li>Os admins revisam seus dados e aprovam ou reprovam</li>
            <li>Após aprovação, você passa a ser membro ativo</li>
            <li>Se for sócio, o admin emite sua carteirinha digital</li>
          </ul>
        </div>
      </div>
    )
  }

  const jaCadastrado = membro?.status === 'REPROVADO'
  const nomeInicial = membro?.nome ?? session.user.name ?? ''

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Cabeçalho */}
      <div>
        <Link
          href="/portal"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao portal
        </Link>

        <h1 className="text-2xl font-bold text-[rgb(var(--foreground))]">
          {jaCadastrado ? 'Reenviar cadastro' : 'Solicitar cadastro'}
        </h1>
        <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
          {jaCadastrado
            ? 'Seu cadastro anterior foi reprovado. Corrija suas informações e envie novamente.'
            : `Preencha o formulário para solicitar sua filiação${tenant ? ` à ${tenant.nome}` : ''}.`}
        </p>
      </div>

      {/* O que você ganha */}
      {!jaCadastrado && (
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Como membro você terá acesso a
          </p>
          <ul className="space-y-1.5 text-sm text-[rgb(var(--foreground))]">
            {[
              'Comunidade exclusiva da torcida',
              'Informações sobre eventos, caravanas e ingressos',
              'Carteirinha digital de sócio (para associados)',
              'Descontos em produtos da loja oficial',
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Formulário */}
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-sm">
        <CadastroForm
          nomeInicial={nomeInicial}
          corPrimaria={tenant?.corPrimaria ?? '#7c3aed'}
          jaCadastrado={jaCadastrado}
        />
      </div>
    </div>
  )
}
