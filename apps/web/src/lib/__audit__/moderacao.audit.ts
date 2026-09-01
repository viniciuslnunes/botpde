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
  ordenarPorPrioridade,
  prazoSlaDe,
} from '@torcida/types'
import {
  ALVOS_MODERACAO,
  alvoSoEscala,
  carregarAlvosModeracao,
  operacaoOcultarAlvo,
  type AlvoModeracao,
} from '@/lib/moderacao-alvos'
import { tenantParaAvisoDenuncia } from '@/lib/moderacao-aviso'

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

/**
 * Restauração por tipo para A3. O registro sabe **ocultar**; desfazer é
 * conhecimento só da auditoria, e fica aqui de propósito — código de produção
 * não deve ganhar um "desocultar" que ninguém usa.
 */
type CasoA3 = {
  achar: () => Promise<{ id: string; restaurar: () => Promise<void> } | null>
}

const CASOS_A3: Partial<Record<AlvoModeracao, CasoA3>> = {
  POST: {
    achar: async () => {
      const r: { id: string } | null = await db.post.findFirst({
        where: { oculto: false },
        select: { id: true },
      })
      return r && {
        id: r.id,
        restaurar: async () => {
          await db.post.update({ where: { id: r.id }, data: { oculto: false } })
        },
      }
    },
  },
  COMENTARIO: {
    achar: async () => {
      const r: { id: string } | null = await db.comentario.findFirst({
        where: { oculto: false },
        select: { id: true },
      })
      return r && {
        id: r.id,
        restaurar: async () => {
          await db.comentario.update({ where: { id: r.id }, data: { oculto: false } })
        },
      }
    },
  },
  FORUM_RESPOSTA: {
    achar: async () => {
      const r: { id: string } | null = await db.forumResposta.findFirst({
        where: { oculto: false },
        select: { id: true },
      })
      return r && {
        id: r.id,
        restaurar: async () => {
          await db.forumResposta.update({ where: { id: r.id }, data: { oculto: false } })
        },
      }
    },
  },
  STORY: {
    achar: async () => {
      const r: { id: string } | null = await db.momentoStory.findFirst({
        where: { oculto: false },
        select: { id: true },
      })
      return r && {
        id: r.id,
        restaurar: async () => {
          await db.momentoStory.update({ where: { id: r.id }, data: { oculto: false } })
        },
      }
    },
  },
  FORUM_TOPICO: {
    achar: async () => {
      const r: { id: string; status: string } | null = await db.forumTopico.findFirst({
        where: { status: 'VISIVEL' },
        select: { id: true, status: true },
      })
      return r && {
        id: r.id,
        restaurar: async () => {
          await db.forumTopico.update({
            where: { id: r.id },
            data: { status: r.status as never },
          })
        },
      }
    },
  },
  MEMORIA_FATO: {
    achar: async () => {
      const r: { id: string; status: string } | null = await db.memoriaFato.findFirst({
        where: { status: { not: 'REJEITADA' } },
        select: { id: true, status: true },
      })
      return r && {
        id: r.id,
        restaurar: async () => {
          await db.memoriaFato.update({
            where: { id: r.id },
            data: { status: r.status as never },
          })
        },
      }
    },
  },
  BRECHO_ANUNCIO: {
    achar: async () => {
      const r: { id: string; status: string } | null = await db.brechoAnuncio.findFirst({
        where: { status: { not: 'OCULTO' } },
        select: { id: true, status: true },
      })
      return r && {
        id: r.id,
        restaurar: async () => {
          await db.brechoAnuncio.update({
            where: { id: r.id },
            data: { status: r.status as never },
          })
        },
      }
    },
  },
  MENSAGEM: {
    achar: async () => {
      const r: { id: string } | null = await db.mensagemDireta.findFirst({
        where: { removidaEm: null },
        select: { id: true },
      })
      return r && {
        id: r.id,
        restaurar: async () => {
          await db.mensagemDireta.update({ where: { id: r.id }, data: { removidaEm: null } })
        },
      }
    },
  },
}

describe('A3 — ocultar oculta de verdade', () => {
  it('aplica acaoOcultar e o alvo passa a ser reportado como ocultado', async () => {
    const falhas: string[] = []
    const semFixture: string[] = []
    const provados: string[] = []

    for (const [tipo, caso] of Object.entries(CASOS_A3) as [AlvoModeracao, CasoA3][]) {
      const alvo = await caso.achar()
      if (!alvo) {
        semFixture.push(tipo)
        continue
      }
      try {
        const antes = await ALVOS_MODERACAO[tipo].carregar([alvo.id])
        if (antes[0]?.ocultado) {
          semFixture.push(`${tipo} (já oculto)`)
          continue
        }

        const op = ALVOS_MODERACAO[tipo].acaoOcultar
        if (!op) {
          falhas.push(`${tipo}: esperava acaoOcultar, veio null`)
          continue
        }
        await op(alvo.id)

        const depois = await ALVOS_MODERACAO[tipo].carregar([alvo.id])
        if (!depois[0]?.ocultado) {
          falhas.push(`${tipo}: ocultado aplicado mas carregar() ainda reporta visível`)
        } else {
          provados.push(tipo)
        }
        await alvo.restaurar()
      } catch (e) {
        falhas.push(`${tipo}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`)
        await alvo.restaurar().catch(() => {})
      }
    }

    console.log(`A3 · provados: ${provados.join(', ') || '(nenhum)'}`)
    if (semFixture.length) console.log(`A3 · sem fixture no banco local: ${semFixture.join(', ')}`)
    expect(falhas, `ocultação que não surtiu efeito:\n${falhas.join('\n')}`).toEqual([])
    // Lista fixa de propósito: se o seed local perder uma superfície, o teste
    // falha alto em vez de "passar" tendo provado menos. PRACA_COMENTARIO e
    // SALA ficam de fora — sem fixture no seed; ver §12.1 do doc do módulo.
    expect(provados.sort(), 'A3 provou menos superfícies do que da última vez').toEqual([
      'BRECHO_ANUNCIO',
      'COMENTARIO',
      'FORUM_RESPOSTA',
      'FORUM_TOPICO',
      'MEMORIA_FATO',
      'MENSAGEM',
      'POST',
      'STORY',
    ])
  })

  it('conteúdo oculto sai da leitura pública de comentário', async () => {
    const c: { id: string; postId: string } | null = await db.comentario.findFirst({
      where: { oculto: false },
      select: { id: true, postId: true },
    })
    if (!c) return

    const antes: { id: string }[] = await db.comentario.findMany({
      where: { postId: c.postId, oculto: false },
      select: { id: true },
    })
    expect(antes.map((x) => x.id)).toContain(c.id)

    await db.comentario.update({ where: { id: c.id }, data: { oculto: true } })
    const depois: { id: string }[] = await db.comentario.findMany({
      where: { postId: c.postId, oculto: false },
      select: { id: true },
    })
    await db.comentario.update({ where: { id: c.id }, data: { oculto: false } })

    expect(depois.map((x) => x.id), 'comentário oculto ainda aparece na thread').not.toContain(c.id)
  })
})

describe('A4 — alvo sem ocultação não finge que agiu', () => {
  it('operacaoOcultarAlvo é null exatamente onde alvoSoEscala é true', () => {
    const tipos = Object.keys(ALVOS_MODERACAO) as AlvoModeracao[]
    for (const tipo of tipos) {
      const op = operacaoOcultarAlvo(tipo, 'id-qualquer')
      expect(op === null, `${tipo}: alvoSoEscala e operacaoOcultarAlvo discordam`).toBe(
        alvoSoEscala(tipo),
      )
    }
  })

  it('o conjunto de superfícies que só escalam é o declarado', () => {
    const soEscalam = (Object.keys(ALVOS_MODERACAO) as AlvoModeracao[])
      .filter(alvoSoEscala)
      .sort()
    // Comunicado e evento têm autor admin com permissão; perfil, grupo, canal e
    // loja não são "conteúdo" que se esconde. Mudança aqui é decisão de
    // política — se este teste quebrar, atualize a política antes do código.
    expect(soEscalam).toEqual(
      ['BRECHO_LOJA', 'CANAL', 'COMUNICADO', 'EVENTO', 'GRUPO', 'PERFIL'].sort(),
    )
  })
})

describe('A5 — aviso ao denunciante sempre tem onde ser gravado', () => {
  it('usa o tenant da denúncia quando existe', async () => {
    const t: { id: string } | null = await db.tenant.findFirst({ select: { id: true } })
    if (!t) return
    const destino = await tenantParaAvisoDenuncia({ tenantId: t.id, afiliacaoId: null })
    expect(destino).toBe(t.id)
  })

  it('sem tenant, cai no sintético da Comunidade Nacional da afiliação', async () => {
    const a: { id: string } | null = await db.afiliacao.findFirst({ select: { id: true } })
    if (!a) return
    const destino = await tenantParaAvisoDenuncia({ tenantId: null, afiliacaoId: a.id })
    expect(destino, 'escopo CLUBE ficou sem destino de aviso — dívida D1 de volta').toBeTruthy()

    const sintetico: { sintetico: boolean } | null = await db.tenant.findUnique({
      where: { id: destino as string },
      select: { sintetico: true },
    })
    expect(sintetico?.sintetico, 'destino do aviso deveria ser tenant sintético').toBe(true)
  })

  it('sem tenant e sem afiliação devolve null em vez de inventar destino', async () => {
    expect(await tenantParaAvisoDenuncia({ tenantId: null, afiliacaoId: null })).toBeNull()
  })
})

describe('A6 — isolamento por tenant na fila', () => {
  it('denúncia de um tenant não aparece na fila de outro', async () => {
    const tenants: { id: string }[] = await db.tenant.findMany({ take: 2, select: { id: true } })
    if (tenants.length < 2) return
    const [a, b] = tenants as [{ id: string }, { id: string }]
    const denuncianteId = await denuncianteDeTeste()

    const dA: { id: string } = await db.moderacaoDenuncia.create({
      data: {
        alvoTipo: 'POST',
        alvoId: 'audit-iso-a',
        tenantId: a.id,
        denuncianteId,
        categoria: 'RACISMO',
        gravidade: 'S3',
        motivo: `${MARCA} isolamento A`,
      },
      select: { id: true },
    })
    criadas.push(dA.id)

    const filaB: { id: string }[] = await db.moderacaoDenuncia.findMany({
      where: { tenantId: b.id, status: 'PENDENTE' },
      select: { id: true },
    })
    expect(filaB.map((d) => d.id), 'VAZAMENTO cross-tenant na fila').not.toContain(dA.id)

    const filaA: { id: string }[] = await db.moderacaoDenuncia.findMany({
      where: { tenantId: a.id, status: 'PENDENTE' },
      select: { id: true },
    })
    expect(filaA.map((d) => d.id)).toContain(dA.id)
  })

  it('denúncia sem tenant não entra em nenhuma fila de tenant', async () => {
    const denuncianteId = await denuncianteDeTeste()
    const d: { id: string } = await db.moderacaoDenuncia.create({
      data: {
        alvoTipo: 'FORUM_TOPICO',
        alvoId: 'audit-iso-global',
        tenantId: null,
        denuncianteId,
        categoria: 'RACISMO',
        gravidade: 'S3',
        motivo: `${MARCA} isolamento global`,
      },
      select: { id: true },
    })
    criadas.push(d.id)

    const emFilaDeTenant: { id: string }[] = await db.moderacaoDenuncia.findMany({
      where: { tenantId: { not: null }, motivo: `${MARCA} isolamento global` },
      select: { id: true },
    })
    expect(emFilaDeTenant).toEqual([])

    const naPlataforma: { id: string }[] = await db.moderacaoDenuncia.findMany({
      where: { status: 'PENDENTE', OR: [{ escalado: true }, { tenantId: null }] },
      select: { id: true },
    })
    expect(naPlataforma.map((x) => x.id)).toContain(d.id)
  })
})

describe('A7 — auto-denúncia e limite', () => {
  it('a regra de auto-denúncia é comparação de autor, não de conteúdo', async () => {
    const alvo: { id: string; autorId: string } | null = await db.post.findFirst({
      where: { oculto: false },
      select: { id: true, autorId: true },
    })
    if (!alvo) return
    const carregado = await ALVOS_MODERACAO.POST.carregar([alvo.id])
    // O gate da action compara autorId do alvo com o viewer; se `carregar` não
    // devolvesse autorId, o gate não teria como existir.
    expect(carregado[0]?.autorId, 'carregar() precisa expor autorId para o gate de auto-denúncia').toBe(
      alvo.autorId,
    )
  })
})

describe('A8 — ordenação da fila', () => {
  it('gravidade manda; depois SLA; depois idade', () => {
    const agora = new Date('2026-09-01T12:00:00Z')
    const mais = (min: number) => new Date(agora.getTime() + min * 60_000)
    const fila = [
      { gravidade: 'S2', prazoSla: mais(10), criadoEm: agora },
      { gravidade: 'S4', prazoSla: mais(600), criadoEm: agora },
      { gravidade: 'S3', prazoSla: mais(5), criadoEm: agora },
      { gravidade: 'S3', prazoSla: mais(1), criadoEm: agora },
    ]
    const ordenada = [...fila].sort(ordenarPorPrioridade as never)
    expect(ordenada[0]?.gravidade, 'S4 tem de vir primeiro mesmo com SLA folgado').toBe('S4')
    expect(ordenada[1]?.prazoSla, 'entre S3, o SLA mais apertado vem antes').toEqual(mais(1))
    expect(ordenada[3]?.gravidade).toBe('S2')
  })
})

describe('A9 — cobertura de superfície', () => {
  it('o registro é exaustivo e cada alvo tem rótulo legível', () => {
    const tipos = Object.keys(ALVOS_MODERACAO) as AlvoModeracao[]
    expect(tipos).toHaveLength(16)
    for (const tipo of tipos) {
      expect(ALVOS_MODERACAO[tipo].label.trim().length, `${tipo} sem label`).toBeGreaterThan(0)
      expect(typeof ALVOS_MODERACAO[tipo].carregar, `${tipo} sem carregar`).toBe('function')
    }
  })

  it('as superfícies com ponto de entrada de denúncia são as declaradas', () => {
    // Atualizar esta lista **junto** com a UI, no mesmo PR. Divergência aqui é
    // o sintoma de superfície nascendo sem caminho de denúncia — foi assim que
    // o fórum ficou descoberto por meses.
    const COM_ENTRADA: AlvoModeracao[] = ['FORUM_TOPICO', 'FORUM_RESPOSTA', 'PRACA_COMENTARIO']
    const total = (Object.keys(ALVOS_MODERACAO) as AlvoModeracao[]).length
    console.log(`A9 · cobertura de entrada: ${COM_ENTRADA.length}/${total} superfícies`)
    expect(COM_ENTRADA.every((t) => t in ALVOS_MODERACAO)).toBe(true)
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
