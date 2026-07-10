import { auth } from '@/lib/auth'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import { db } from '@torcida/db'
import { PERMISSIONS, calculateEffectivePermissions, hasPermission } from '@torcida/types'
import { MessageCircleWarning, ShieldAlert } from 'lucide-react'
import Link from 'next/link'
import { linkPostComunidade } from '@/lib/comunidade-social'
import {
  resolverDenuncia,
  descartarDenuncia,
  resolverDenunciaMensagem,
  descartarDenunciaMensagem,
} from './actions'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Moderação da Comunidade' }

interface DenunciaPendente {
  id: string
  motivo: string
  criadoEm: Date
  post: { id: string; titulo: string | null; conteudo: string }
  denunciante: { nome: string | null; email: string | null }
}

interface DenunciaMensagemPendente {
  id: string
  motivo: string
  criadoEm: Date
  mensagem: {
    id: string
    conteudo: string
    removidaEm: Date | null
    autor: { nome: string | null }
  }
  denunciante: { nome: string | null; email: string | null }
}

function formatarData(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(data)
}

export default async function ModeracaoComunidadePage() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id || !tenant) redirect('/admin')

  const { rolePermissions, overrides } = await getUserPermissionsInTenant(session.user.id, tenant.id)
  const effective = calculateEffectivePermissions(rolePermissions, overrides)
  const podeModerarPosts = hasPermission(effective, PERMISSIONS.COMMUNITY_MODERATE)
  const podeModerarMensagens = hasPermission(effective, PERMISSIONS.MESSAGES_MODERATE)
  if (!podeModerarPosts && !podeModerarMensagens) redirect('/admin')

  const denuncias: DenunciaPendente[] = podeModerarPosts
    ? await db.denuncia.findMany({
        where: { tenantId: tenant.id, status: 'PENDENTE' },
        orderBy: { criadoEm: 'asc' },
        select: {
          id: true,
          motivo: true,
          criadoEm: true,
          post: { select: { id: true, titulo: true, conteudo: true } },
          denunciante: { select: { nome: true, email: true } },
        },
      })
    : []

  // Best-effort: tabela pode não existir antes da migração da mensageria
  let denunciasMensagem: DenunciaMensagemPendente[] = []
  if (podeModerarMensagens) {
    try {
      denunciasMensagem = await db.denunciaMensagem.findMany({
        where: { tenantId: tenant.id, status: 'PENDENTE' },
        orderBy: { criadoEm: 'asc' },
        select: {
          id: true,
          motivo: true,
          criadoEm: true,
          mensagem: {
            select: {
              id: true,
              conteudo: true,
              removidaEm: true,
              autor: { select: { nome: true } },
            },
          },
          denunciante: { select: { nome: true, email: true } },
        },
      })
    } catch {
      denunciasMensagem = []
    }
  }

  return (
    <div className="space-y-6 px-8 py-6">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 text-[rgb(var(--foreground-muted))]" />
        <div>
          <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Moderação da comunidade</h1>
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            Revise denúncias pendentes de posts e decida entre resolver ou descartar.
          </p>
        </div>
      </div>

      {podeModerarPosts && denuncias.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-8 text-center text-sm text-[rgb(var(--foreground-muted))]">
          Nenhuma denúncia de post pendente no momento.
        </div>
      ) : (
        <div className="space-y-3">
          {denuncias.map((denuncia) => (
            <div
              key={denuncia.id}
              className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
                  {denuncia.post.titulo ?? 'Post sem título'}
                </p>
                <div className="flex items-center gap-3">
                  <Link
                    href={linkPostComunidade(denuncia.post.id)}
                    className="text-xs font-medium text-[rgb(var(--primary))] hover:underline"
                    target="_blank"
                  >
                    Ver post
                  </Link>
                  <p className="text-xs text-[rgb(var(--foreground-muted))]">
                    {formatarData(denuncia.criadoEm)}
                  </p>
                </div>
              </div>

              <p className="mt-2 line-clamp-3 text-sm text-[rgb(var(--foreground-muted))]">
                {denuncia.post.conteudo}
              </p>

              <div className="mt-3 rounded-lg bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm">
                <p className="font-medium text-[rgb(var(--foreground))]">Motivo da denúncia</p>
                <p className="mt-1 text-[rgb(var(--foreground-muted))]">{denuncia.motivo}</p>
                <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">
                  Denunciante: {denuncia.denunciante.nome ?? denuncia.denunciante.email ?? 'Usuário'}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <form action={resolverDenuncia.bind(null, denuncia.id)}>
                  <button
                    type="submit"
                    className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                  >
                    Resolver e ocultar post
                  </button>
                </form>
                <form action={descartarDenuncia.bind(null, denuncia.id)}>
                  <button
                    type="submit"
                    className="rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                  >
                    Descartar denúncia
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      {podeModerarMensagens && (
        <section className="space-y-3 pt-2">
          <div className="flex items-start gap-3">
            <MessageCircleWarning className="mt-0.5 h-5 w-5 text-[rgb(var(--foreground-muted))]" />
            <div>
              <h2 className="text-lg font-bold text-[rgb(var(--foreground))]">
                Denúncias de mensagens
              </h2>
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                Mensagens diretas e de grupos denunciadas pelos membros.
              </p>
            </div>
          </div>

          {denunciasMensagem.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-8 text-center text-sm text-[rgb(var(--foreground-muted))]">
              Nenhuma denúncia de mensagem pendente no momento.
            </div>
          ) : (
            <div className="space-y-3">
              {denunciasMensagem.map((denuncia) => (
                <div
                  key={denuncia.id}
                  className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
                      Mensagem de {denuncia.mensagem.autor.nome ?? 'Membro'}
                      {denuncia.mensagem.removidaEm && ' (já removida)'}
                    </p>
                    <p className="text-xs text-[rgb(var(--foreground-muted))]">
                      {formatarData(denuncia.criadoEm)}
                    </p>
                  </div>

                  <p className="mt-2 line-clamp-3 text-sm text-[rgb(var(--foreground-muted))]">
                    {denuncia.mensagem.removidaEm ? 'Mensagem removida' : denuncia.mensagem.conteudo}
                  </p>

                  <div className="mt-3 rounded-lg bg-[rgb(var(--background-subtle))] px-3 py-2 text-sm">
                    <p className="font-medium text-[rgb(var(--foreground))]">Motivo da denúncia</p>
                    <p className="mt-1 text-[rgb(var(--foreground-muted))]">{denuncia.motivo}</p>
                    <p className="mt-2 text-xs text-[rgb(var(--foreground-muted))]">
                      Denunciante: {denuncia.denunciante.nome ?? denuncia.denunciante.email ?? 'Usuário'}
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <form action={resolverDenunciaMensagem.bind(null, denuncia.id)}>
                      <button
                        type="submit"
                        className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                      >
                        Resolver e remover mensagem
                      </button>
                    </form>
                    <form action={descartarDenunciaMensagem.bind(null, denuncia.id)}>
                      <button
                        type="submit"
                        className="rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:bg-[rgb(var(--background-subtle))]"
                      >
                        Descartar denúncia
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
