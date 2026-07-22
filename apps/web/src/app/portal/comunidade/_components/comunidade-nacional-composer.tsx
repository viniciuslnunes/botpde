'use client'

import { useRef, useState, useTransition } from 'react'
import { ImagePlus, Loader2, Send, X } from 'lucide-react'
import { toast } from '@torcida/ui'
import { publicarPostComoTorcedorGlobal } from '@/app/portal/comunidade/actions'
import { uploadMediaToCloudinary } from '@/lib/cloudinary-upload'
import {
  criarPreviewOtimista,
  emitirPostPublicado,
  novoIdOtimista,
} from '@/lib/feed-live-refresh'
import { Avatar } from '@/components/portal/avatar'

const MAX_CONTEUDO = 3000
const MAX_ANEXOS = 4
const MAX_IMG_MB = 10

type Props = {
  currentUser: { id: string; nome: string | null; avatarUrl: string | null }
  tenantId: string
  tenantNome: string
}

/**
 * Composer mínimo da Comunidade Nacional — torcedor global (sem torcida na
 * plataforma) publicando post público no clube. Só texto + imagens; enquetes,
 * eventos, menções e stickers ficam no composer completo da torcida.
 */
export function ComunidadeNacionalComposer({ currentUser, tenantId, tenantNome }: Props) {
  const [conteudo, setConteudo] = useState('')
  const [midias, setMidias] = useState<string[]>([])
  const [enviandoMidia, setEnviandoMidia] = useState(false)
  const [pending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const optimisticIdRef = useRef<string | null>(null)

  const primeiroNome = currentUser.nome?.trim().split(/\s+/)[0] ?? 'torcedor'
  const podePublicar = conteudo.trim().length > 0 && !pending && !enviandoMidia

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const restantes = MAX_ANEXOS - midias.length
    if (restantes <= 0) {
      toast.error(`Máximo de ${MAX_ANEXOS} imagens por publicação.`)
      return
    }
    const selecionados = Array.from(files).slice(0, restantes)
    for (const file of selecionados) {
      if (!file.type.startsWith('image/')) {
        toast.error('Apenas imagens são permitidas aqui.')
        continue
      }
      if (file.size > MAX_IMG_MB * 1024 * 1024) {
        toast.error(`Imagem muito grande (máx. ${MAX_IMG_MB}MB).`)
        continue
      }
      setEnviandoMidia(true)
      void uploadMediaToCloudinary(file)
        .then((url) => setMidias((prev) => (prev.length < MAX_ANEXOS ? [...prev, url] : prev)))
        .catch((error: unknown) =>
          toast.error(error instanceof Error ? error.message : 'O upload falhou.'),
        )
        .finally(() => setEnviandoMidia(false))
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handlePublicar() {
    const texto = conteudo.trim()
    if (!texto) return

    const id = novoIdOtimista()
    optimisticIdRef.current = id
    emitirPostPublicado({
      preview: criarPreviewOtimista({
        id,
        tenantId,
        conteudo: texto,
        midiaUrls: midias,
        visibilidade: 'PUBLICO',
        autor: {
          id: currentUser.id,
          nome: currentUser.nome,
          avatarUrl: currentUser.avatarUrl,
          cargoNome: 'Torcedor',
        },
        tenantNome,
      }),
      filtroAlvo: 'descobrir',
    })

    startTransition(async () => {
      try {
        const preview = await publicarPostComoTorcedorGlobal(texto, midias)
        setConteudo('')
        setMidias([])
        emitirPostPublicado({
          preview,
          substituirId: optimisticIdRef.current ?? undefined,
          filtroAlvo: 'descobrir',
        })
        optimisticIdRef.current = null
        toast.success('Post publicado na comunidade do clube!')
      } catch (error) {
        if (optimisticIdRef.current) {
          emitirPostPublicado({ removerId: optimisticIdRef.current })
          optimisticIdRef.current = null
        }
        toast.error(error instanceof Error ? error.message : 'Não foi possível publicar.')
      }
    })
  }

  return (
    <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <div className="flex gap-3">
        <Avatar nome={currentUser.nome} avatarUrl={currentUser.avatarUrl} size="md" />
        <div className="min-w-0 flex-1">
          <textarea
            value={conteudo}
            onChange={(e) => setConteudo(e.target.value.slice(0, MAX_CONTEUDO))}
            placeholder={`No que você tá pensando, ${primeiroNome}?`}
            rows={3}
            disabled={pending}
            className="w-full resize-none rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--foreground-muted))] focus:border-[rgb(var(--color-primary))] focus:outline-none disabled:opacity-60"
          />

          {midias.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {midias.map((url) => (
                <div key={url} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt="Anexo do post"
                    className="h-20 w-20 rounded-xl border border-[rgb(var(--border))] object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setMidias((prev) => prev.filter((m) => m !== url))}
                    disabled={pending}
                    aria-label="Remover imagem"
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-[rgb(var(--foreground))] p-0.5 text-[rgb(var(--background))] hover:opacity-80"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={pending || enviandoMidia || midias.length >= MAX_ANEXOS}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-[rgb(var(--foreground-muted))] hover:bg-[rgb(var(--background))] disabled:opacity-50"
              >
                {enviandoMidia ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="h-4 w-4" />
                )}
                Imagem
              </button>
              <span className="text-xs text-[rgb(var(--foreground-muted))]">
                {conteudo.length}/{MAX_CONTEUDO}
              </span>
            </div>
            <button
              type="button"
              onClick={handlePublicar}
              disabled={!podePublicar}
              className="inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--color-primary))] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Publicar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
