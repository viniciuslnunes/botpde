import { auth } from '@/lib/auth'
import { getTenantFromHost, getUserPermissionsInTenant } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import { db } from '@torcida/db'
import { PERMISSIONS, calculateEffectivePermissions, hasPermission } from '@torcida/types'
import { MessageCircleWarning, ShieldAlert } from 'lucide-react'
import {
  resolverDenuncia,
  descartarDenuncia,
  resolverDenunciaMensagem,
  descartarDenunciaMensagem,
} from './actions'
import { ModeracaoDenunciasClient } from './moderacao-denuncias-client'
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

  // Denúncias de posts e de mensagens são independentes → um round-trip.
  // A tabela de mensagens pode não existir em bases antigas: catch → [].
  const [denuncias, denunciasMensagem]: [
    DenunciaPendente[],
    DenunciaMensagemPendente[],
  ] = await Promise.all([
    podeModerarPosts
      ? db.denuncia.findMany({
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
      : Promise.resolve([]),
    podeModerarMensagens
      ? db.denunciaMensagem
          .findMany({
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
          .catch(() => [] as DenunciaMensagemPendente[])
      : Promise.resolve([]),
  ])

  return (
    <div className="app-container space-y-6 py-6">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 text-[rgb(var(--foreground-muted))]" />
        <div>
          <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">Moderação da comunidade</h1>
          <p className="text-sm text-[rgb(var(--foreground-muted))]">
            Revise denúncias pendentes de posts e decida entre resolver ou descartar.
          </p>
        </div>
      </div>

      {podeModerarPosts && (
        <ModeracaoDenunciasClient
          denunciasPosts={denuncias.map((d) => ({
            id: d.id,
            motivo: d.motivo,
            criadoEmLabel: formatarData(d.criadoEm),
            postId: d.post.id,
            postTitulo: d.post.titulo ?? 'Post sem título',
            postConteudo: d.post.conteudo,
            denunciante: d.denunciante.nome ?? d.denunciante.email ?? 'Usuário',
          }))}
          denunciasMensagens={[]}
          podeModerarPosts
          podeModerarMensagens={false}
          onResolverPost={resolverDenuncia}
          onDescartarPost={descartarDenuncia}
          onResolverMensagem={resolverDenunciaMensagem}
          onDescartarMensagem={descartarDenunciaMensagem}
        />
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

          <ModeracaoDenunciasClient
            denunciasPosts={[]}
            denunciasMensagens={denunciasMensagem.map((d) => ({
              id: d.id,
              motivo: d.motivo,
              criadoEmLabel: formatarData(d.criadoEm),
              autorNome: d.mensagem.autor.nome ?? 'Membro',
              conteudo: d.mensagem.removidaEm ? 'Mensagem removida' : d.mensagem.conteudo,
              removida: Boolean(d.mensagem.removidaEm),
              denunciante: d.denunciante.nome ?? d.denunciante.email ?? 'Usuário',
            }))}
            podeModerarPosts={false}
            podeModerarMensagens
            onResolverPost={resolverDenuncia}
            onDescartarPost={descartarDenuncia}
            onResolverMensagem={resolverDenunciaMensagem}
            onDescartarMensagem={descartarDenunciaMensagem}
          />
        </section>
      )}
    </div>
  )
}
