import { z } from 'zod'
import { MembroImportInputSchema } from '@torcida/types'

/**
 * Funções puras da importação de membros — sem banco, testáveis em Vitest.
 * O pipeline (server action) e os adapters com I/O vivem em
 * apps/web/src/app/admin/membros/importar/actions.ts.
 * Ver docs/data/spec-importacao-membros.md.
 */

export type MembroImportInput = z.infer<typeof MembroImportInputSchema>

/**
 * Chave de deduplicação por prioridade: discordId > email > telefone.
 * Prefixada pelo campo de origem para nunca colidir entre campos distintos
 * (ex: um telefone igual a um discordId). Retorna null quando o input não
 * tem nenhum identificador — nesse caso o registro não é deduplicável e
 * cada linha vira um membro novo.
 */
export function dedupKey(input: MembroImportInput): string | null {
  if (input.discordId) return `discord:${input.discordId}`
  if (input.email) return `email:${input.email.toLowerCase()}`
  if (input.telefone) return `telefone:${input.telefone.replace(/\D/g, '')}`
  return null
}

/**
 * Mapeia o tipo textual do bot legado ('socio'/'torcedor', case-insensitive)
 * para o enum TipoMembro. Valor desconhecido cai em TORCEDOR (tipo de menor
 * privilégio — nunca promove por engano).
 */
export function mapTipo(tipo: string | null | undefined): 'SOCIO' | 'TORCEDOR' {
  return tipo?.trim().toLowerCase() === 'socio' ? 'SOCIO' : 'TORCEDOR'
}

// ─── mockSource ──────────────────────────────────────────────────────────────

const MOCK_NOMES = [
  'Carlos Silva', 'Ana Souza', 'Pedro Oliveira', 'Juliana Santos', 'Rafael Lima',
  'Fernanda Costa', 'Lucas Pereira', 'Mariana Almeida', 'Bruno Rodrigues', 'Camila Ferreira',
  'Thiago Martins', 'Beatriz Gomes', 'Diego Ribeiro', 'Larissa Carvalho', 'Gustavo Barbosa',
  'Patrícia Rocha', 'Felipe Dias', 'Aline Nascimento', 'Rodrigo Moreira', 'Vanessa Cardoso',
] as const

const MOCK_CIDADES = [
  'São Paulo', 'Guarulhos', 'Osasco', 'Santo André', 'São Bernardo do Campo',
  'Campinas', 'Sorocaba', 'Santos', 'Mogi das Cruzes', 'Diadema',
] as const

/**
 * Gera N membros fake plausíveis para validar a apresentação (origem MOCK).
 * Determinístico por índice (sem Math.random) — rodar duas vezes gera os
 * mesmos discordIds, o que exercita o caminho de duplicados do pipeline e
 * mantém os testes estáveis.
 */
export function mockSource(n: number): MembroImportInput[] {
  const inputs: MembroImportInput[] = []
  for (let i = 0; i < n; i++) {
    const nomeBase = MOCK_NOMES[i % MOCK_NOMES.length]
    const sufixo = Math.floor(i / MOCK_NOMES.length)
    const socio = i % 3 === 0 // ~1/3 sócios
    inputs.push({
      discordId: `mock-${String(i + 1).padStart(5, '0')}`,
      nome: sufixo > 0 ? `${nomeBase} ${sufixo + 1}` : nomeBase,
      tipo: socio ? 'SOCIO' : 'TORCEDOR',
      numeroAssociado: socio ? String(1000 + i) : undefined,
      cidade: MOCK_CIDADES[i % MOCK_CIDADES.length],
      telefone: `11 9${String(6000_0000 + i * 137).slice(0, 8)}`,
      idade: 18 + (i % 40),
    })
  }
  return inputs
}
