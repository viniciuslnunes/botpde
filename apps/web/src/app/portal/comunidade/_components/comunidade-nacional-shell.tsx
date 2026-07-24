import Link from 'next/link'
import dynamic from 'next/dynamic'
import { getNoticiasAprovadas } from '@/lib/noticias'
import { getPostsFeedNacional } from '@/lib/feed'
import type { AfiliacaoComunidade } from '@/lib/comunidade-contexto'
import type { SolicitacaoSocioPendente } from '@/lib/onboarding'
import { Clock, ListOrdered, Users } from 'lucide-react'
import { FeedPostCard } from '@/components/portal/feed-post-card'
import { LogoImage } from '@/components/media/logo-image'
import { getOrCreateComunidadeNacionalTenant } from '@/lib/comunidade-contexto'

const FeedComposer = dynamic(
  () => import('@/components/portal/feed-composer').then((mod) => mod.FeedComposer),
  {
    loading: () => (
      <div className="h-24 animate-pulse rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]" />
    ),
  },
)

type Props = {
  afiliacao: AfiliacaoComunidade
  currentUser: { id: string; nome: string | null; avatarUrl: string | null }
  solicitacaoPendente?: SolicitacaoSocioPendente | null
}

export async function ComunidadeNacionalShell({
  afiliacao,
  currentUser,
  solicitacaoPendente = null,
}: Props) {
  const [noticias, { posts }, tenantSintetico] = await Promise.all([
    getNoticiasAprovadas(afiliacao.id),
    getPostsFeedNacional(afiliacao.id, currentUser.id || undefined, { take: 20 }),
    getOrCreateComunidadeNacionalTenant(afiliacao.id),
  ])
  const nomeClube = afiliacao.apelido || afiliacao.nome

  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
        <div className="flex items-start gap-3">
          {afiliacao.escudoUrl ? (
            <LogoImage
              src={afiliacao.escudoUrl}
              alt={`Escudo do ${nomeClube}`}
              size={44}
              className="h-11 w-11 shrink-0 object-contain"
            />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--color-primary))]/10 text-[rgb(var(--color-primary-fg))]">
              <Users className="h-5 w-5" />
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">
              Comunidade nacional — {nomeClube}
            </h1>
            <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
              Você entrou como torcedor do clube, sem vínculo com uma organizada na plataforma.
              Acompanhe aqui os posts públicos das torcidas de {nomeClube} e as notícias curadas
              do time.
            </p>
          </div>
        </div>
      </div>

      {solicitacaoPendente && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <Clock className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm">
            Sua solicitação de sócio na <strong>{solicitacaoPendente.tenantNome}</strong> está em
            análise pela diretoria. Você continua aqui, na Comunidade Nacional, até ser aprovado
            ou reprovado — a gente te avisa assim que houver uma decisão.
          </p>
        </div>
      )}

      {afiliacao.slug && (
        <Link
          href="/portal/comunidade/classificacao"
          className="flex items-center gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 transition-colors hover:border-[rgb(var(--primary)_/_0.5)]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--color-primary)_/_0.12)] text-[rgb(var(--color-primary-fg))]">
            <ListOrdered className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[rgb(var(--foreground))]">Classificação</p>
            <p className="mt-0.5 text-xs text-[rgb(var(--foreground-muted))]">
              Tabela ao vivo do campeonato de {nomeClube}
            </p>
          </div>
        </Link>
      )}

      <FeedComposer
        userId={currentUser.id}
        userName={currentUser.nome}
        userAvatar={currentUser.avatarUrl}
        tenantId={tenantSintetico.id}
        tenantNome={`${nomeClube} — Comunidade Nacional`}
        nacional
        autorBadges={{
          cargoNome: 'Torcedor',
          departamentoNome: null,
          sedeNome: null,
        }}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
          Posts das torcidas
        </h2>
        {posts.length > 0 ? (
          <div className="space-y-4">
            {posts.map((post) => (
              <FeedPostCard
                key={post.id}
                post={post}
                showTenantBadge
                currentUser={currentUser}
                salvo={false}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[rgb(var(--border))] p-8 text-center text-sm text-[rgb(var(--foreground-muted))]">
            As torcidas de {nomeClube} ainda não publicaram posts públicos. Quando publicarem,
            eles aparecem aqui.
          </div>
        )}
      </section>

      {noticias.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
            Notícias do clube
          </h2>
          <ul className="space-y-3">
            {noticias.slice(0, 12).map((n) => (
              <li
                key={n.id}
                className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4"
              >
                <p className="font-semibold text-[rgb(var(--foreground))]">{n.titulo}</p>
                {n.resumo && (
                  <p className="mt-1 line-clamp-2 text-sm text-[rgb(var(--foreground-muted))]">
                    {n.resumo}
                  </p>
                )}
                {n.url && (
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-sm font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
                  >
                    Ler na fonte
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="rounded-2xl border border-dashed border-[rgb(var(--border))] p-10 text-center text-sm text-[rgb(var(--foreground-muted))]">
          Ainda não há notícias curadas para {nomeClube}. Volte em breve ou entre em uma torcida
          organizada quando houver na plataforma.
        </div>
      )}
    </main>
  )
}
