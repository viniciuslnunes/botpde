'use client'

import { m } from 'motion/react'
import { formatarMoedaBRL } from '@torcida/types'
import { springGentle, staggerContainer } from '@/lib/motion-presets'

export interface MiniBarChartItem {
  rotulo: string
  valor: number
  /** Série secundária opcional — ativa o modo de barras agrupadas. */
  valorSecundario?: number
  /** Qualquer cor CSS — padrão: primária do tema. */
  cor?: string
}

export type MiniBarChartFormato = 'numero' | 'moeda' | 'unidades'

const FORMATADORES: Record<MiniBarChartFormato, (v: number) => string> = {
  numero: (v) => String(v),
  moeda: (v) => formatarMoedaBRL(v),
  unidades: (v) => `${v} un.`,
}

export interface MiniBarChartProps {
  data: MiniBarChartItem[]
  /** Só para callers client — funções não atravessam a fronteira RSC→client. */
  format?: (v: number) => string
  /** Formatador serializável para uso a partir de Server Components. */
  formato?: MiniBarChartFormato
  height?: number
  /** Cor da série secundária — padrão: danger do tema. */
  corSecundaria?: string
  /** Rótulos das séries para a legenda (modo agrupado). */
  legenda?: { principal: string; secundaria: string }
}

const COR_PADRAO = 'rgb(var(--color-primary) / 0.75)'
const COR_SECUNDARIA_PADRAO = 'rgb(var(--color-danger) / 0.75)'

const barVariants = {
  hidden: { scaleY: 0, opacity: 0 },
  show: { scaleY: 1, opacity: 1, transition: springGentle },
}

/** Barras verticais compactas com rótulos — stagger + `scaleY` a partir da base.
 * Com `valorSecundario` vira barras agrupadas (ex.: receitas × despesas). */
export function MiniBarChart({
  data,
  format,
  formato = 'numero',
  height = 120,
  corSecundaria,
  legenda,
}: MiniBarChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-[rgb(var(--foreground-muted))]">Sem dados no período.</p>
  }

  const agrupado = data.some((d) => d.valorSecundario != null)
  const max = Math.max(...data.map((d) => Math.max(d.valor, d.valorSecundario ?? 0)), 0) || 1
  const fmt = format ?? FORMATADORES[formato]
  const corSec = corSecundaria ?? COR_SECUNDARIA_PADRAO

  return (
    <div>
      <m.div
        role="img"
        aria-label={`Gráfico de barras com ${data.length} itens`}
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="flex items-end gap-2"
      >
        {data.map((item, i) => {
          const alturaBarra = Math.max(4, Math.round((item.valor / max) * height))
          const alturaSecundaria =
            item.valorSecundario != null
              ? Math.max(4, Math.round((item.valorSecundario / max) * height))
              : null
          const titulo = agrupado
            ? `${item.rotulo}: ${legenda?.principal ?? 'principal'} ${fmt(item.valor)} · ${legenda?.secundaria ?? 'secundária'} ${fmt(item.valorSecundario ?? 0)}`
            : `${item.rotulo}: ${fmt(item.valor)}`
          return (
            <div
              key={`${item.rotulo}-${i}`}
              className="flex min-w-0 flex-1 flex-col items-center gap-1"
              title={titulo}
            >
              {!agrupado && (
                <span className="text-[10px] font-medium tabular-nums text-[rgb(var(--foreground-muted))]">
                  {fmt(item.valor)}
                </span>
              )}
              <div className="flex w-full items-end justify-center gap-0.5">
                <m.div
                  className={
                    agrupado ? 'w-full max-w-4 rounded-t-md' : 'w-full max-w-8 rounded-t-md'
                  }
                  style={{
                    height: alturaBarra,
                    backgroundColor: item.cor ?? COR_PADRAO,
                    originY: 1,
                  }}
                  variants={barVariants}
                />
                {alturaSecundaria != null && (
                  <m.div
                    className="w-full max-w-4 rounded-t-md"
                    style={{ height: alturaSecundaria, backgroundColor: corSec, originY: 1 }}
                    variants={barVariants}
                  />
                )}
              </div>
              <span className="max-w-full truncate text-[10px] text-[rgb(var(--foreground-muted))]">
                {item.rotulo}
              </span>
            </div>
          )
        })}
      </m.div>

      {agrupado && legenda ? (
        <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-[rgb(var(--foreground-muted))]">
          <span className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: data[0]?.cor ?? COR_PADRAO }}
              aria-hidden
            />
            {legenda.principal}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: corSec }}
              aria-hidden
            />
            {legenda.secundaria}
          </span>
        </div>
      ) : null}
    </div>
  )
}
