import type { ListagemWhere } from './query'

/**
 * Busca em emitidas: `numeroSocio` é Int (não cabe em `contains` do contrato) e
 * o nº do recrutamento mora em SaasMembro. Monta o OR completo da busca livre
 * aqui e zera `q` no parse usado pelo where padrão.
 */
export function buscaEmitidasSocios(
  termo: string,
  tenantId: string,
): ListagemWhere | null {
  const q = termo.trim()
  if (!q) return null
  const or: ListagemWhere[] = [{ nome: { contains: q, mode: 'insensitive' } }]
  if (/^\d+$/.test(q)) {
    const n = parseInt(q, 10)
    or.push({ numeroSocio: n })
    or.push({
      user: {
        membros: {
          some: {
            tenantId,
            tipo: 'SOCIO',
            OR: [{ numeroAssociado: q }, { numeroAssociado: String(n) }],
          },
        },
      },
    })
  }
  return { OR: or }
}

/** Recorte de validade da aba Emitidas (`status` na URL, fora do contrato). */
export function validadeWhereEmitidasSocios(
  status: string | undefined,
  now: Date,
  em30dias: Date,
): ListagemWhere {
  if (status === 'ativos') return { validade: { gte: now } }
  if (status === 'vencidos') return { validade: { lt: now } }
  if (status === 'vencendo') return { validade: { gt: now, lt: em30dias } }
  return {}
}
