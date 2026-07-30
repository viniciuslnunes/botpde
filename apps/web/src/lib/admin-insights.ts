/**
 * Utilitários puros de inteligência administrativa (relatórios / insights).
 *
 * Bucketing SEMPRE em JS com timezone `America/Sao_Paulo` — nunca `date_trunc`
 * SQL (rodaria em UTC e deslocaria lançamentos noturnos de dia/mês).
 */

const TZ = 'America/Sao_Paulo'
const DIA_MS = 24 * 60 * 60 * 1000

export type Periodo = '30d' | '90d' | '12m'

export type SerieTemporal = { rotulo: string; valor: number }[]

export type IntervaloAnalise = {
  inicio: Date
  fim: Date
  inicioAnterior: Date
  fimAnterior: Date
}

export const PERIODOS: readonly Periodo[] = ['30d', '90d', '12m']

/** Janela padrão de todas as tabs de insight do admin: 3 meses. */
export const PERIODO_PADRAO: Periodo = '90d'

export const PERIODO_LABEL: Record<Periodo, string> = {
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 3 meses',
  '12m': 'Últimos 12 meses',
}

/** Versão sem "Últimos" — títulos entre parênteses e frases de estado vazio. */
export const PERIODO_LABEL_CURTO: Record<Periodo, string> = {
  '30d': '30 dias',
  '90d': '3 meses',
  '12m': '12 meses',
}

const PERIODO_DIAS: Record<Periodo, number> = {
  '30d': 30,
  '90d': 90,
  '12m': 365,
}

export function diasDoPeriodo(periodo: Periodo): number {
  return PERIODO_DIAS[periodo]
}

/** Intervalo do período + intervalo imediatamente anterior (para comparativos). */
export function resolverIntervaloPeriodo(periodo: Periodo): {
  inicio: Date
  fim: Date
  inicioAnterior: Date
  fimAnterior: Date
} {
  const dias = PERIODO_DIAS[periodo]
  const fim = new Date()
  const inicio = new Date(fim.getTime() - dias * DIA_MS)
  // Instante imediatamente anterior ao início — evita contar o limite duas vezes.
  const fimAnterior = new Date(inicio.getTime() - 1)
  const inicioAnterior = new Date(inicio.getTime() - dias * DIA_MS)
  return { inicio, fim, inicioAnterior, fimAnterior }
}

/** Intervalo móvel em meses + período anterior de mesma duração. */
export function resolverIntervaloMeses(meses: number): IntervaloAnalise {
  const fim = new Date()
  const [anoAtual, mesAtual] = chaveMesFmt
    .format(fim)
    .split('-')
    .map((parte) => Number(parte))
  // Mês corrente incluso: 3 meses = mês atual + dois anteriores.
  const inicio = new Date(Date.UTC(anoAtual, mesAtual - meses, 1, 3, 0, 0))
  const fimAnterior = new Date(inicio.getTime() - 1)
  const inicioAnterior = new Date(Date.UTC(anoAtual, mesAtual - meses * 2, 1, 3, 0, 0))
  return { inicio, fim, inicioAnterior, fimAnterior }
}

/**
 * Converte datas ISO (`YYYY-MM-DD`) em um intervalo inclusivo no fuso de SP.
 * Retorna `null` para valores inválidos ou invertidos.
 */
export function resolverIntervaloCustomizado(
  inicioIso: string | undefined,
  fimIso: string | undefined,
): IntervaloAnalise | null {
  const padraoIso = /^\d{4}-\d{2}-\d{2}$/
  if (!inicioIso || !fimIso || !padraoIso.test(inicioIso) || !padraoIso.test(fimIso)) {
    return null
  }

  const inicio = new Date(`${inicioIso}T00:00:00-03:00`)
  const fim = new Date(`${fimIso}T23:59:59.999-03:00`)
  if (
    Number.isNaN(inicio.getTime()) ||
    Number.isNaN(fim.getTime()) ||
    chaveDiaFmt.format(inicio) !== inicioIso ||
    chaveDiaFmt.format(fim) !== fimIso ||
    inicio.getTime() > fim.getTime()
  ) {
    return null
  }

  const duracao = fim.getTime() - inicio.getTime()
  const fimAnterior = new Date(inicio.getTime() - 1)
  const inicioAnterior = new Date(fimAnterior.getTime() - duracao)
  return { inicio, fim, inicioAnterior, fimAnterior }
}

// en-CA => chaves ISO estáveis (YYYY-MM-DD); pt-BR => rótulos exibidos.
const chaveDiaFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const rotuloDiaFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
})
const chaveMesFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
})
// Data construída ao meio-dia UTC do dia 15 — o mês não muda em nenhum fuso.
const rotuloMesFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', month: 'short' })

/** Soma de `valor` por dia (fuso São Paulo) entre `inicio` e `fim`, com dias vazios zerados. */
export function bucketSomaPorDia(
  itens: { data: Date; valor: number }[],
  inicio: Date,
  fim: Date,
): SerieTemporal {
  const buckets = new Map<string, { rotulo: string; valor: number }>()

  for (let t = inicio.getTime(); t <= fim.getTime(); t += DIA_MS) {
    const dia = new Date(t)
    const chave = chaveDiaFmt.format(dia)
    if (!buckets.has(chave)) buckets.set(chave, { rotulo: rotuloDiaFmt.format(dia), valor: 0 })
  }
  // O passo fixo de 24h pode pular o último dia em virada de horário de verão.
  const chaveFim = chaveDiaFmt.format(fim)
  if (!buckets.has(chaveFim)) buckets.set(chaveFim, { rotulo: rotuloDiaFmt.format(fim), valor: 0 })

  for (const item of itens) {
    const bucket = buckets.get(chaveDiaFmt.format(item.data))
    if (bucket) bucket.valor += item.valor
  }

  return [...buckets.values()]
}

/** Contagem de ocorrências por dia (fuso São Paulo) entre `inicio` e `fim`, com dias vazios zerados. */
export function bucketPorDia(datas: Date[], inicio: Date, fim: Date): SerieTemporal {
  return bucketSomaPorDia(
    datas.map((data) => ({ data, valor: 1 })),
    inicio,
    fim,
  )
}

export type MesSP = { chave: string; rotulo: string; inicio: Date }

/**
 * Últimos N meses (fuso São Paulo) em ordem cronológica, mês corrente incluso.
 * `inicio` = 00:00 SP do dia 1 (UTC-3 fixo — o Brasil aboliu o horário de verão em 2019).
 */
export function ultimosMesesSP(meses: number): MesSP[] {
  const [anoAtual, mesAtual] = chaveMesFmt
    .format(new Date())
    .split('-')
    .map((parte) => Number(parte))

  const lista: MesSP[] = []
  for (let i = meses - 1; i >= 0; i--) {
    let ano = anoAtual
    let mes = mesAtual - i
    while (mes < 1) {
      mes += 12
      ano -= 1
    }
    const nomeMes = rotuloMesFmt.format(new Date(Date.UTC(ano, mes - 1, 15, 12))).replace('.', '')
    lista.push({
      chave: `${ano}-${String(mes).padStart(2, '0')}`,
      rotulo: `${nomeMes}/${String(ano % 100).padStart(2, '0')}`,
      inicio: new Date(Date.UTC(ano, mes - 1, 1, 3, 0, 0)),
    })
  }
  return lista
}

/** Chave "YYYY-MM" do mês de `data` no fuso São Paulo — casa com `MesSP.chave`. */
export function chaveMesSP(data: Date): string {
  return chaveMesFmt.format(data)
}

/** Soma de `valor` por mês (fuso São Paulo) nos últimos `meses` meses, terminando no mês corrente. */
export function bucketPorMes(itens: { data: Date; valor: number }[], meses: number): SerieTemporal {
  const buckets = new Map<string, { rotulo: string; valor: number }>(
    ultimosMesesSP(meses).map((m) => [m.chave, { rotulo: m.rotulo, valor: 0 }]),
  )

  for (const item of itens) {
    const bucket = buckets.get(chaveMesSP(item.data))
    if (bucket) bucket.valor += item.valor
  }

  return [...buckets.values()]
}

/** Soma mensal entre duas datas, inclusive; suporta ranges históricos customizados. */
export function bucketPorIntervaloMes(
  itens: { data: Date; valor: number }[],
  inicio: Date,
  fim: Date,
): SerieTemporal {
  const inicioChave = chaveMesSP(inicio)
  const fimChave = chaveMesSP(fim)
  const [anoInicio, mesInicio] = inicioChave.split('-').map(Number)
  const [anoFim, mesFim] = fimChave.split('-').map(Number)
  const totalMeses = (anoFim - anoInicio) * 12 + mesFim - mesInicio + 1
  const buckets = new Map<string, { rotulo: string; valor: number }>()

  for (let i = 0; i < totalMeses; i++) {
    const data = new Date(Date.UTC(anoInicio, mesInicio - 1 + i, 15, 12))
    const ano = data.getUTCFullYear()
    const mes = data.getUTCMonth() + 1
    const chave = `${ano}-${String(mes).padStart(2, '0')}`
    const nomeMes = rotuloMesFmt.format(data).replace('.', '')
    buckets.set(chave, {
      rotulo: `${nomeMes}/${String(ano % 100).padStart(2, '0')}`,
      valor: 0,
    })
  }

  for (const item of itens) {
    const bucket = buckets.get(chaveMesSP(item.data))
    if (bucket) bucket.valor += item.valor
  }

  return [...buckets.values()]
}

/** Variação percentual vs período anterior. `null` quando não há base de comparação. */
export function calcularDelta(atual: number, anterior: number): number | null {
  if (anterior === 0) return null
  return ((atual - anterior) / Math.abs(anterior)) * 100
}
