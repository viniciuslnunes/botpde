import type { ReactNode } from 'react'
import { NoticiasArtigoCard } from './noticias-artigo-card'
import { NoticiasDestaqueBento } from './noticias-destaque-bento'
import { NoticiasJogosCarrossel, NoticiasSidebarJogos } from './noticias-jogos-widgets'
import { NoticiasVideosCurtos } from './noticias-videos-curtos'
import {
  filtrarVideosCurtoNoticias,
  hrefNoticiaPraca,
  particionarNoticiasFeed,
} from '@/lib/noticias-feed-layout'
import type { PartidaNoticiasCard } from '@/lib/noticias-jogos-feed'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'
import type { NoticiaPracaItem } from '@/lib/praca'

export function NoticiasFeedShell({
  itens,
  sufixo,
  escopo,
  podeGerir,
  userId,
  currentUser,
  ordem,
  jogos,
  podeEnviarVideo,
  hrefEnviarVideo,
  children,
}: {
  itens: NoticiaPracaItem[]
  sufixo: string
  escopo: EscopoComunidade
  podeGerir: boolean
  userId: string
  currentUser: { id: string; nome: string | null; avatarUrl: string | null }
  ordem: 'acessados' | 'em_alta' | 'recentes'
  jogos: { proximos: PartidaNoticiasCard[]; recentes: PartidaNoticiasCard[] }
  podeEnviarVideo?: boolean
  hrefEnviarVideo?: string
  children: ReactNode
}) {
  const videos = filtrarVideosCurtoNoticias(itens).slice(0, 10)
  const carrosselJogos = [...jogos.proximos, ...jogos.recentes].slice(0, 12)
  const temSidebar = jogos.proximos.length > 0 || jogos.recentes.length > 0

  return (
    <div className="space-y-6">
      <div
        className={
          temSidebar
            ? 'grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_19rem]'
            : 'space-y-6'
        }
      >
        <div className="min-w-0 space-y-6">
          <NoticiasJogosCarrossel partidas={carrosselJogos} />
          {children}
          <NoticiasVideosCurtos
            itens={videos}
            sufixo={sufixo}
            podeEnviar={podeEnviarVideo}
            hrefEnviar={hrefEnviarVideo}
          />
          <NoticiasFeed
            itens={itens}
            sufixo={sufixo}
            escopo={escopo}
            podeGerir={podeGerir}
            userId={userId}
            currentUser={currentUser}
            ordem={ordem}
          />
        </div>

        {temSidebar ? (
          <NoticiasSidebarJogos proximos={jogos.proximos} recentes={jogos.recentes} />
        ) : null}
      </div>
    </div>
  )
}

function NoticiasFeed({
  itens,
  sufixo,
  escopo,
  podeGerir,
  userId,
  currentUser,
  ordem,
}: {
  itens: NoticiaPracaItem[]
  sufixo: string
  escopo: EscopoComunidade
  podeGerir: boolean
  userId: string
  currentUser: { id: string; nome: string | null; avatarUrl: string | null }
  ordem: 'acessados' | 'em_alta' | 'recentes'
}) {
  const { destaques, lista } = particionarNoticiasFeed(itens)
  const temDestaque = destaques.length >= 3
  const listaFinal = temDestaque ? lista : itens
  const mostrarPosicao = ordem === 'acessados' || ordem === 'em_alta'
  const offsetPosicao = temDestaque ? 3 : 0

  return (
    <div className="space-y-6">
      {temDestaque ? (
        <NoticiasDestaqueBento
          destaques={destaques}
          sufixo={sufixo}
          escopo={escopo}
          podeGerir={podeGerir}
          userId={userId}
        />
      ) : null}

      {listaFinal.length > 0 ? (
        <section>
          {temDestaque ? (
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
              Mais notícias
            </h2>
          ) : null}
          <ul className="divide-y divide-[rgb(var(--border))]">
            {listaFinal.map((item, i) => (
              <li key={`${item.kind}-${item.id}`}>
                <NoticiasArtigoCard
                  item={item}
                  href={hrefNoticiaPraca(item.id, sufixo)}
                  escopo={escopo}
                  podeGerir={podeGerir}
                  userId={userId}
                  currentUser={currentUser}
                  posicao={mostrarPosicao ? offsetPosicao + i + 1 : undefined}
                  sufixo={sufixo}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
