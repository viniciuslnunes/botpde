import Image from 'next/image'
import { getNoticiasAprovadas } from '@/lib/noticias'
import { getPostsFeedNacional } from '@/lib/feed'
import type { AfiliacaoComunidade } from '@/lib/comunidade-contexto'
import { Users } from 'lucide-react'
import { WidgetSection } from '@/components/sofascore/widget-section'
import { FeedPostCard } from '@/components/portal/feed-post-card'
import { canOptimizeImageUrl } from '@/lib/optimizable-image'

type Props = {
  afiliacao: AfiliacaoComunidade
  currentUser: { id: string; nome: string | null; avatarUrl: string | null }
}

export async function ComunidadeNacionalShell({ afiliacao, currentUser }: Props) {
  const [noticias, { posts }] = await Promise.all([
    getNoticiasAprovadas(afiliacao.id),
    getPostsFeedNacional(afiliacao.id, currentUser.id || undefined, { take: 20 }),
  ])
  const nomeClube = afiliacao.apelido || afiliacao.nome

  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
        <div className="flex items-start gap-3">
          {afiliacao.escudoUrl ? (
            canOptimizeImageUrl(afiliacao.escudoUrl) ? (
              <Image
                src={afiliacao.escudoUrl}
                alt={`Escudo do ${nomeClube}`}
                width={44}
                height={44}
                className="h-11 w-11 shrink-0 object-contain"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={afiliacao.escudoUrl}
                alt={`Escudo do ${nomeClube}`}
                className="h-11 w-11 shrink-0 object-contain"
              />
            )
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--color-primary))]/10 text-[rgb(var(--color-primary))]">
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

      <WidgetSection contexto="clube" afiliacaoSlug={afiliacao.slug} limit={4} titulo="Sofascore" />

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
                    className="mt-2 inline-block text-sm font-medium text-[rgb(var(--color-primary))] hover:underline"
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
