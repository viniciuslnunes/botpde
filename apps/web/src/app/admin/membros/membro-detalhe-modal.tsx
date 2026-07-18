'use client'

import { useEffect, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AnimatePresence, m } from 'motion/react'
import {
  ExternalLink,
  FileSearch,
  ImageOff,
  TriangleAlert,
  X,
} from 'lucide-react'
import { canOptimizeImageUrl } from '@/lib/optimizable-image'
import { MemberActions } from '@/components/admin/member-actions'
import {
  lightboxBackdrop,
  lightboxContent,
  springGentle,
} from '@/lib/motion-presets'
import type { AdminMembroItem } from './admin-membro-item'

function Campo({ label, value }: { label: string; value: ReactNode }) {
  const vazio =
    value === null ||
    value === undefined ||
    value === '' ||
    (typeof value === 'string' && value.trim() === '')
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-sm text-[rgb(var(--foreground))]">
        {vazio ? (
          <span className="text-[rgb(var(--foreground-muted))]">—</span>
        ) : (
          value
        )}
      </dd>
    </div>
  )
}

function Secao({
  titulo,
  children,
}: {
  titulo: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
        {titulo}
      </h3>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</dl>
    </section>
  )
}

function formatEndereco(m: AdminMembroItem): string | null {
  const partes = [
    m.cep ? `CEP ${m.cep}` : null,
    m.numero ? `nº ${m.numero}` : null,
    m.bloco ? `bloco ${m.bloco}` : null,
    m.complemento || null,
  ].filter(Boolean)
  return partes.length > 0 ? partes.join(' · ') : null
}

function ComprovanteInline({
  imagemUrl,
  nome,
}: {
  imagemUrl: string
  nome: string
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))]">
      {/* Dado RESTRITO: <img> direto da URL do upload, sem otimizador/cache. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imagemUrl}
        alt={`Comprovante de vínculo de ${nome}`}
        className="mx-auto max-h-64 w-auto max-w-full object-contain"
        onError={(e) => {
          const el = e.currentTarget
          el.style.display = 'none'
          const fallback = el.nextElementSibling
          if (fallback instanceof HTMLElement) fallback.hidden = false
        }}
      />
      <div hidden className="flex flex-col items-center gap-2 px-4 py-8 text-center">
        <ImageOff className="h-7 w-7 text-[rgb(var(--foreground-muted))]" />
        <p className="text-sm text-[rgb(var(--foreground-muted))]">
          Não foi possível carregar o comprovante.
        </p>
        <a
          href={imagemUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
        >
          Abrir em nova aba
        </a>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-[rgb(var(--border))] px-3 py-2">
        <span className="inline-flex items-center gap-1 text-xs text-[rgb(var(--foreground-muted))]">
          <FileSearch className="h-3.5 w-3.5" />
          Comprovante de vínculo
        </span>
        <a
          href={imagemUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
        >
          Abrir original
        </a>
      </div>
    </div>
  )
}

export function MembroDetalheModal({
  membro,
  onClose,
}: {
  membro: AdminMembroItem | null
  onClose: () => void
}) {
  useEffect(() => {
    if (!membro) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [membro, onClose])

  return (
    <AnimatePresence>
      {membro && (
        <m.div
          key={membro.id}
          variants={lightboxBackdrop}
          initial="hidden"
          animate="show"
          exit="exit"
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          role="presentation"
          onClick={onClose}
        >
          <m.div
            variants={lightboxContent}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={springGentle}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`membro-detalhe-titulo-${membro.id}`}
            className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho */}
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[rgb(var(--border))] px-4 py-4 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                {membro.avatarUrl ? (
                  canOptimizeImageUrl(membro.avatarUrl) ? (
                    <Image
                      src={membro.avatarUrl}
                      alt=""
                      width={44}
                      height={44}
                      className="h-11 w-11 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={membro.avatarUrl}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-full object-cover"
                    />
                  )
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--color-primary)_/_0.14)] text-sm font-bold text-[rgb(var(--color-primary-fg))]">
                    {membro.inicial}
                  </div>
                )}
                <div className="min-w-0">
                  <h2
                    id={`membro-detalhe-titulo-${membro.id}`}
                    className="truncate text-base font-semibold text-[rgb(var(--foreground))]"
                  >
                    {membro.nome}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-[rgb(var(--foreground-muted))]">
                      {membro.tipo}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${membro.statusClass}`}
                    >
                      {membro.statusLabel}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="shrink-0 rounded-lg p-1.5 text-[rgb(var(--foreground-muted))] transition-colors hover:bg-[rgb(var(--background-subtle))] hover:text-[rgb(var(--foreground))]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Corpo */}
            <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4 sm:px-5">
              {(membro.alertaRivalSocio ||
                !!membro.reprovacoesOutraTorcida ||
                (membro.tentativas !== undefined && membro.tentativas > 1)) && (
                <div className="space-y-1.5">
                  {membro.alertaRivalSocio && (
                    <p className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                      <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                      Já é sócio aprovado em torcida rival
                    </p>
                  )}
                  {!!membro.reprovacoesOutraTorcida && (
                    <p className="inline-flex items-center gap-1.5 rounded-lg bg-red-100 px-2.5 py-1.5 text-xs font-medium text-red-800 dark:bg-red-900 dark:text-red-200">
                      <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                      Reprovado em recrutamento de outra torcida (
                      {membro.reprovacoesOutraTorcida}x)
                    </p>
                  )}
                  {membro.tentativas !== undefined && membro.tentativas > 1 && (
                    <p className="text-xs text-[rgb(var(--foreground-muted))]">
                      {membro.tentativas}ª tentativa
                      {membro.ultimoMotivoReprovacao
                        ? ` · reprovado antes: “${membro.ultimoMotivoReprovacao}”`
                        : ' · reprovado anteriormente'}
                    </p>
                  )}
                </div>
              )}

              <Secao titulo="Contato e identificação">
                <Campo label="Nome" value={membro.nome} />
                <Campo label="E-mail" value={membro.email} />
                <Campo label="Telefone" value={membro.telefone} />
                <Campo label="Idade" value={membro.idade} />
                <Campo label="Discord" value={membro.discordTag} />
                <Campo label="Discord ID" value={membro.discordId} />
              </Secao>

              <Secao titulo="Solicitação de ingresso">
                <Campo label="Tipo" value={membro.tipo} />
                <Campo label="Status" value={membro.statusLabel} />
                <Campo label="Cidade / região" value={membro.cidade} />
                <Campo label="Unidade" value={membro.sedeNome} />
                <Campo label="Departamento pretendido" value={membro.departamentoNome} />
                <Campo label="Cadastro em" value={membro.criadoEmLabel} />
                <Campo label="Atualizado em" value={membro.atualizadoEmLabel} />
                <Campo
                  label="Adimplência"
                  value={
                    membro.adimplente === undefined
                      ? null
                      : membro.adimplente
                        ? 'Adimplente'
                        : 'Inadimplente'
                  }
                />
              </Secao>

              {(membro.numeroAssociado ||
                membro.anosSocio != null ||
                membro.cep ||
                membro.numero ||
                membro.bloco ||
                membro.complemento ||
                membro.imagemProva) && (
                <Secao titulo="Dados de sócio">
                  <Campo label="Nº de associado" value={membro.numeroAssociado} />
                  <Campo
                    label="Anos como sócio"
                    value={
                      membro.anosSocio != null
                        ? `${membro.anosSocio} ano${membro.anosSocio === 1 ? '' : 's'}`
                        : null
                    }
                  />
                  <Campo label="Endereço" value={formatEndereco(membro)} />
                  {membro.imagemProva && (
                    <div className="sm:col-span-2">
                      <dt className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--foreground-muted))]">
                        Comprovante
                      </dt>
                      <dd>
                        <ComprovanteInline
                          imagemUrl={membro.imagemProva}
                          nome={membro.nome}
                        />
                      </dd>
                    </div>
                  )}
                </Secao>
              )}

              {(membro.aprovadoPorNome ||
                membro.aprovadoEmLabel ||
                membro.desligadoMotivo) && (
                <Secao titulo="Histórico operacional">
                  <Campo label="Aprovado por" value={membro.aprovadoPorNome} />
                  <Campo label="Aprovado em" value={membro.aprovadoEmLabel} />
                  <Campo label="Desligado em" value={membro.desligadoEmLabel} />
                  <Campo label="Motivo do desligamento" value={membro.desligadoMotivo} />
                </Secao>
              )}
            </div>

            {/* Rodapé */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[rgb(var(--border))] px-4 py-3 sm:px-5">
              <Link
                href={`/admin/membros/${membro.id}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--color-primary-fg))] hover:underline"
              >
                Página completa (LGE, unidade…)
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
              <MemberActions
                membroId={membro.id}
                status={membro.status}
                departamentoNome={membro.departamentoNome}
              />
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
