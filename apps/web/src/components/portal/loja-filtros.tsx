'use client'

import { useState } from 'react'
import { m } from 'motion/react'
import { springGentle, springSnappy } from '@/lib/motion-presets'

function formatarPrecoCurto(valor: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(valor)
}

const RANGE_THUMB =
  'pointer-events-auto h-4 w-4 cursor-grab appearance-none rounded-full border-2 border-[rgb(var(--primary))] bg-[rgb(var(--background))] shadow-sm active:cursor-grabbing [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[rgb(var(--primary))] [&::-moz-range-thumb]:bg-[rgb(var(--background))] [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[rgb(var(--primary))] [&::-webkit-slider-thumb]:bg-[rgb(var(--background))]'

const RANGE_TRACK =
  'pointer-events-none absolute inset-x-0 top-1/2 h-6 w-full -translate-y-1/2 appearance-none bg-transparent [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:bg-transparent'

function LojaPrecoRange({
  catalogoMin,
  catalogoMax,
  precoMinInicial,
  precoMaxInicial,
}: {
  catalogoMin: number
  catalogoMax: number
  precoMinInicial?: string
  precoMaxInicial?: string
}) {
  const [minVal, setMinVal] = useState(() => {
    const v = precoMinInicial ? Number(precoMinInicial) : catalogoMin
    return Math.max(catalogoMin, Math.min(v, catalogoMax))
  })
  const [maxVal, setMaxVal] = useState(() => {
    const v = precoMaxInicial ? Number(precoMaxInicial) : catalogoMax
    return Math.max(catalogoMin, Math.min(v, catalogoMax))
  })

  if (catalogoMin >= catalogoMax) {
    return (
      <div>
        <label className="text-xs font-semibold uppercase text-[rgb(var(--foreground-muted))]">Faixa de preço</label>
        <p className="mt-1 text-sm font-medium tabular-nums">{formatarPrecoCurto(catalogoMin)}</p>
      </div>
    )
  }

  const span = catalogoMax - catalogoMin
  const pctMin = ((minVal - catalogoMin) / span) * 100
  const pctMax = ((maxVal - catalogoMin) / span) * 100
  const filtrado = minVal > catalogoMin || maxVal < catalogoMax

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-xs font-semibold uppercase text-[rgb(var(--foreground-muted))]">Faixa de preço</label>
        <span className="text-sm font-semibold tabular-nums text-[rgb(var(--color-primary-fg))]">
          {formatarPrecoCurto(minVal)} – {formatarPrecoCurto(maxVal)}
        </span>
      </div>

      <div className="relative mt-4 h-6">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[rgb(var(--foreground-muted)_/_0.2)]">
          <m.div
            layout
            transition={springGentle}
            className="absolute h-full rounded-full bg-[rgb(var(--primary))]"
            style={{ left: `${pctMin}%`, width: `${Math.max(0, pctMax - pctMin)}%` }}
          />
        </div>
        <input
          type="range"
          min={catalogoMin}
          max={catalogoMax}
          step={1}
          value={minVal}
          onChange={(e) => setMinVal(Math.min(Number(e.target.value), maxVal))}
          className={`${RANGE_TRACK} z-20 ${RANGE_THUMB}`}
          aria-label="Preço mínimo"
        />
        <input
          type="range"
          min={catalogoMin}
          max={catalogoMax}
          step={1}
          value={maxVal}
          onChange={(e) => setMaxVal(Math.max(Number(e.target.value), minVal))}
          className={`${RANGE_TRACK} z-30 ${RANGE_THUMB}`}
          aria-label="Preço máximo"
        />
      </div>

      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-[rgb(var(--foreground-muted))]">
        <span>{formatarPrecoCurto(catalogoMin)}</span>
        <span>{formatarPrecoCurto(catalogoMax)}</span>
      </div>

      {filtrado && (
        <>
          <input type="hidden" name="precoMin" value={minVal} />
          <input type="hidden" name="precoMax" value={maxVal} />
        </>
      )}
    </div>
  )
}

export function LojaFiltros({
  categorias,
  tamanhosDisponiveis,
  faixaPreco,
  searchParams,
}: {
  categorias: { slug: string; nome: string }[]
  tamanhosDisponiveis: string[]
  faixaPreco: { min: number; max: number }
  searchParams: Record<string, string | undefined>
}) {
  const { q, categoria, tamanho, ordenar, precoMin, precoMax } = searchParams

  return (
    <form
      method="get"
      className="space-y-4 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 lg:sticky lg:top-6"
    >
      <div>
        <label htmlFor="loja-q" className="text-xs font-semibold uppercase text-[rgb(var(--foreground-muted))]">
          Buscar
        </label>
        <input
          id="loja-q"
          name="q"
          defaultValue={q}
          placeholder="Nome do produto..."
          className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm focus:border-[rgb(var(--primary))] focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="loja-categoria" className="text-xs font-semibold uppercase text-[rgb(var(--foreground-muted))]">
          Categoria
        </label>
        <select
          id="loja-categoria"
          name="categoria"
          defaultValue={categoria ?? ''}
          className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm focus:border-[rgb(var(--primary))] focus:outline-none"
        >
          <option value="">Todas</option>
          {categorias.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>

      {tamanhosDisponiveis.length > 0 && (
        <div>
          <label htmlFor="loja-tamanho" className="text-xs font-semibold uppercase text-[rgb(var(--foreground-muted))]">
            Tamanho
          </label>
          <select
            id="loja-tamanho"
            name="tamanho"
            defaultValue={tamanho ?? ''}
            className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm focus:border-[rgb(var(--primary))] focus:outline-none"
          >
            <option value="">Todos os tamanhos</option>
            {tamanhosDisponiveis.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}

      <LojaPrecoRange
        catalogoMin={faixaPreco.min}
        catalogoMax={faixaPreco.max}
        precoMinInicial={precoMin}
        precoMaxInicial={precoMax}
      />

      <div>
        <label htmlFor="loja-ordenar" className="text-xs font-semibold uppercase text-[rgb(var(--foreground-muted))]">
          Ordenar
        </label>
        <select
          id="loja-ordenar"
          name="ordenar"
          defaultValue={ordenar ?? 'recentes'}
          className="mt-1 w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background))] px-3 py-2 text-sm focus:border-[rgb(var(--primary))] focus:outline-none"
        >
          <option value="recentes">Lançamentos</option>
          <option value="preco-asc">Menor preço</option>
          <option value="preco-desc">Maior preço</option>
          <option value="nome-asc">Nome A–Z</option>
          <option value="nome-desc">Nome Z–A</option>
        </select>
      </div>

      <m.button
        type="submit"
        whileTap={{ scale: 0.98 }}
        transition={springSnappy}
        className="w-full rounded-xl border-2 border-[rgb(var(--primary))] bg-[rgb(var(--primary))] py-2.5 text-sm font-semibold text-primary-on hover:opacity-90"
      >
        Aplicar filtros
      </m.button>
    </form>
  )
}
