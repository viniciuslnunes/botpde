'use client'

import { useState, type ReactNode } from 'react'
import { m, useReducedMotion } from 'motion/react'
import {
  Archive,
  ClipboardCheck,
  Drum,
  Flag,
  ImageOff,
  Landmark,
  Pencil,
  Trash2,
} from 'lucide-react'
import {
  CATEGORIA_BANDEIRA,
  CATEGORIA_PATRIMONIO_LABEL,
  formatarMoedaBRL,
} from '@torcida/types'
import { StatusBadge } from '@/components/admin/ui'
import { resolveProdutoImagemUrl } from '@/lib/produto-imagem'
import { springSnappy } from '@/lib/motion-presets'
import type { PatrimonioFormInitial } from '@/components/patrimonio/patrimonio-item-form'

export type PatrimonioCardVistoria = {
  larguraM: number
  alturaM: number
  comMastro: boolean
  orgao: string | null
  protocolo: string | null
  validade: string | null
  observacao: string | null
} | null

export type PatrimonioRow = PatrimonioFormInitial & {
  id: string
  responsavelNome: string | null
  /** Foto da grade: catálogo ou evidência de empréstimo. */
  fotoPreviewUrl?: string | null
  temVistoria?: boolean
  vistoriaVencendo?: boolean
  vistoria?: PatrimonioCardVistoria
}

function IconeCategoria({ categoria }: { categoria: string }) {
  const cls = 'h-10 w-10 text-[rgb(var(--foreground-muted))]'
  if (categoria === 'BANDEIRA') return <Flag className={cls} aria-hidden />
  if (categoria === 'INSTRUMENTO') return <Drum className={cls} aria-hidden />
  return <Landmark className={cls} aria-hidden />
}

function PatrimonioFoto({
  src,
  alt,
  categoria,
  onAmpliar,
}: {
  src: string | null
  alt: string
  categoria: string
  onAmpliar?: () => void
}) {
  const resolved = resolveProdutoImagemUrl(src)
  const [failed, setFailed] = useState(false)

  if (!resolved || failed) {
    return (
      <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-[rgb(var(--background-subtle))]">
        {failed ? (
          <ImageOff className="h-8 w-8 text-[rgb(var(--foreground-muted))]" aria-hidden />
        ) : (
          <IconeCategoria categoria={categoria} />
        )}
        <p className="text-[11px] font-medium text-[rgb(var(--foreground-muted))]">Sem foto</p>
      </div>
    )
  }

  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolved}
      alt={onAmpliar ? '' : alt}
      className="h-full w-full object-cover object-center"
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  )

  if (!onAmpliar) {
    return (
      <div className="aspect-[4/3] w-full overflow-hidden bg-[rgb(var(--background-subtle))]">
        {img}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onAmpliar}
      aria-label={`Ampliar foto de ${alt}`}
      className="aspect-[4/3] w-full cursor-zoom-in overflow-hidden bg-[rgb(var(--background-subtle))] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--color-primary))]"
    >
      {img}
    </button>
  )
}

const BTN_BASE =
  'app-action inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors'

function AcaoCard({
  label,
  title,
  onClick,
  tone = 'neutral',
  iconOnly,
  children,
}: {
  label: string
  title?: string
  onClick: () => void
  tone?: 'neutral' | 'warning' | 'danger'
  iconOnly?: boolean
  children: ReactNode
}) {
  const reduceMotion = useReducedMotion()
  const toneClass =
    tone === 'danger'
      ? 'btn-danger-soft'
      : tone === 'warning'
        ? 'btn-warning-soft'
        : 'border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--foreground))] hover:bg-[rgb(var(--background-subtle))]'

  return (
    <m.button
      type="button"
      whileTap={reduceMotion ? undefined : { scale: 0.96 }}
      transition={springSnappy}
      title={title ?? label}
      aria-label={label}
      onClick={onClick}
      className={[BTN_BASE, iconOnly ? 'h-10 w-10 shrink-0 px-0' : 'min-w-0 flex-1', toneClass].join(
        ' ',
      )}
    >
      {children}
      {iconOnly ? <span className="sr-only">{label}</span> : <span className="truncate">{label}</span>}
    </m.button>
  )
}

export function PatrimonioItemCard({
  item,
  podeGerir,
  onEdit,
  onVistoria,
  onBaixar,
  onExcluir,
  onAmpliarFoto,
}: {
  item: PatrimonioRow
  podeGerir: boolean
  onEdit: () => void
  onVistoria?: () => void
  onBaixar?: () => void
  onExcluir?: () => void
  onAmpliarFoto?: () => void
}) {
  const categoriaLabel = CATEGORIA_PATRIMONIO_LABEL[item.categoria] ?? item.categoria
  const detalhes = [
    item.quantidade > 1 ? `qtd ${item.quantidade}` : null,
    item.localizacao,
    item.responsavelNome,
    item.valorEstimado != null ? formatarMoedaBRL(item.valorEstimado) : null,
  ].filter(Boolean)
  const mostraVistoria = Boolean(onVistoria) && item.categoria === CATEGORIA_BANDEIRA
  const vistoriaPendente = item.temVistoria === false || item.vistoriaVencendo

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-[0_1px_2px_rgb(0_0_0_/_0.04)]">
      <div className="relative">
        <PatrimonioFoto
          src={item.fotoPreviewUrl ?? item.fotoUrl}
          alt={item.nome}
          categoria={item.categoria}
          onAmpliar={onAmpliarFoto}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2.5">
          <StatusBadge dominio="patrimonio" status={item.status} />
          {item.vistoriaVencendo ? (
            <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white">
              Liberação
            </span>
          ) : item.temVistoria === false && item.categoria === CATEGORIA_BANDEIRA ? (
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white">
              Sem vistoria
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-3">
        <h3 className="truncate text-sm font-semibold text-[rgb(var(--foreground))]">{item.nome}</h3>
        <p className="mt-0.5 truncate text-xs text-[rgb(var(--foreground-muted))]">
          {categoriaLabel}
          {detalhes.length > 0 ? ` · ${detalhes.join(' · ')}` : ''}
        </p>
        {podeGerir ? (
          // Ícones 40px: em 320px o card cabe ~112px úteis e quatro ações
          // não entram numa linha. `flex-wrap` + `overflow-hidden` no
          // `<article>` — sem quebrar, a última some de verdade.
          <div className="mt-auto flex flex-wrap items-center justify-end gap-1.5 pt-2.5">
            <AcaoCard label={`Editar ${item.nome}`} title="Editar" iconOnly onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" aria-hidden />
            </AcaoCard>
            {mostraVistoria ? (
              <AcaoCard
                label={
                  item.temVistoria
                    ? `Atualizar vistoria de ${item.nome}`
                    : `Realizar vistoria de ${item.nome}`
                }
                title={item.temVistoria ? 'Atualizar vistoria' : 'Realizar vistoria'}
                tone={vistoriaPendente ? 'warning' : 'neutral'}
                iconOnly
                onClick={() => onVistoria?.()}
              >
                <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />
              </AcaoCard>
            ) : null}
            {item.status !== 'BAIXADO' && onBaixar ? (
              <AcaoCard
                label={`Baixar ${item.nome} do inventário`}
                title="Baixar do inventário"
                tone="warning"
                iconOnly
                onClick={onBaixar}
              >
                <Archive className="h-3.5 w-3.5" aria-hidden />
              </AcaoCard>
            ) : null}
            {onExcluir ? (
              <AcaoCard
                label={`Excluir ${item.nome} permanentemente`}
                title="Excluir permanentemente"
                tone="danger"
                iconOnly
                onClick={onExcluir}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </AcaoCard>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  )
}
