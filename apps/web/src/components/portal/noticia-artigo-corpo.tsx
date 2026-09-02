'use client'

import { PostMedia } from '@/components/portal/post-media'
import { Avatar } from '@/components/portal/avatar'
import { fatiarTextoEmBlocosHistoria } from '@/lib/social-embed'
import { blocosDeArtigoLegado, parseArtigoBlocos, parseArtigoBloco } from '@torcida/types'

type ArtigoBloco = NonNullable<ReturnType<typeof parseArtigoBloco>>

function historiaParaLeitura(blocos: ArtigoBloco[]): ArtigoBloco[] {
  const out: ArtigoBloco[] = []
  for (const bloco of blocos) {
    if (bloco.tipo !== 'texto') {
      out.push(bloco)
      continue
    }
    for (const fatia of fatiarTextoEmBlocosHistoria(bloco.texto)) {
      out.push(fatia)
    }
  }
  return out
}

function TextoHistoria({ texto }: { texto: string }) {
  const paragrafos = texto.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  const linhas = paragrafos.length > 0 ? paragrafos : [texto]
  return (
    <div className="space-y-5">
      {linhas.map((paragrafo, i) => (
        <p
          key={i}
          className="text-[1.0625rem] leading-[1.75] text-[rgb(var(--foreground))] [text-wrap:pretty]"
        >
          {inlineComNegrito(paragrafo)}
        </p>
      ))}
    </div>
  )
}

function inlineComNegrito(texto: string) {
  const partes = texto.split(/(\*\*[^*]+\*\*)/g)
  return partes.map((parte, i) => {
    if (parte.startsWith('**') && parte.endsWith('**') && parte.length > 4) {
      return (
        <strong key={i} className="font-semibold">
          {parte.slice(2, -2)}
        </strong>
      )
    }
    return (
      <span key={i} className="whitespace-pre-wrap">
        {parte}
      </span>
    )
  })
}

export function NoticiaArtigoCorpo({
  blocos,
  corpo,
  midiaUrls,
}: {
  blocos?: unknown
  corpo?: string | null
  midiaUrls?: string[]
}) {
  const parsed = parseArtigoBlocos(blocos)
  const historia: ArtigoBloco[] = historiaParaLeitura(
    parsed.length > 0 ? parsed : blocosDeArtigoLegado(corpo, midiaUrls),
  )

  if (historia.length === 0) return null

  return (
    <div className="space-y-8">
      {historia.map((bloco, i) => {
        if (bloco.tipo === 'texto') {
          return <TextoHistoria key={`t-${i}`} texto={bloco.texto} />
        }
        const legenda = 'legenda' in bloco ? bloco.legenda : undefined
        return (
          <figure key={`m-${i}`} className="min-w-0">
            <PostMedia urls={[bloco.url]} className="mt-0" caption={legenda ?? null} eager />
            {legenda ? (
              <figcaption className="mt-2 text-sm leading-relaxed text-[rgb(var(--foreground-muted))]">
                {legenda}
              </figcaption>
            ) : null}
          </figure>
        )
      })}
    </div>
  )
}

export function NoticiaArtigoLeitura({
  titulo,
  resumo,
  autorNome,
  autorAvatarUrl,
  publicadoEm,
  origem,
  visitas,
  blocos,
  corpo,
  midiaUrls,
  compact = false,
}: {
  titulo: string
  resumo?: string | null
  autorNome?: string | null
  autorAvatarUrl?: string | null
  publicadoEm?: Date | string | null
  origem?: 'OFICIAL' | 'VERIFICADA' | 'imprensa' | 'oficial' | 'verificada'
  visitas?: number
  blocos?: unknown
  corpo?: string | null
  midiaUrls?: string[]
  compact?: boolean
}) {
  const quando = publicadoEm ? new Date(publicadoEm) : null
  const data =
    quando && !Number.isNaN(quando.getTime())
      ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(quando)
      : null
  const selo =
    origem === 'VERIFICADA' || origem === 'verificada'
      ? 'Fonte verificada'
      : origem === 'imprensa'
        ? null
        : 'Oficial'

  return (
    <article className={compact ? 'w-full min-w-0' : 'mx-auto w-full max-w-[40rem]'}>
      <h1
        className={[
          'text-balance font-bold leading-tight tracking-tight text-[rgb(var(--foreground))]',
          compact ? 'text-lg sm:text-xl' : 'text-[1.65rem] sm:text-[2rem]',
        ].join(' ')}
      >
        {titulo}
      </h1>
      {resumo ? (
        <p className="mt-3 text-[1.05rem] font-normal leading-relaxed text-[rgb(var(--foreground-muted))] [text-wrap:pretty]">
          {resumo}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-[rgb(var(--foreground-muted))]">
        {autorNome ? (
          <span className="inline-flex items-center gap-2">
            <Avatar nome={autorNome} avatarUrl={autorAvatarUrl} size="xs" />
            <span>
              Por <span className="font-medium text-[rgb(var(--foreground))]">{autorNome}</span>
            </span>
          </span>
        ) : null}
        {selo ? <span>· {selo}</span> : null}
        {data ? <span>· {data}</span> : null}
        {visitas != null ? (
          <span>
            · {visitas} {visitas === 1 ? 'visualização' : 'visualizações'}
          </span>
        ) : null}
      </div>

      <hr className="mt-5 border-[rgb(var(--border))]" />

      <div className="mt-8">
        <NoticiaArtigoCorpo blocos={blocos} corpo={corpo} midiaUrls={midiaUrls} />
      </div>
    </article>
  )
}
