import { contextoAdmin } from '@/lib/admin-modulos'
import { redirect } from 'next/navigation'
import { db } from '@torcida/db'
import {
  PERMISSIONS,
  hasPermission,
  labelCategoriaViolacao,
  ordenarPorPrioridade,
  slaVencido,
} from '@torcida/types'
import { MessageCircleWarning, MessagesSquare } from 'lucide-react'
import {
  resolverDenuncia,
  descartarDenuncia,
  resolverDenunciaMensagem,
  descartarDenunciaMensagem,
  resolverDenunciaModeracao,
  descartarDenunciaModeracao,
} from './actions'
import { ModeracaoDenunciasClient } from './moderacao-denuncias-client'
import {
  alvoSoEscala,
  carregarAlvosModeracao,
  chaveAlvoModeracao,
  ROTULO_ALVO_MODERACAO,
  type AlvoModeracao,
} from '@/lib/moderacao-alvos'
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

interface ModeracaoDenunciaPendente {
  id: string
  alvoTipo: AlvoModeracao
  alvoId: string
  categoria: string
  gravidade: 'S0' | 'S1' | 'S2' | 'S3' | 'S4'
  motivo: string | null
  prazoSla: Date | null
  escalado: boolean
  criadoEm: Date
  denunciante: { nome: string | null; email: string | null }
}

function formatarData(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(data)
}

export default async function ModeracaoComunidadePage() {
  const { tenant, permissoes: effective } = await contextoAdmin()
  const podeModerarPosts = hasPermission(effective, PERMISSIONS.COMMUNITY_MODERATE)
  const podeModerarMensagens = hasPermission(effective, PERMISSIONS.MESSAGES_MODERATE)
  const podeVer = hasPermission(effective, PERMISSIONS.COMMUNITY_VIEW)
  if (!podeModerarPosts && !podeModerarMensagens && !podeVer) redirect('/admin')

  // Denúncias de post, mensagem e fórum são independentes → um round-trip.
  // A tabela pode não existir em bases sem o schema novo aplicado: catch → [].
  const [denuncias, denunciasMensagem, denunciasForum]: [
    DenunciaPendente[],
    DenunciaMensagemPendente[],
    ModeracaoDenunciaPendente[],
  ] = await Promise.all([
    podeModerarPosts || podeVer
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
    podeModerarPosts || podeVer
      ? db.moderacaoDenuncia
          .findMany({
            where: { tenantId: tenant.id, status: 'PENDENTE' },
            orderBy: { criadoEm: 'asc' },
            take: 100,
            select: {
              id: true,
              alvoTipo: true,
              alvoId: true,
              categoria: true,
              gravidade: true,
              motivo: true,
              prazoSla: true,
              escalado: true,
              criadoEm: true,
              denunciante: { select: { nome: true, email: true } },
            },
          })
          .catch(() => [] as ModeracaoDenunciaPendente[])
      : Promise.resolve([]),
  ])

  // `ModeracaoDenuncia` não tem relação com o alvo (uma tabela por superfície):
  // o registro resolve o lote com uma query por tipo presente.
  const alvosForum = await carregarAlvosModeracao(denunciasForum)
  const agora = new Date()
  const filaForum = [...denunciasForum].sort(ordenarPorPrioridade).map((d) => {
    const alvo = alvosForum.get(chaveAlvoModeracao(d.alvoTipo, d.alvoId))
    return {
      id: d.id,
      alvoLabel: ROTULO_ALVO_MODERACAO[d.alvoTipo],
      categoriaLabel: labelCategoriaViolacao(d.categoria),
      gravidade: d.gravidade,
      criadoEmLabel: formatarData(d.criadoEm),
      prazoLabel: d.prazoSla ? formatarData(d.prazoSla) : null,
      slaVencido: slaVencido(d.prazoSla, agora),
      escalado: d.escalado,
      motivo: d.motivo,
      trecho: alvo?.trecho ?? 'Conteúdo não encontrado (pode ter sido excluído).',
      autorNome: alvo?.autorNome ?? 'Autor desconhecido',
      denunciante: d.denunciante.nome ?? d.denunciante.email ?? 'Usuário',
      ocultado: alvo?.ocultado ?? false,
      linkAlvo: alvo?.link ?? null,
      // Superfície sem ocultação: a fila diz isso ao moderador em vez de
      // oferecer um "Resolver e ocultar" que não age sobre nada.
      soEscalonamento: alvoSoEscala(d.alvoTipo),
    }
  })

  return (
    <div className="space-y-6">
      <p className="text-sm text-[rgb(var(--foreground-muted))]">
        {podeModerarPosts || podeModerarMensagens
          ? 'Revise denúncias pendentes de posts, mensagens e fórum e decida entre resolver ou descartar.'
          : 'Somente leitura — denúncias pendentes (sem permissão para decidir).'}
      </p>

      {(podeModerarPosts || podeVer) && (
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
          podeModerarPosts={podeModerarPosts}
          mostrarPosts
          podeModerarMensagens={false}
          onResolverPost={resolverDenuncia}
          onDescartarPost={descartarDenuncia}
          onResolverMensagem={resolverDenunciaMensagem}
          onDescartarMensagem={descartarDenunciaMensagem}
        />
      )}

      {(podeModerarPosts || podeVer) && (
        <section className="space-y-3 pt-2">
          <div className="flex items-start gap-3">
            <MessagesSquare className="mt-0.5 h-5 w-5 text-[rgb(var(--foreground-muted))]" />
            <div>
              <h2 className="text-lg font-bold text-[rgb(var(--foreground))]">Fórum e praça</h2>
              <p className="text-sm text-[rgb(var(--foreground-muted))]">
                A única superfície onde torcidas rivais se encontram. A fila vem por gravidade e
                prazo, não por data — caso crítico é decidido pela plataforma.
              </p>
            </div>
          </div>

          <ModeracaoDenunciasClient
            denunciasPosts={[]}
            denunciasMensagens={[]}
            denunciasForum={filaForum}
            mostrarForum
            podeModerarForum={podeModerarPosts}
            podeModerarPosts={false}
            podeModerarMensagens={false}
            mostrarPosts={false}
            onResolverForum={resolverDenunciaModeracao}
            onDescartarForum={descartarDenunciaModeracao}
            onResolverPost={resolverDenuncia}
            onDescartarPost={descartarDenuncia}
            onResolverMensagem={resolverDenunciaMensagem}
            onDescartarMensagem={descartarDenunciaMensagem}
          />
        </section>
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
