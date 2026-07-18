'use client'

import { useState } from 'react'
import { FileSearch, ImageOff, X } from 'lucide-react'

/**
 * Visualização do comprovante de vínculo do sócio (dado RESTRITO — renderizado
 * direto da URL do upload, sem cache intermediário). Lightbox simples com
 * estado local; sem biblioteca extra.
 */
export function ComprovanteLightbox({
  imagemUrl,
  nome,
  numeroAssociado,
  anosSocio,
}: {
  imagemUrl: string
  nome: string
  numeroAssociado: string | null
  anosSocio?: number | null
}) {
  const [aberto, setAberto] = useState(false)
  const [carregou, setCarregou] = useState(false)
  const [erro, setErro] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-[rgb(var(--color-primary-fg))] transition-colors hover:bg-[rgb(var(--color-primary)_/_0.1)]"
      >
        <FileSearch className="h-3.5 w-3.5" />
        Ver comprovante
      </button>

      {aberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Comprovante de vínculo de ${nome}`}
          onClick={() => setAberto(false)}
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[rgb(var(--border))] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[rgb(var(--foreground))]">
                  Comprovante de vínculo — {nome}
                </p>
                <p className="text-xs text-[rgb(var(--foreground-muted))]">
                  Nº de associado: {numeroAssociado ?? 'não informado'}
                  {anosSocio != null && ` · Sócio há ${anosSocio} ano${anosSocio === 1 ? '' : 's'}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Fechar"
                className="rounded-lg p-1.5 text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex min-h-48 flex-1 items-center justify-center overflow-auto bg-[rgb(var(--background-subtle))] p-4">
              {erro ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <ImageOff className="h-8 w-8 text-[rgb(var(--foreground-muted))]" />
                  <p className="text-sm text-[rgb(var(--foreground-muted))]">
                    Não foi possível carregar o comprovante.
                  </p>
                  <a
                    href={imagemUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-[rgb(var(--primary))] hover:underline"
                  >
                    Abrir em nova aba
                  </a>
                </div>
              ) : (
                <>
                  {!carregou && (
                    <p className="absolute text-xs text-[rgb(var(--foreground-muted))]">
                      Carregando comprovante…
                    </p>
                  )}
                  {/* Dado RESTRITO: <img> direto da URL do upload, sem otimizador/cache. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagemUrl}
                    alt={`Comprovante de vínculo de ${nome}`}
                    className="max-h-[70vh] w-auto max-w-full rounded-lg object-contain"
                    onLoad={() => setCarregou(true)}
                    onError={() => setErro(true)}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
