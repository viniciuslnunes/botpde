'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import {
  Bus,
  CalendarDays,
  Drum,
  LayoutGrid,
  MapPin,
  MessageSquareText,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import {
  MANDO_JOGO_LABEL,
  MEMORIA_ESCOPO,
  TIPO_EVENTO_LABEL,
  filtrarDiasPorCapitulo,
  type MemoriaEscopo,
} from '@torcida/types'
import { MotionEmptyState } from '@/components/motion/motion-empty-state'
import { LogoMiniatura } from '@/components/media/logo-miniatura'
import { MemoriaMark } from '@/components/portal/memoria-mark'
import { fadeUp, springGentle } from '@/lib/motion-presets'
import {
  agruparEspinhaPorMes,
  clampDiaIso,
  diaNoMesVizinho,
  diasEmTorno,
  isMemoriaDiaIso,
  limitesCalendarioMemoria,
  mesIsoDe,
  montarEspinhaCalendario,
  resolverDiaInicial,
  type MemoriaDiaDetalhe,
  type MemoriaFiltro,
  type MemoriaMontada,
} from '@/lib/memoria-dia'
import { formatMonthYear, formatWeekdayLong, parseDateOnly } from '@/lib/format-datetime'
import {
  sugerirConviteDia,
  type MemoriaEstatisticas,
  type MemoriaParalelo,
} from '@/lib/memoria-acervo'
import { MemoriaFoto } from './memoria-foto'
import { MemoriaComposer } from './memoria-composer'
import { MemoriaCompartilhar } from './memoria-compartilhar'
import { MemoriaPresencaBloco } from './memoria-presenca'
import { MemoriaTimeline } from './memoria-timeline'
import { ScrollRail } from '@/components/ui/scroll-rail'
import { MemoriaBusca } from './memoria-busca'
import { MemoriaEstatisticasBloco } from './memoria-estatisticas'
import { MemoriaNesteDia } from './memoria-neste-dia'
import { MemoriaConviteBloco } from './memoria-convite'
import { MemoriaMarcoBloco } from './memoria-marco-bloco'
import { MemoriaCapitulosNav } from './memoria-capitulos-nav'
import type { MemoriaCapituloResumo } from '../_lib/memoria-capitulos'
import type { MemoriaFatoFila, MemoriaPresenca } from '../_lib/carregar-memoria'

const FILTROS: Array<{ id: MemoriaFiltro; label: string; Icon: LucideIcon }> = [
  { id: 'todos', label: 'Tudo', Icon: LayoutGrid },
  { id: 'jogo', label: 'Jogo', Icon: Trophy },
  { id: 'evento', label: 'Evento', Icon: CalendarDays },
  { id: 'publicacao', label: 'Publicação', Icon: MessageSquareText },
]

const ESCOPO_LABEL: Record<MemoriaEscopo, string> = {
  unidade: 'Unidade',
  torcida: 'Torcida',
  clube: 'Clube',
}

const ESCOPO_SUB: Record<MemoriaEscopo, string> = {
  unidade: 'O que rolou nesta unidade, dia a dia.',
  torcida: 'A linha da torcida — sede e unidades.',
  clube: 'Os jogos e o que a Nação publicou. Sem caravana, ensaio ou fato de torcida.',
}

type Props = {
  tenantNome: string
  clubeNome: string | null
  logoUrl: string | null
  hojeIso: string
  montada: MemoriaMontada
  escopo: MemoriaEscopo
  escoposDisponiveis: MemoriaEscopo[]
  mostrarChips: boolean
  podeCriarFato: boolean
  fatosDoAutor: MemoriaFatoFila[]
  presenca: MemoriaPresenca | null
  estatisticas: MemoriaEstatisticas
  paralelos: MemoriaParalelo[]
  capitulos: MemoriaCapituloResumo[]
  capituloAtivo: MemoriaCapituloResumo | null
  podeGerirAcervo: boolean
}

export function MemoriaExplorer({
  tenantNome,
  clubeNome,
  logoUrl,
  hojeIso,
  montada,
  escopo,
  escoposDisponiveis,
  mostrarChips,
  podeCriarFato,
  fatosDoAutor,
  presenca,
  estatisticas,
  paralelos,
  capitulos,
  capituloAtivo,
  podeGerirAcervo,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const filtroRaw = parseFiltro(searchParams.get('f'))
  const filtro: MemoriaFiltro =
    escopo === MEMORIA_ESCOPO.CLUBE && filtroRaw === 'evento' ? 'todos' : filtroRaw
  const diaQuery = searchParams.get('dia')
  const limites = useMemo(() => limitesCalendarioMemoria(hojeIso), [hojeIso])
  const ancora = useMemo(() => {
    const pedido = isMemoriaDiaIso(diaQuery) ? diaQuery : hojeIso
    return clampDiaIso(pedido, limites.minIso, limites.maxIso)
  }, [diaQuery, hojeIso, limites.maxIso, limites.minIso])
  const diasJanela = useMemo(() => {
    const base = diasEmTorno(ancora, limites.minIso, limites.maxIso)
    if (!capituloAtivo) return base
    return filtrarDiasPorCapitulo(capituloAtivo.dias, base)
  }, [ancora, limites.maxIso, limites.minIso, capituloAtivo])
  const espinha = useMemo(
    () => montarEspinhaCalendario(diasJanela, montada.porDia),
    [diasJanela, montada.porDia],
  )
  const grupos = useMemo(() => agruparEspinhaPorMes(espinha), [espinha])
  const diaIso =
    isMemoriaDiaIso(diaQuery) && diasJanela.includes(diaQuery)
      ? diaQuery
      : (resolverDiaInicial(espinha, diaQuery, hojeIso) ?? ancora)
  const dia = diaIso
    ? (montada.porDia[diaIso] ?? {
        dia: diaIso,
        partida: null,
        eventos: [],
        posts: [],
        fotos: [],
        marco: null,
      })
    : null
  const filtrosVisiveis =
    escopo === MEMORIA_ESCOPO.CLUBE ? FILTROS.filter((f) => f.id !== 'evento') : FILTROS
  const mesLabel = formatMonthYear(parseDateOnly(ancora))
  const prevMes = clampDiaIso(diaNoMesVizinho(diaIso, -1), limites.minIso, limites.maxIso)
  const nextMes = clampDiaIso(diaNoMesVizinho(diaIso, 1), limites.minIso, limites.maxIso)
  const podeMesAnterior = mesIsoDe(prevMes) < mesIsoDe(diaIso)
  const podeMesSeguinte = mesIsoDe(nextMes) > mesIsoDe(diaIso)

  function irPara(next: string, nextFiltro: MemoriaFiltro = filtro) {
    router.replace(hrefMemoria(next, nextFiltro, escopo, capituloAtivo?.slug), { scroll: false })
  }

  function aplicarFiltro(next: MemoriaFiltro) {
    irPara(diaIso, next)
  }

  function irEscopo(next: MemoriaEscopo) {
    router.replace(hrefMemoria(diaIso, filtro, next, capituloAtivo?.slug), { scroll: false })
  }

  function irMes(delta: -1 | 1) {
    const alvo = delta < 0 ? prevMes : nextMes
    if (mesIsoDe(alvo) === mesIsoDe(diaIso)) return
    irPara(alvo)
  }

  return (
    <div className="flex min-h-[calc(100dvh-7.5rem)] flex-col gap-5 lg:min-h-[calc(100dvh-8.5rem)] lg:flex-row lg:gap-8">
      <aside className="memoria-no-print lg:sticky lg:top-20 lg:flex lg:h-[calc(100dvh-8.5rem)] lg:w-80 lg:shrink-0 lg:flex-col">
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface)_/_0.55)] p-4 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
          <header className="mb-3 flex min-w-0 items-center gap-3">
            <MarcaMemoria src={logoUrl} alt={tenantNome} />
            <div className="min-w-0 flex-1">
              <p className="portal-kicker text-[rgb(var(--color-primary-fg))]">Memórias</p>
              <h1 className="portal-display mt-0.5 truncate text-lg text-[rgb(var(--foreground))]">
                {tenantNome}
              </h1>
            </div>
          </header>

          <p className="mb-4 text-xs leading-relaxed text-[rgb(var(--foreground-muted))]">
            {ESCOPO_SUB[escopo]}
          </p>

          <MemoriaBusca escopo={escopo} />
          <MemoriaCapitulosNav
            capitulos={capitulos}
            capituloAtivo={capituloAtivo}
            escopo={escopo}
          />
          <MemoriaEstatisticasBloco stats={estatisticas} />

          {mostrarChips && escoposDisponiveis.length > 1 && (
            <div
              className={[
                'mb-3 grid gap-0.5 rounded-xl bg-[rgb(var(--background-subtle))] p-0.5',
                escoposDisponiveis.length === 3 ? 'grid-cols-3' : 'grid-cols-2',
              ].join(' ')}
              role="tablist"
              aria-label="Recorte da memória"
            >
              {escoposDisponiveis.map((id) => {
                const ativo = escopo === id
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={ativo}
                    onClick={() => irEscopo(id)}
                    className={[
                      'app-touch-target min-w-0 rounded-[0.625rem] px-1.5 text-center font-mono text-[10px] font-medium uppercase tracking-[0.14em] transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary)_/_0.45)]',
                      ativo
                        ? 'bg-[rgb(var(--surface))] text-[rgb(var(--foreground))] shadow-sm'
                        : 'text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
                    ].join(' ')}
                  >
                    {ESCOPO_LABEL[id]}
                  </button>
                )
              })}
            </div>
          )}

          <ScrollRail
            className="-mx-1 mb-4 flex gap-1 px-1"
            role="group"
            aria-label="Filtrar a linha do tempo"
          >
            {filtrosVisiveis.map((f) => {
              const ativo = filtro === f.id
              const Icon = f.Icon
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => aplicarFiltro(f.id)}
                  aria-pressed={ativo}
                  className={[
                    'app-touch-target flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary)_/_0.45)]',
                    ativo
                      ? 'border-[rgb(var(--color-primary)_/_0.35)] bg-[rgb(var(--color-primary)_/_0.12)] text-[rgb(var(--color-primary-fg))]'
                      : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:border-[rgb(var(--border-strong))] hover:text-[rgb(var(--foreground))]',
                  ].join(' ')}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="font-mono text-[10px] font-medium uppercase leading-none tracking-[0.12em]">
                    {f.label}
                  </span>
                </button>
              )
            })}
          </ScrollRail>

          <MemoriaTimeline
            grupos={grupos}
            espinha={espinha}
            diaIso={diaIso}
            hojeIso={hojeIso}
            filtro={filtro}
            porDia={montada.porDia}
            mesLabel={mesLabel}
            podeMesAnterior={podeMesAnterior}
            podeMesSeguinte={podeMesSeguinte}
            minIso={limites.minIso}
            maxIso={limites.maxIso}
            onSelect={irPara}
            onMes={irMes}
          />
        </div>
      </aside>

      <section className="memoria-print-area min-w-0 flex-1">
        <AnimatePresence mode="wait">
          {dia ? (
            <m.div
              key={dia.dia}
              initial="hidden"
              animate="show"
              exit="hidden"
              variants={fadeUp}
              transition={springGentle}
            >
              <PainelDia
                dia={dia}
                clubeNome={clubeNome}
                logoUrl={logoUrl}
                hojeIso={hojeIso}
                escopo={escopo}
                podeCriarFato={podeCriarFato && escopo !== MEMORIA_ESCOPO.CLUBE}
                fatosDoAutor={fatosDoAutor}
                presenca={escopo === MEMORIA_ESCOPO.CLUBE ? null : presenca}
                paralelos={paralelos}
                podeGerirAcervo={podeGerirAcervo}
              />
            </m.div>
          ) : (
            <MotionEmptyState
              icon={<MemoriaMark className="mb-3 h-8 w-8 text-[rgb(var(--foreground-muted))]" />}
              title={
                montada.espinha.length === 0 ? 'A linha ainda está em branco' : 'Nada neste recorte'
              }
              description={
                montada.espinha.length === 0
                  ? emptyCopy(escopo)
                  : 'Tente outro filtro — o dia continua na linha.'
              }
            />
          )}
        </AnimatePresence>
      </section>
    </div>
  )
}

function MarcaMemoria({ src, alt }: { src: string | null; alt: string }) {
  if (src) {
    return <LogoMiniatura src={src} alt={alt} className="rounded-lg" rounded="rounded-lg" />
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]">
      <MemoriaMark className="h-4 w-4" />
    </span>
  )
}

function PainelDia({
  dia,
  clubeNome,
  logoUrl,
  hojeIso,
  escopo,
  podeCriarFato,
  fatosDoAutor,
  presenca,
  paralelos,
  podeGerirAcervo,
}: {
  dia: MemoriaDiaDetalhe
  clubeNome: string | null
  logoUrl: string | null
  hojeIso: string
  escopo: MemoriaEscopo
  podeCriarFato: boolean
  fatosDoAutor: MemoriaFatoFila[]
  presenca: MemoriaPresenca | null
  paralelos: MemoriaParalelo[]
  podeGerirAcervo: boolean
}) {
  const parts = parseDateOnly(dia.dia)
  const titulo = formatWeekdayLong(parts)
  const ehHoje = dia.dia === hojeIso
  const temConteudo = dia.partida || dia.eventos.length > 0 || dia.posts.length > 0
  const convite = sugerirConviteDia(dia, hojeIso, podeCriarFato)
  const [composerAberto, setComposerAberto] = useState(false)
  const [composerSeed, setComposerSeed] = useState<string | null>(null)
  const composerKey = `${dia.dia}-${composerAberto ? 'open' : 'closed'}-${composerSeed ?? ''}`

  function editarMarco() {
    if (!dia.marco) return
    const linhas = [`marco: ${dia.marco.titulo}`]
    if (dia.marco.descricao?.trim()) linhas.push(dia.marco.descricao.trim())
    setComposerSeed(linhas.join('\n'))
    setComposerAberto(true)
  }

  return (
    <div className="relative space-y-6">
      <header className="relative overflow-hidden rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--surface)_/_0.65)] px-5 py-5 sm:px-6">
        <span
          aria-hidden
          className="pointer-events-none absolute -right-2 -top-4 select-none font-mono text-[7rem] font-black leading-none tracking-tighter text-[rgb(var(--foreground)_/_0.04)] sm:text-[8.5rem]"
        >
          {String(parts.day).padStart(2, '0')}
        </span>
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <p className="portal-kicker text-[rgb(var(--foreground-muted))]">
              {dia.dia.slice(0, 4)}
            </p>
            {ehHoje && (
              <span className="rounded-full bg-[rgb(var(--color-primary)_/_0.14)] px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-[rgb(var(--color-primary-fg))]">
                Hoje
              </span>
            )}
          </div>
          <h2 className="portal-display mt-1 text-2xl text-[rgb(var(--foreground))] sm:text-3xl">
            {titulo}
          </h2>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[rgb(var(--foreground-muted))]">
              {resumoDia(dia)}
            </p>
            <MemoriaCompartilhar diaIso={dia.dia} tituloDia={titulo} />
          </div>
        </div>
      </header>

      {(podeCriarFato || podeGerirAcervo) && (
        <MemoriaComposer
          key={composerKey}
          diaIso={dia.dia}
          hojeIso={hojeIso}
          eventos={dia.eventos}
          posts={dia.posts}
          podeGerirAcervo={podeGerirAcervo}
          iniciarAberto={composerAberto}
          seed={composerSeed}
        />
      )}

      <MemoriaNesteDia paralelos={paralelos} escopo={escopo} />

      <MemoriaMarcoBloco
        marco={dia.marco}
        podeGerir={podeGerirAcervo}
        onEditar={editarMarco}
      />

      {convite && (
        <MemoriaConviteBloco convite={convite} onAceitar={() => setComposerAberto(true)} />
      )}

      {dia.partida && (
        <article className="relative overflow-hidden rounded-3xl border border-[rgb(var(--color-primary)_/_0.28)] bg-[rgb(var(--color-primary)_/_0.08)] px-5 py-5">
          <p className="portal-kicker text-[rgb(var(--color-primary-fg))]">Jogo do dia</p>
          <p className="portal-display mt-2 text-xl text-[rgb(var(--foreground))] sm:text-2xl">
            {clubeNome ?? 'Nós'}{' '}
            <span className="font-normal text-[rgb(var(--foreground-muted))]">×</span>{' '}
            {dia.partida.adversario}
          </p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[rgb(var(--foreground-muted))]">
            {MANDO_JOGO_LABEL[dia.partida.mando]} · {dia.partida.hora}
            {dia.partida.competicao ? ` · ${dia.partida.competicao}` : ''}
          </p>
          {dia.partida.status === 'ENCERRADA' &&
            dia.partida.placarCasa != null &&
            dia.partida.placarFora != null && (
              <p className="mt-3 font-mono text-3xl font-semibold tabular-nums tracking-tight text-[rgb(var(--foreground))]">
                {dia.partida.placarCasa}
                <span className="mx-1.5 text-[rgb(var(--foreground-muted))]">–</span>
                {dia.partida.placarFora}
              </p>
            )}
        </article>
      )}

      {dia.eventos.length > 0 && (
        <section className="space-y-2">
          <h3 className="portal-kicker text-[rgb(var(--foreground-muted))]">Na rua</h3>
          <ul className="space-y-2">
            {dia.eventos.map((ev) => {
              const Icon = ev.tipo === 'CARAVANA' ? Bus : ev.tipo === 'ENSAIO' ? Drum : CalendarDays
              return (
                <li key={ev.id}>
                  <Link
                    href={ev.href}
                    className="flex min-w-0 items-center gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 transition-colors hover:border-[rgb(var(--color-primary)_/_0.35)]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--background-subtle))] text-[rgb(var(--color-primary-fg))]">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold uppercase tracking-wide text-[rgb(var(--foreground))]">
                        {ev.titulo}
                      </span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[rgb(var(--foreground-muted))]">
                        <span>{TIPO_EVENTO_LABEL[ev.tipo]}</span>
                        <span>·</span>
                        <span className="tabular-nums">{ev.hora}</span>
                        {ev.local && (
                          <>
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{ev.local}</span>
                          </>
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {presenca && (presenca.pessoas.length > 0 || presenca.viewerCheckIn) && (
        <MemoriaPresencaBloco presenca={presenca} destaque={dia.eventos.length > 0} />
      )}

      {dia.fotos.length > 0 && (
        <section className="space-y-2">
          <h3 className="portal-kicker text-[rgb(var(--foreground-muted))]">Imagens</h3>
          <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {dia.fotos.slice(0, 12).map((url) => {
              const href = hrefDaFoto(dia, url)
              return (
                <li
                  key={url}
                  className="relative aspect-square min-w-0 overflow-hidden rounded-xl bg-[rgb(var(--background-subtle))]"
                >
                  {href ? (
                    <Link href={href} className="absolute inset-0">
                      <MemoriaFoto src={url} alt="" className="object-cover" />
                    </Link>
                  ) : (
                    <MemoriaFoto src={url} alt="" className="object-cover" />
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {dia.posts.length > 0 && (
        <section className="space-y-2">
          <h3 className="portal-kicker text-[rgb(var(--foreground-muted))]">Publicações</h3>
          <ul className="space-y-2">
            {dia.posts.map((post) => (
              <li key={post.id}>
                <Link
                  href={post.href}
                  className="flex min-w-0 gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 transition-colors hover:border-[rgb(var(--color-primary)_/_0.35)]"
                >
                  <span className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[rgb(var(--background-subtle))]">
                    {post.autorAvatar ? (
                      <MemoriaFoto
                        src={post.autorAvatar}
                        alt=""
                        sizes="36px"
                        className="object-cover"
                      />
                    ) : (
                      <MessageSquareText className="h-4 w-4 text-[rgb(var(--foreground-muted))]" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-bold uppercase tracking-wide text-[rgb(var(--foreground))]">
                        {post.autorNome}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-[rgb(var(--foreground-muted))]">
                        {post.hora}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-sm text-[rgb(var(--foreground-muted))]">
                      {post.deCoirma && escopo === MEMORIA_ESCOPO.TORCIDA && (
                        <span
                          className="mr-1.5 inline-flex rounded-md bg-[rgb(var(--color-info)_/_0.12)] px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[rgb(var(--color-info-fg))]"
                          title={post.tenantNome ?? 'Coirmã'}
                        >
                          Coirmã
                        </span>
                      )}
                      {post.memoriaOficial && (
                        <span className="mr-1.5 inline-flex rounded-md bg-[rgb(var(--color-primary)_/_0.14)] px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[rgb(var(--color-primary-fg))]">
                          Memória oficial
                        </span>
                      )}
                      {post.atrasado && !post.memoriaOficial && (
                        <span className="mr-1.5 inline-flex rounded-md bg-[rgb(var(--color-info)_/_0.12)] px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[rgb(var(--color-info-fg))]">
                          Memória
                        </span>
                      )}
                      {post.trecho}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {fatosDoAutor.length > 0 && (
        <section className="space-y-2">
          <h3 className="portal-kicker text-[rgb(var(--foreground-muted))]">
            Seus fatos neste dia
          </h3>
          <ul className="space-y-2">
            {fatosDoAutor.map((f) => (
              <li
                key={f.id}
                className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 text-sm"
              >
                <p className="text-[rgb(var(--foreground-muted))]">{f.conteudo}</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[rgb(var(--foreground-muted))]">
                  {f.status === 'PENDENTE' ? 'Aguardando moderação' : 'Recusado'}
                </p>
                {f.status === 'REJEITADA' && f.motivoRejeicao && (
                  <p className="mt-1 text-xs text-[rgb(var(--color-danger-fg))]">
                    {f.motivoRejeicao}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!temConteudo && !podeCriarFato && !podeGerirAcervo && (
        <MotionEmptyState
          icon={
            <span className="mb-3">
              <MarcaMemoria src={logoUrl} alt="" />
            </span>
          }
          title="Nada neste dia"
          description="Tente outro dia no calendário — há datas para os dois lados."
        />
      )}
    </div>
  )
}

function parseFiltro(raw: string | null): MemoriaFiltro {
  if (raw === 'jogo' || raw === 'evento' || raw === 'publicacao') return raw
  return 'todos'
}

function hrefMemoria(
  dia: string | null | undefined,
  filtro: MemoriaFiltro,
  escopo: MemoriaEscopo,
  cap?: string | null,
): string {
  const p = new URLSearchParams()
  p.set('escopo', escopo)
  if (dia) p.set('dia', dia)
  if (filtro !== 'todos') p.set('f', filtro)
  if (cap) p.set('cap', cap)
  return `/portal/memoria?${p.toString()}`
}

function emptyCopy(escopo: MemoriaEscopo): string {
  if (escopo === MEMORIA_ESCOPO.CLUBE) {
    return 'Quando o time jogar ou o torcedor publicar no nacional, o dia nasce aqui. Caravana e ensaio ficam na memória da torcida ou da unidade.'
  }
  if (escopo === MEMORIA_ESCOPO.TORCIDA) {
    return 'Quando a sede ou as unidades publicarem, o dia nasce aqui.'
  }
  return 'Nada neste dia ainda. Role o calendário ou ligue um fato atrasado abaixo.'
}

function hrefDaFoto(dia: MemoriaDiaDetalhe, url: string): string | null {
  const post = dia.posts.find((p) => p.fotos.includes(url))
  if (post) return post.href
  const evento = dia.eventos.find((e) => e.fotoUrl === url)
  return evento?.href ?? null
}

function resumoDia(dia: MemoriaDiaDetalhe): string {
  const partes: string[] = []
  if (dia.partida) partes.push('jogo')
  if (dia.eventos.length === 1) partes.push('1 evento')
  if (dia.eventos.length > 1) partes.push(`${dia.eventos.length} eventos`)
  if (dia.posts.length === 1) partes.push('1 publicação')
  if (dia.posts.length > 1) partes.push(`${dia.posts.length} publicações`)
  if (dia.fotos.length > 0)
    partes.push(`${dia.fotos.length} ${dia.fotos.length === 1 ? 'imagem' : 'imagens'}`)
  if (dia.marco) partes.unshift('marco institucional')
  return partes.length > 0 ? partes.join(' · ') : 'Nada neste dia'
}
