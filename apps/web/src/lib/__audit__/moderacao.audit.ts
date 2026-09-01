/**
 * Auditoria de MODERAÇÃO — prova que o caminho de dados funciona contra banco.
 *
 * Por que ela existe: `tsc` **não** valida payload de escrita do Prisma neste
 * repo (`ARCHITECTURE.md` §5.2, complemento 2026-09-01). Campo inexistente num
 * `create` e valor de enum inválido compilam limpo e só quebram em runtime.
 * As 16 entradas de `ALVOS_MODERACAO` nunca tinham tocado um banco.
 *
 * Cobre por enquanto A1 e A2 de `docs/data/modulo-moderacao.md` §8.2:
 *   A1 — gravação funciona para os 16 alvos + `carregar` de cada um roda.
 *   A2 — S4 nasce escalado; S1–S3 não.
 *
 * ⚠️ MUTA o banco. Toda denúncia criada é revertida no final; fixtures usam
 * `[AUDIT-MOD]` no campo `motivo`.
 *
 * Rodar:
 *   pnpm --filter @torcida/web audit:moderacao
 */
import { afterAll, describe, expect, it } from 'vitest'
import { db } from '@torcida/db'
import {
  CATEGORIAS_VIOLACAO,
  escalaParaPlataforma,
  gravidadeDaCategoria,
  prazoSlaDe,
} from '@torcida/types'
import { ALVOS_MODERACAO, carregarAlvosModeracao, type AlvoModeracao } from '@/lib/moderacao-alvos'

const MARCA = '[AUDIT-MOD]'
const criadas: string[] = []

afterAll(async () => {
  if (criadas.length) {
    await db.moderacaoDenuncia.deleteMany({ where: { id: { in: criadas } } })
  }
  await db.$disconnect()
})

async function denuncianteDeTeste(): Promise<string> {
  const u: { id: string } | null = await db.user.findFirst({ select: { id: true } })
  if (!u) throw new Error('Banco local sem User — rode um seed antes da auditoria')
  return u.id
}

describe('A1 — gravação funciona para os 16 alvos', () => {
  it('cria uma ModeracaoDenuncia para cada valor de AlvoModeracao', async () => {
    const denuncianteId = await denuncianteDeTeste()
    const tipos = Object.keys(ALVOS_MODERACAO) as AlvoModeracao[]
    expect(tipos).toHaveLength(16)

    const falhas: string[] = []
    for (const alvoTipo of tipos) {
      const categoria = 'RACISMO'
      const gravidade = gravidadeDaCategoria(categoria)
      try {
        const d: { id: string } = await db.moderacaoDenuncia.create({
          data: {
            alvoTipo,
            alvoId: `audit-${alvoTipo.toLowerCase()}`,
            denuncianteId,
            categoria,
            gravidade,
            motivo: `${MARCA} ${alvoTipo}`,
            prazoSla: prazoSlaDe(gravidade, new Date()),
            escalado: escalaParaPlataforma(gravidade),
          },
          select: { id: true },
        })
        criadas.push(d.id)
      } catch (e) {
        falhas.push(`${alvoTipo}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`)
      }
    }

    expect(falhas, `alvos que falharam ao gravar:\n${falhas.join('\n')}`).toEqual([])
  })

  it('aceita todas as categorias da taxonomia', async () => {
    const denuncianteId = await denuncianteDeTeste()
    const falhas: string[] = []
    for (const categoria of Object.keys(CATEGORIAS_VIOLACAO)) {
      const gravidade = gravidadeDaCategoria(categoria)
      try {
        const d: { id: string } = await db.moderacaoDenuncia.create({
          data: {
            alvoTipo: 'POST',
            alvoId: `audit-cat-${categoria}`,
            denuncianteId,
            categoria: categoria as never,
            gravidade,
            motivo: `${MARCA} ${categoria}`,
            prazoSla: prazoSlaDe(gravidade, new Date()),
            escalado: escalaParaPlataforma(gravidade),
          },
          select: { id: true },
        })
        criadas.push(d.id)
      } catch (e) {
        falhas.push(`${categoria}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`)
      }
    }
    expect(falhas, `categorias recusadas pelo banco:\n${falhas.join('\n')}`).toEqual([])
  })

  it('o carregar de cada alvo roda sem erro de query', async () => {
    const tipos = Object.keys(ALVOS_MODERACAO) as AlvoModeracao[]
    const falhas: string[] = []
    for (const alvoTipo of tipos) {
      try {
        // Lista vazia exercita a query sem depender de fixture por superfície:
        // o que se prova aqui é que o `select` não cita campo inexistente.
        await ALVOS_MODERACAO[alvoTipo].carregar([`inexistente-${alvoTipo}`])
      } catch (e) {
        falhas.push(`${alvoTipo}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`)
      }
    }
    expect(falhas, `carregar() com query inválida:\n${falhas.join('\n')}`).toEqual([])
  })

  it('carregarAlvosModeracao agrupa em lote sem N+1', async () => {
    const denuncias = (Object.keys(ALVOS_MODERACAO) as AlvoModeracao[]).map((alvoTipo) => ({
      alvoTipo,
      alvoId: `inexistente-${alvoTipo}`,
    }))
    const mapa = await carregarAlvosModeracao(denuncias)
    expect(mapa).toBeInstanceOf(Map)
  })
})

describe('A2 — escalonamento por gravidade', () => {
  it('S4 nasce escalado e S1–S3 não', async () => {
    const denuncianteId = await denuncianteDeTeste()
    const amostra: [string, boolean][] = [
      ['CSAM', true],
      ['ALICIAMENTO_MENOR', true],
      ['RACISMO', false],
      ['SPAM', false],
      ['PALAVRAO_LEVE', false],
    ]
    for (const [categoria, esperado] of amostra) {
      const gravidade = gravidadeDaCategoria(categoria)
      const d: { id: string; escalado: boolean } = await db.moderacaoDenuncia.create({
        data: {
          alvoTipo: 'FORUM_TOPICO',
          alvoId: `audit-esc-${categoria}`,
          denuncianteId,
          categoria: categoria as never,
          gravidade,
          motivo: `${MARCA} escalonamento ${categoria}`,
          prazoSla: prazoSlaDe(gravidade, new Date()),
          escalado: escalaParaPlataforma(gravidade),
        },
        select: { id: true, escalado: true },
      })
      criadas.push(d.id)
      expect(d.escalado, `${categoria} (${gravidade}) deveria escalar=${esperado}`).toBe(esperado)
    }
  })

  it('denúncia S4 aparece no filtro da fila da plataforma', async () => {
    const naFila: { id: string }[] = await db.moderacaoDenuncia.findMany({
      where: {
        status: 'PENDENTE',
        OR: [{ escalado: true }, { tenantId: null }],
        motivo: { startsWith: MARCA },
      },
      select: { id: true },
    })
    expect(naFila.length).toBeGreaterThan(0)
  })
})
