import { getNoticiasAprovadas } from '@/lib/noticias'
import type { AfiliacaoComunidade } from '@/lib/comunidade-contexto'
import { Users } from 'lucide-react'
import { WidgetSection } from '@/components/sofascore/widget-section'

type Props = {
  afiliacao: AfiliacaoComunidade
}

export async function ComunidadeNacionalShell({ afiliacao }: Props) {
  const noticias = await getNoticiasAprovadas(afiliacao.id)
  const nomeClube = afiliacao.apelido || afiliacao.nome

  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--color-primary))]/10 text-[rgb(var(--color-primary))]">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[rgb(var(--foreground))]">
              Comunidade nacional — {nomeClube}
            </h1>
            <p className="mt-1 text-sm text-[rgb(var(--foreground-muted))]">
              Você entrou como torcedor do clube, sem vínculo com uma organizada na plataforma.
              Acompanhe notícias curadas do time; quando torcidas de {nomeClube} aderirem, o feed
              nacional de posts aparece aqui.
            </p>
          </div>
        </div>
      </div>

      <WidgetSection contexto="clube" afiliacaoSlug={afiliacao.slug} limit={4} titulo="Sofascore" />

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
