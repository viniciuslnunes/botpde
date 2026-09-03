'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  Cake,
  CalendarDays,
  Check,
  ChevronDown,
  Globe2,
  ImageIcon,
  Landmark,
  Link2,
  Loader2,
  MessageSquareText,
  Play,
  Users,
  Video,
  X,
} from 'lucide-react'
import { toast } from '@torcida/ui'
import {
  MEMORIA_INTENCAO,
  diaValidoParaFatoAtrasado,
  diaValidoParaPublicarMemoria,
  resolverEntradaMemoria,
  type MemoriaIntencao,
} from '@torcida/types'
import type { MemoriaEventoDia, MemoriaPostDia } from '@/lib/memoria-dia'
import { uploadMediaToCloudinary } from '@/lib/cloudinary-upload'
import { FileDropOverlay, useFileDragOver } from '@/components/media/file-drop-overlay'
import {
  detectEmbedProvider,
  EMBED_HOSTS,
  ensureSocialEmbedInMidias,
  firstSocialUrlInText,
} from '@/lib/social-embed'
import { PostMedia } from '@/components/portal/post-media'
import { publicarNaMemoriaDoDia } from '../actions'
import { MemoriaVinculoPicker, type MemoriaVinculoItem } from './memoria-vinculo-picker'
import { AppButton } from '@/components/ui/button'

type Props = {
  diaIso: string
  hojeIso: string
  eventos?: MemoriaEventoDia[]
  posts?: MemoriaPostDia[]
  podeGerirAcervo?: boolean
  iniciarAberto?: boolean
  seed?: string | null
}

type ModoChip = typeof MEMORIA_INTENCAO.FATO | typeof MEMORIA_INTENCAO.MARCO | typeof MEMORIA_INTENCAO.ANIVERSARIO

type MediaItem = {
  id: string
  kind: 'image' | 'video'
  localUrl: string
  url: string | null
  progress: number
  error: string | null
}

const CHIPS: Array<{ id: ModoChip; label: string; Icon: typeof MessageSquareText }> = [
  { id: MEMORIA_INTENCAO.FATO, label: 'Relato', Icon: MessageSquareText },
  { id: MEMORIA_INTENCAO.MARCO, label: 'Marco', Icon: Landmark },
  { id: MEMORIA_INTENCAO.ANIVERSARIO, label: 'Aniversário', Icon: Cake },
]

const INTENCAO_UI: Record<
  MemoriaIntencao,
  { label: string; Icon: typeof MessageSquareText; hint: string }
> = {
  fato: {
    label: 'Relato',
    Icon: MessageSquareText,
    hint: 'Entra como memória ligada a este dia — moderação se for passado.',
  },
  marco: {
    label: 'Marco institucional',
    Icon: Landmark,
    hint: 'Marca o dia no acervo — visível para toda a torcida.',
  },
  aniversario: {
    label: 'Aniversário',
    Icon: Cake,
    hint: 'Registra aniversário institucional neste dia.',
  },
  evento: {
    label: 'Evento na Agenda',
    Icon: CalendarDays,
    hint: 'Caravanas e ensaios são criados na Agenda, não aqui.',
  },
}

const MAX_ANEXOS = 6
const MAX_IMG_MB = 10
const MAX_VIDEO_MB = 100

const TOOL =
  'app-touch-target flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--color-primary-fg))]'

const EVENTO_TIPO: Record<MemoriaEventoDia['tipo'], string> = {
  GERAL: 'Evento',
  CARAVANA: 'Caravana',
  ENSAIO: 'Ensaio',
}

const VISIBILIDADE_MEMORIA = [
  {
    value: 'PUBLICO' as const,
    label: 'Público',
    descricao: 'Comunidade e torcedores do clube',
    Icon: Globe2,
  },
  {
    value: 'TENANT' as const,
    label: 'Só a unidade',
    descricao: 'Membros aprovados desta unidade',
    Icon: Users,
  },
]

function modoInicialDeSeed(seed: string | null | undefined, podeGerir: boolean): ModoChip {
  if (!seed || !podeGerir) return MEMORIA_INTENCAO.FATO
  if (/^anivers[aá]rio\s*:/i.test(seed)) return MEMORIA_INTENCAO.ANIVERSARIO
  if (/^marco\s*:/i.test(seed)) return MEMORIA_INTENCAO.MARCO
  return MEMORIA_INTENCAO.FATO
}

function placeholderDeModo(modo: ModoChip, atrasado: boolean): string {
  if (modo === MEMORIA_INTENCAO.MARCO) {
    return 'Título do marco\nContexto opcional na linha de baixo.'
  }
  if (modo === MEMORIA_INTENCAO.ANIVERSARIO) {
    return 'Ex.: 40 anos da torcida\nUma linha de contexto, se quiser.'
  }
  return atrasado
    ? 'O que aconteceu e não foi publicado na hora. Cole um link do YouTube, Instagram, X ou TikTok — ou anexe foto e vídeo.'
    : 'O que entra na memória desta data. Foto, vídeo e links também entram.'
}

function itensEvento(eventos: MemoriaEventoDia[]): MemoriaVinculoItem[] {
  return eventos.map((ev) => ({
    id: ev.id,
    label: ev.titulo,
    sublabel: [EVENTO_TIPO[ev.tipo], ev.hora, ev.local].filter(Boolean).join(' · '),
    searchText: [ev.titulo, ev.tipo, ev.local, ev.hora].join(' '),
    thumbUrl: ev.fotoUrl,
  }))
}

function itensPost(posts: MemoriaPostDia[]): MemoriaVinculoItem[] {
  return posts.map((p) => ({
    id: p.id,
    label: p.trecho.slice(0, 72) || 'Publicação',
    sublabel: `${p.autorNome} · ${p.hora}`,
    searchText: [p.trecho, p.autorNome, p.hora].join(' '),
    thumbUrl: p.fotos[0] ?? null,
  }))
}

export function MemoriaComposer({
  diaIso,
  hojeIso,
  eventos = [],
  posts = [],
  podeGerirAcervo = false,
  iniciarAberto = false,
  seed = null,
}: Props) {
  const atrasado = diaValidoParaFatoAtrasado(diaIso, hojeIso)
  const [aberto, setAberto] = useState(iniciarAberto || Boolean(seed))
  const [modo, setModo] = useState<ModoChip>(() => modoInicialDeSeed(seed, podeGerirAcervo))
  const [texto, setTexto] = useState(seed ?? '')
  const [visibilidade, setVisibilidade] = useState<'PUBLICO' | 'TENANT'>('PUBLICO')
  const [eventoId, setEventoId] = useState<string | null>(null)
  const [postId, setPostId] = useState<string | null>(null)
  const [medias, setMedias] = useState<MediaItem[]>([])
  const [embedDispensado, setEmbedDispensado] = useState(false)
  const [pending, start] = useTransition()
  const fileDrag = useFileDragOver()
  const fotoRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (iniciarAberto) setAberto(true)
  }, [iniciarAberto])

  useEffect(() => {
    if (seed) {
      setTexto(seed)
      setModo(modoInicialDeSeed(seed, podeGerirAcervo))
      setAberto(true)
    }
  }, [seed, podeGerirAcervo])

  const entrada = useMemo(() => resolverEntradaMemoria(texto, modo), [texto, modo])
  const ui = INTENCAO_UI[entrada.intencao]
  const precisaGestao =
    entrada.intencao === MEMORIA_INTENCAO.MARCO ||
    entrada.intencao === MEMORIA_INTENCAO.ANIVERSARIO
  const bloqueadoGestao = precisaGestao && !podeGerirAcervo
  const bloqueadoEvento = entrada.intencao === MEMORIA_INTENCAO.EVENTO
  const modoRelato = entrada.intencao === MEMORIA_INTENCAO.FATO && !bloqueadoGestao
  const mostrarVinculos = modoRelato

  const embedUrl = embedDispensado || !modoRelato ? null : firstSocialUrlInText(texto)
  const embedProvider = embedUrl ? detectEmbedProvider(embedUrl) : null
  const enviandoMidia = medias.some((m) => m.url === null && !m.error)
  const anexos = medias.filter((m) => m.url).map((m) => m.url as string)
  const finalMidias =
    embedDispensado || !modoRelato
      ? anexos
      : ensureSocialEmbedInMidias(texto, [...anexos, ...(embedUrl ? [embedUrl] : [])])

  const eventoItens = useMemo(() => itensEvento(eventos), [eventos])
  const postItens = useMemo(() => itensPost(posts), [posts])

  if (!diaValidoParaPublicarMemoria(diaIso, hojeIso) && !podeGerirAcervo) {
    return null
  }

  function limparMidias() {
    for (const m of medias) URL.revokeObjectURL(m.localUrl)
    setMedias([])
    setEmbedDispensado(false)
  }

  function addFiles(files: FileList | File[], prefer?: 'imagem' | 'video') {
    const arr = Array.from(files).filter((f) =>
      prefer === 'video'
        ? f.type.startsWith('video/')
        : prefer === 'imagem'
          ? f.type.startsWith('image/')
          : f.type.startsWith('image/') || f.type.startsWith('video/'),
    )
    if (arr.length === 0) return
    const espaco = MAX_ANEXOS - medias.length
    if (espaco <= 0) {
      toast.error(`Máximo de ${MAX_ANEXOS} anexos por relato.`)
      return
    }
    for (const file of arr.slice(0, espaco)) {
      const isVideo = file.type.startsWith('video/')
      const limiteMB = isVideo ? MAX_VIDEO_MB : MAX_IMG_MB
      if (file.size > limiteMB * 1024 * 1024) {
        toast.error(`"${file.name}" passa de ${limiteMB}MB.`)
        continue
      }
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const item: MediaItem = {
        id,
        kind: isVideo ? 'video' : 'image',
        localUrl: URL.createObjectURL(file),
        url: null,
        progress: 0,
        error: null,
      }
      setMedias((prev) => [...prev, item])
      void uploadMediaToCloudinary(file, (pct) =>
        setMedias((prev) => prev.map((m) => (m.id === id ? { ...m, progress: pct } : m))),
      )
        .then((url) =>
          setMedias((prev) => prev.map((m) => (m.id === id ? { ...m, url, progress: 100 } : m))),
        )
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : 'Falha no upload'
          setMedias((prev) => prev.map((m) => (m.id === id ? { ...m, error: msg } : m)))
          toast.error(msg)
        })
    }
  }

  function removeMedia(id: string) {
    setMedias((prev) => {
      const alvo = prev.find((m) => m.id === id)
      if (alvo) URL.revokeObjectURL(alvo.localUrl)
      return prev.filter((m) => m.id !== id)
    })
  }

  function enviar() {
    const trimmed = texto.trim()
    const temMidia = finalMidias.length > 0

    if (!trimmed && !temMidia && !precisaGestao) {
      toast.error(
        atrasado
          ? 'Escreva o que rolou, ou anexe foto, vídeo ou link.'
          : 'Escreva o que entra neste dia, ou anexe mídia.',
      )
      return
    }
    if (precisaGestao && !trimmed) {
      toast.error('Escreva o título na primeira linha.')
      return
    }
    if (bloqueadoGestao) {
      toast.error('Marcos e aniversários são criados pela diretoria.')
      return
    }
    if (bloqueadoEvento) {
      toast.error('Crie o evento na Agenda — ele aparece aqui no dia.')
      return
    }
    if (enviandoMidia) {
      toast.error('Aguarde o envio das mídias terminar.')
      return
    }

    start(async () => {
      const res = await publicarNaMemoriaDoDia({
        dia: diaIso,
        texto: trimmed,
        midiaUrls: modoRelato ? finalMidias : [],
        visibilidade,
        modo,
        eventoId: eventoId ?? undefined,
        postId: postId ?? undefined,
      })
      if (res.error) {
        toast.error(res.error)
        return
      }

      if (precisaGestao) {
        toast.success('Marco salvo no acervo.')
      } else {
        toast.success(
          atrasado
            ? 'Enviado para a moderação — entra na linha quando for aprovado.'
            : 'Publicado neste dia.',
        )
      }
      setTexto('')
      setEventoId(null)
      setPostId(null)
      limparMidias()
      setModo(MEMORIA_INTENCAO.FATO)
      setAberto(false)
    })
  }

  const titulo = atrasado ? 'Ligar a este dia' : 'Publicar neste dia'
  const rotuloEnviar = (() => {
    if (bloqueadoEvento) return 'Ir para Agenda'
    if (precisaGestao) return 'Salvar marco'
    return atrasado ? 'Enviar para moderação' : 'Publicar'
  })()

  const chipsVisiveis = podeGerirAcervo
    ? CHIPS
    : CHIPS.filter((c) => c.id === MEMORIA_INTENCAO.FATO)

  const podeEnviar =
    !pending &&
    !enviandoMidia &&
    !bloqueadoGestao &&
    (precisaGestao
      ? trimmedObrigatorio(texto)
      : bloqueadoEvento || trimmedObrigatorio(texto) || finalMidias.length > 0)

  return (
    <section
      className={[
        'relative rounded-2xl border border-dashed transition-colors',
        aberto
          ? 'border-[rgb(var(--border))] p-4'
          : 'border-[rgb(var(--color-primary)_/_0.45)] bg-[rgb(var(--color-primary)_/_0.05)] p-3 hover:border-[rgb(var(--color-primary)_/_0.65)] hover:bg-[rgb(var(--color-primary)_/_0.08)]',
      ].join(' ')}
      onDragEnter={modoRelato ? fileDrag.onDragEnter : undefined}
      onDragOver={modoRelato ? fileDrag.onDragOver : undefined}
      onDragLeave={modoRelato ? fileDrag.onDragLeave : undefined}
      onDrop={
        modoRelato
          ? (e) => {
              const files = fileDrag.finishDrop(e)
              if (files.length) addFiles(files)
            }
          : undefined
      }
    >
      {modoRelato ? <FileDropOverlay active={fileDrag.active} /> : null}
      <input
        ref={fotoRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files, 'imagem')
          e.target.value = ''
        }}
      />
      <input
        ref={videoRef}
        type="file"
        accept="video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files, 'video')
          e.target.value = ''
        }}
      />

      {aberto ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[rgb(var(--foreground))]">
              <Link2 className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--color-primary-fg))]" aria-hidden />
              {titulo}
            </p>
            {(texto.trim() || finalMidias.length > 0) && (
              <span
                className={[
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.1em]',
                  bloqueadoGestao || bloqueadoEvento
                    ? 'border-[rgb(var(--color-warning)_/_0.35)] bg-[rgb(var(--color-warning)_/_0.1)] text-[rgb(var(--color-warning-fg))]'
                    : 'border-[rgb(var(--color-primary)_/_0.3)] bg-[rgb(var(--color-primary)_/_0.1)] text-[rgb(var(--color-primary-fg))]',
                ].join(' ')}
              >
                <ui.Icon className="h-3 w-3" aria-hidden />
                {ui.label}
              </span>
            )}
          </div>

          <div className="app-scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
            {chipsVisiveis.map((chip) => {
              const ativo = modo === chip.id
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => {
                    setModo(chip.id)
                    if (chip.id !== MEMORIA_INTENCAO.FATO) limparMidias()
                  }}
                  aria-pressed={ativo}
                  className={[
                    'app-touch-target inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.1em] transition-colors',
                    ativo
                      ? 'border-[rgb(var(--color-primary)_/_0.35)] bg-[rgb(var(--color-primary)_/_0.12)] text-[rgb(var(--color-primary-fg))]'
                      : 'border-[rgb(var(--border))] text-[rgb(var(--foreground-muted))] hover:text-[rgb(var(--foreground))]',
                  ].join(' ')}
                >
                  <chip.Icon className="h-3 w-3" aria-hidden />
                  {chip.label}
                </button>
              )
            })}
          </div>

          <textarea
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value)
              setEmbedDispensado(false)
            }}
            maxLength={2000}
            rows={4}
            placeholder={placeholderDeModo(modo, atrasado)}
            className="w-full resize-y rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-base text-[rgb(var(--foreground))]"
          />

          {modoRelato && medias.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {medias.map((media) => (
                <div
                  key={media.id}
                  className="relative h-20 w-20 overflow-hidden rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]"
                >
                  {media.kind === 'video' ? (
                    <>
                      <video src={media.localUrl} muted playsInline className="h-full w-full object-cover" />
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <Play className="h-6 w-6 fill-white text-white drop-shadow" />
                      </div>
                    </>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={media.localUrl} alt="" className="h-full w-full object-cover" />
                  )}
                  {media.url === null && !media.error ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                    </div>
                  ) : null}
                  {media.error ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-600/70 px-1 text-center text-[10px] font-medium text-white">
                      Falhou
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => removeMedia(media.id)}
                    aria-label="Remover anexo"
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {modoRelato && embedUrl && embedProvider ? (
            <div className="flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2">
              <Link2 className="h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))]" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-[rgb(var(--foreground))]">
                  Link do {EMBED_HOSTS[embedProvider]}
                </p>
                <p className="truncate text-[11px] text-[rgb(var(--foreground-muted))]">{embedUrl}</p>
              </div>
              <button
                type="button"
                onClick={() => setEmbedDispensado(true)}
                aria-label="Não embutir este link"
                className="app-touch-target rounded-lg p-1 text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--surface))]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}

          {modoRelato && (texto.trim() || finalMidias.length > 0) ? (
            <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] p-2">
              <p className="mb-1.5 px-1 text-[11px] font-medium text-[rgb(var(--foreground-muted))]">
                Prévia do relato
              </p>
              {finalMidias.length > 0 ? <PostMedia urls={finalMidias} caption={texto} /> : null}
              {texto.trim() ? (
                <p className="mt-2 whitespace-pre-wrap px-1 text-sm leading-relaxed text-[rgb(var(--foreground))]">
                  {texto.trim()}
                </p>
              ) : null}
            </div>
          ) : null}

          {modoRelato ? (
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => fotoRef.current?.click()}
                aria-label="Adicionar foto"
                title="Foto"
                className={TOOL}
              >
                <ImageIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => videoRef.current?.click()}
                aria-label="Adicionar vídeo"
                title="Vídeo"
                className={TOOL}
              >
                <Video className="h-5 w-5" />
              </button>
              <p className="text-[11px] text-[rgb(var(--foreground-muted))]">
                Arraste arquivos ou cole um link social no texto.
              </p>
            </div>
          ) : null}

          {texto.trim() && (
            <p className="text-xs leading-relaxed text-[rgb(var(--foreground-muted))]">
              {bloqueadoGestao
                ? 'Só a diretoria pode registrar marcos e aniversários.'
                : ui.hint}
            </p>
          )}

          {mostrarVinculos && (
            <div className="grid gap-3 sm:grid-cols-2">
              <MemoriaVinculoPicker
                kind="evento"
                label="Ligar ao evento (opcional)"
                placeholder="Buscar evento deste dia…"
                emptyMessage="Nenhum evento neste dia."
                items={eventoItens}
                valueId={eventoId}
                onChange={setEventoId}
                disabled={pending}
              />
              <MemoriaVinculoPicker
                kind="publicacao"
                label="Ligar à publicação (opcional)"
                placeholder="Buscar publicação deste dia…"
                emptyMessage="Nenhuma publicação neste dia."
                items={postItens}
                valueId={postId}
                onChange={setPostId}
                disabled={pending}
              />
            </div>
          )}

          {entrada.intencao === MEMORIA_INTENCAO.FATO && !bloqueadoGestao && (
            <fieldset className="space-y-2">
              <legend className="block text-xs font-medium text-[rgb(var(--foreground-muted))]">
                Quem vê
              </legend>
              <div
                role="radiogroup"
                aria-label="Quem vê este relato"
                className="flex flex-wrap gap-2"
              >
                {VISIBILIDADE_MEMORIA.map((opcao) => {
                  const selecionada = visibilidade === opcao.value
                  const Icon = opcao.Icon
                  return (
                    <button
                      key={opcao.value}
                      type="button"
                      role="radio"
                      aria-checked={selecionada}
                      disabled={pending}
                      onClick={() => setVisibilidade(opcao.value)}
                      className={[
                        'app-touch-target inline-flex w-fit max-w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary)_/_0.45)]',
                        selecionada
                          ? 'border-[rgb(var(--color-primary)_/_0.5)] bg-[rgb(var(--color-primary)_/_0.1)] shadow-[inset_0_0_0_1px_rgb(var(--color-primary)_/_0.15)]'
                          : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:border-[rgb(var(--color-primary)_/_0.28)] hover:bg-[rgb(var(--background-subtle))]',
                        pending ? 'opacity-60' : '',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors',
                          selecionada
                            ? 'border-[rgb(var(--color-primary)_/_0.35)] bg-[rgb(var(--color-primary)_/_0.14)] text-[rgb(var(--color-primary-fg))]'
                            : 'border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] text-[rgb(var(--foreground-muted))]',
                        ].join(' ')}
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span
                          className={[
                            'block text-sm font-semibold',
                            selecionada
                              ? 'text-[rgb(var(--color-primary-fg))]'
                              : 'text-[rgb(var(--foreground))]',
                          ].join(' ')}
                        >
                          {opcao.label}
                        </span>
                        <span className="mt-0.5 block text-xs leading-snug text-[rgb(var(--foreground-muted))] whitespace-nowrap">
                          {opcao.descricao}
                        </span>
                      </span>
                      {selecionada ? (
                        <Check
                          className="mt-1 h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))]"
                          aria-hidden
                        />
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <AppButton
              variant="none"
              icon={X}
              type="button"
              disabled={pending}
              onClick={() => setAberto(false)}
              className="app-action rounded-xl px-4 text-sm text-[rgb(var(--foreground-muted))]"
            >
              Cancelar
            </AppButton>
            {bloqueadoEvento ? (
              <Link
                href="/portal/eventos"
                className="app-action inline-flex rounded-xl bg-[rgb(var(--color-primary))] px-4 text-sm font-semibold text-[rgb(var(--color-primary-on))]"
              >
                Abrir Agenda
              </Link>
            ) : (
              <button
                type="button"
                disabled={!podeEnviar}
                onClick={enviar}
                className="app-action rounded-xl bg-[rgb(var(--color-primary))] px-4 text-sm font-semibold text-[rgb(var(--color-primary-on))] disabled:opacity-60"
              >
                {pending || enviandoMidia ? 'Enviando…' : rotuloEnviar}
              </button>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-expanded={false}
          className="app-action group flex w-full min-w-0 items-center gap-2.5 rounded-xl text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-primary)_/_0.45)] sm:gap-3"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[rgb(var(--color-primary)_/_0.3)] bg-[rgb(var(--color-primary)_/_0.12)] text-[rgb(var(--color-primary-fg))] transition-colors group-hover:bg-[rgb(var(--color-primary)_/_0.18)]">
            <Link2 className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[rgb(var(--color-primary-fg))]">
              {titulo}
            </span>
            <span className="mt-0.5 block text-xs leading-snug text-[rgb(var(--foreground-muted))]">
              {atrasado
                ? 'Relatar o que rolou — texto, foto, vídeo ou link'
                : 'Publicar relato, marco ou aniversário'}
            </span>
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-[rgb(var(--color-primary-fg))] opacity-70 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        </button>
      )}
    </section>
  )
}

function trimmedObrigatorio(texto: string) {
  return texto.trim().length > 0
}
