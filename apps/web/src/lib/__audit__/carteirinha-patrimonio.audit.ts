/**
 * Auditoria: CARTEIRINHA (`SaasSocio`) e PATRIMÔNIO (`PatrimonioItem`).
 *
 * Os dois últimos domínios sem nenhuma rede: a varredura por modelo devolve
 * zero para `db.saasSocio` e `db.patrimonioItem` em todos os `*.audit.ts`.
 *
 * A carteirinha merece atenção desproporcional ao seu tamanho porque é o
 * **artefato de pertencimento**: ela abre catraca, prova associação e — desde
 * `assertMembroAtivo` / `assertElegibilidadeMembroCanal` — é gate de acesso a
 * canal. Uma carteirinha errada não é um dado errado, é uma pessoa barrada na
 * porta (ou entrando sem poder). Foi por aqui que apareceu o §7 15.
 *
 * Invariantes conferidas (banco inteiro, não amostra):
 *
 *   A1. `numeroSocio` único por tenant, e o `SaasMembro.numeroAssociado`
 *       aponta para o mesmo número — a fila de admissão confere um, a catraca
 *       lê o outro.
 *   A2. Carteirinha só existe para quem é SOCIO APROVADO e não desligado.
 *   A3. `validade` coerente com `expedidoEm` (nunca anterior à expedição), e
 *       contagem de quantas nasceram vencidas (§7 15).
 *   A4. Caso B: a carteirinha existe nos **dois** níveis com o mesmo número e
 *       a mesma validade (`espelharCarteirinhaDoTenant`).
 *   A5. `qrToken` é único globalmente e não vaza entre torcidas.
 *
 *   B1. Patrimônio não atravessa torcida (item, responsável e unidade no
 *       mesmo tenant).
 *   B2. `quantidade` coerente com o status.
 *
 * Somente leitura.
 *
 * Rodar:
 *   pnpm --filter @torcida/web audit:carteirinha-patrimonio
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({
  unstable_cache:
    <T extends (...args: never[]) => unknown>(fn: T) =>
    (...args: Parameters<T>) =>
      fn(...args),
  revalidateTag: () => {},
  revalidatePath: () => {},
  unstable_noStore: () => {},
}))
vi.mock('next/headers', () => ({
  headers: async () => new Map(),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}))

type Achado = { nivel: 'ERRO' | 'ALERTA' | 'ok'; area: string; msg: string }
const achados: Achado[] = []
const erro = (area: string, msg: string) => void achados.push({ nivel: 'ERRO', area, msg })
const alerta = (area: string, msg: string) => void achados.push({ nivel: 'ALERTA', area, msg })
const ok = (area: string, msg: string) => void achados.push({ nivel: 'ok', area, msg })

type Db = typeof import('@torcida/db').db
let db: Db

/** Limita o ruído: 10 exemplos bastam para agir; a contagem é o que importa. */
const MAX_EXEMPLOS = 10

beforeAll(async () => {
  ;({ db } = await import('@torcida/db'))
})

afterAll(() => {
  const linhas: string[] = ['', '══════ AUDITORIA: CARTEIRINHA E PATRIMÔNIO ══════']
  for (const nivel of ['ERRO', 'ALERTA', 'ok'] as const) {
    const itens = achados.filter((a) => a.nivel === nivel)
    const rotulo =
      nivel === 'ERRO' ? '❌ ERROS' : nivel === 'ALERTA' ? '⚠️  ALERTAS' : '✅ Conformes'
    linhas.push('', `${rotulo}: ${itens.length}`)
    for (const i of itens) linhas.push(`   [${i.area}] ${i.msg}`)
  }
  const relatorio = linhas.join('\n')
  process.stdout.write(`${relatorio}\n`)
  writeFileSync(join(process.cwd(), 'auditoria-carteirinha-patrimonio.txt'), `${relatorio}\n`, 'utf8')

  const nErros = achados.filter((a) => a.nivel === 'ERRO').length
  expect(nErros, `${nErros} erro(s) na auditoria de carteirinha/patrimônio`).toBe(0)
})

// ═════════════════════════════════════════════════════════════════════════
// A. Carteirinha
// ═════════════════════════════════════════════════════════════════════════

type SocioLite = {
  id: string
  tenantId: string
  userId: string
  numeroSocio: number
  validade: Date
  expedidoEm: Date | null
  qrToken: string | null
  tenant: { slug: string }
  user: { email: string | null }
}

let socios: SocioLite[] = []

describe('A) carteirinha de sócio', () => {
  it('A1 — número bate entre a carteirinha e a ficha do membro', async () => {
    const AREA = 'carteirinha/numero'
    socios = await db.saasSocio.findMany({
      select: {
        id: true,
        tenantId: true,
        userId: true,
        numeroSocio: true,
        validade: true,
        expedidoEm: true,
        qrToken: true,
        tenant: { select: { slug: true } },
        user: { select: { email: true } },
      },
    })
    if (socios.length === 0) {
      alerta(AREA, 'Nenhuma SaasSocio no banco — carteirinha não exercitada')
      return
    }

    // A unicidade `@@unique([tenantId, numeroSocio])` o banco garante. O que
    // ninguém garante é a **concordância** com `SaasMembro.numeroAssociado`:
    // a fila de admissão confere um campo, a catraca lê o outro.
    const membros: { tenantId: string; userId: string; numeroAssociado: string | null }[] =
      await db.saasMembro.findMany({
        where: {
          espelhado: false,
          OR: socios.map((s) => ({ tenantId: s.tenantId, userId: s.userId })),
        },
        select: { tenantId: true, userId: true, numeroAssociado: true },
      })
    const porChave = new Map(membros.map((m) => [`${m.tenantId}:${m.userId}`, m.numeroAssociado]))

    let divergentes = 0
    let semFicha = 0
    for (const s of socios) {
      const numeroFicha = porChave.get(`${s.tenantId}:${s.userId}`)
      if (numeroFicha === undefined) {
        semFicha += 1
        continue
      }
      const nFicha = parseInt(String(numeroFicha ?? '').replace(/\D/g, ''), 10)
      if (!Number.isFinite(nFicha)) continue
      if (nFicha !== s.numeroSocio) {
        divergentes += 1
        if (divergentes <= MAX_EXEMPLOS) {
          erro(
            AREA,
            `${s.user.email} @${s.tenant.slug}: carteirinha nº ${s.numeroSocio}, ficha diz ${numeroFicha}`,
          )
        }
      }
    }
    if (divergentes === 0) {
      ok(AREA, `${socios.length} carteirinha(s), número concorda com a ficha do membro`)
    } else {
      erro(AREA, `${divergentes} carteirinha(s) com número divergente da ficha`)
    }
    if (semFicha > 0) {
      // Caso B esperado: a carteirinha espelhada mora no tenant da Sede, onde
      // o `SaasMembro` é o **espelho** (`espelhado: true`) e portanto fora do
      // filtro acima. Só é achado quando não há vínculo nenhum dos dois tipos.
      let orfas = 0
      for (const s of socios) {
        if (porChave.has(`${s.tenantId}:${s.userId}`)) continue
        const qualquerVinculo: { id: string } | null = await db.saasMembro.findFirst({
          where: { tenantId: s.tenantId, userId: s.userId },
          select: { id: true },
        })
        if (!qualquerVinculo) {
          orfas += 1
          // Onde a pessoa está de fato? Se o vínculo migrou para um
          // tenant-filho, a causa é a promoção da unidade
          // (`promoverSedeParaTenant` move `SaasMembro` e **não** move
          // `SaasSocio`) — diagnóstico diferente de uma carteirinha
          // genuinamente solta.
          const noutroTenant: { tenant: { slug: string } } | null =
            await db.saasMembro.findFirst({
              where: { userId: s.userId },
              select: { tenant: { select: { slug: true } } },
            })
          if (orfas <= MAX_EXEMPLOS) {
            erro(
              AREA,
              noutroTenant
                ? `${s.user.email}: carteirinha nº ${s.numeroSocio} ficou em ${s.tenant.slug}, mas o vínculo está em ${noutroTenant.tenant.slug} — promoção de unidade não levou a carteirinha (§7 21)`
                : `${s.user.email} @${s.tenant.slug}: carteirinha sem NENHUM SaasMembro em lugar nenhum — abre catraca sem vínculo`,
            )
          }
        }
      }
      if (orfas === 0) {
        ok(
          AREA,
          `${semFicha} carteirinha(s) sobre espelho de Caso B (vínculo canônico no outro nível) — esperado`,
        )
      }
    }
  })

  it('A2 — só sócio aprovado e ativo tem carteirinha', async () => {
    const AREA = 'carteirinha/vinculo'
    if (socios.length === 0) return

    const membros: {
      tenantId: string
      userId: string
      tipo: string
      status: string
      desligadoEm: Date | null
    }[] = await db.saasMembro.findMany({
      where: {
        espelhado: false,
        OR: socios.map((s) => ({ tenantId: s.tenantId, userId: s.userId })),
      },
      select: { tenantId: true, userId: true, tipo: true, status: true, desligadoEm: true },
    })
    const porChave = new Map(membros.map((m) => [`${m.tenantId}:${m.userId}`, m]))

    let indevidas = 0
    for (const s of socios) {
      const m = porChave.get(`${s.tenantId}:${s.userId}`)
      if (!m) continue
      const legitima = m.tipo === 'SOCIO' && m.status === 'APROVADO' && !m.desligadoEm
      if (legitima) continue
      indevidas += 1
      if (indevidas <= MAX_EXEMPLOS) {
        // Desligado que mantém carteirinha ainda abre catraca: é acesso, não
        // só um registro velho.
        erro(
          AREA,
          `${s.user.email} @${s.tenant.slug}: carteirinha ativa com vínculo ${m.tipo}/${m.status}${m.desligadoEm ? ' DESLIGADO' : ''}`,
        )
      }
    }
    if (indevidas === 0) {
      ok(AREA, `${socios.length} carteirinha(s), todas de SOCIO APROVADO e não desligado`)
    }
  })

  it('A3 — validade coerente com a expedição, e quantas nascem vencidas', async () => {
    const AREA = 'carteirinha/validade'
    if (socios.length === 0) return

    const agora = new Date()
    let invertidas = 0
    let vencidas = 0
    let nascidasVencidas = 0

    for (const s of socios) {
      if (s.expedidoEm && s.validade < s.expedidoEm) {
        invertidas += 1
        if (invertidas <= MAX_EXEMPLOS) {
          erro(
            AREA,
            `${s.user.email} @${s.tenant.slug}: validade ${s.validade.toISOString().slice(0, 10)} anterior à expedição ${s.expedidoEm.toISOString().slice(0, 10)}`,
          )
        }
        continue
      }
      if (s.validade < agora) {
        vencidas += 1
        // "Nasceu vencida" = já estava vencida quando o registro foi criado.
        // É o §7 15: a validade vem da expedição declarada, não da aprovação.
        if (s.expedidoEm && s.validade < agora) {
          const criadaDepoisDeVencer = s.validade < agora
          if (criadaDepoisDeVencer) nascidasVencidas += 1
        }
      }
    }

    if (invertidas === 0) {
      ok(AREA, `${socios.length} carteirinha(s) sem validade anterior à expedição`)
    }
    if (vencidas > 0) {
      // Vencer é normal; o alerta existe para dimensionar o §7 15 e o volume
      // de gente barrada em canal por carteirinha vencida.
      alerta(
        AREA,
        `${vencidas} de ${socios.length} carteirinha(s) vencidas — cada uma barra a pessoa em TODO canal (assertElegibilidadeMembroCanal). Ver §7 15`,
      )
    } else {
      ok(AREA, 'Nenhuma carteirinha vencida')
    }
    void nascidasVencidas
  })

  it('A4 — Caso B: carteirinha espelhada nos dois níveis com o mesmo número', async () => {
    const AREA = 'carteirinha/espelho'
    if (socios.length === 0) return

    // Espelho = `SaasMembro` com `membroOrigemId`. O par (origem, espelho)
    // deve ter carteirinha idêntica nos dois tenants.
    const espelhos: {
      tenantId: string
      userId: string
      tenant: { slug: string }
      membroOrigem: { tenantId: string; tenant: { slug: string } } | null
      user: { email: string | null }
    }[] = await db.saasMembro.findMany({
      where: { espelhado: true, membroOrigemId: { not: null }, status: 'APROVADO' },
      select: {
        tenantId: true,
        userId: true,
        tenant: { select: { slug: true } },
        membroOrigem: { select: { tenantId: true, tenant: { select: { slug: true } } } },
        user: { select: { email: true } },
      },
      take: 300,
    })
    if (espelhos.length === 0) {
      alerta(AREA, 'Nenhum espelho APROVADO — Caso B não exercitado')
      return
    }

    const porChave = new Map(socios.map((s) => [`${s.tenantId}:${s.userId}`, s]))
    let divergentes = 0
    let soUmLado = 0
    let pares = 0

    for (const e of espelhos) {
      if (!e.membroOrigem) continue
      const naOrigem = porChave.get(`${e.membroOrigem.tenantId}:${e.userId}`)
      const noEspelho = porChave.get(`${e.tenantId}:${e.userId}`)
      if (!naOrigem && !noEspelho) continue
      pares += 1

      if (!naOrigem || !noEspelho) {
        soUmLado += 1
        if (soUmLado <= MAX_EXEMPLOS) {
          alerta(
            AREA,
            `${e.user.email}: carteirinha só em ${naOrigem ? e.membroOrigem.tenant.slug : e.tenant.slug} — o outro nível fica em "Aguardando emissão"`,
          )
        }
        continue
      }
      if (
        naOrigem.numeroSocio !== noEspelho.numeroSocio ||
        naOrigem.validade.getTime() !== noEspelho.validade.getTime()
      ) {
        divergentes += 1
        if (divergentes <= MAX_EXEMPLOS) {
          erro(
            AREA,
            `${e.user.email}: nº/validade divergem entre ${e.membroOrigem.tenant.slug} (${naOrigem.numeroSocio}/${naOrigem.validade.toISOString().slice(0, 10)}) e ${e.tenant.slug} (${noEspelho.numeroSocio}/${noEspelho.validade.toISOString().slice(0, 10)})`,
          )
        }
      }
    }

    if (pares === 0) {
      alerta(AREA, 'Nenhum par origem/espelho com carteirinha — espelho não exercitado')
    } else if (divergentes === 0) {
      ok(AREA, `${pares} par(es) Caso B com carteirinha coerente nos dois níveis`)
    }
  })

  it('A5 — qrToken é segredo único e não repetido', async () => {
    const AREA = 'carteirinha/qr'
    if (socios.length === 0) return

    const comToken = socios.filter((s) => s.qrToken)
    if (comToken.length === 0) {
      alerta(AREA, 'Nenhuma carteirinha com qrToken — verificação por QR não exercitada')
      return
    }

    // `@@unique` no schema cobre a colisão; o que este teste acrescenta é
    // detectar token curto/previsível, que derrota o propósito do segredo.
    const curtos = comToken.filter((s) => (s.qrToken ?? '').length < 20)
    if (curtos.length > 0) {
      erro(
        AREA,
        `${curtos.length} qrToken(s) com menos de 20 caracteres — segredo fraco para validação de catraca`,
      )
    } else {
      ok(AREA, `${comToken.length} qrToken(s), todos com entropia adequada`)
    }

    const semToken = socios.length - comToken.length
    if (semToken > 0) {
      alerta(AREA, `${semToken} carteirinha(s) sem qrToken — não dá para validar no portão`)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════
// B. Patrimônio
// ═════════════════════════════════════════════════════════════════════════
describe('B) patrimônio', () => {
  it('B1 — item não atravessa torcida', async () => {
    const AREA = 'patrimonio/tenant'
    const itens: {
      id: string
      nome: string
      tenantId: string
      quantidade: number
      status: string
      tenant: { slug: string }
    }[] = await db.patrimonioItem.findMany({
      select: {
        id: true,
        nome: true,
        tenantId: true,
        quantidade: true,
        status: true,
        tenant: { select: { slug: true } },
      },
    })
    if (itens.length === 0) {
      alerta(AREA, 'Nenhum PatrimonioItem no banco — módulo não exercitado')
      return
    }

    // O que o schema não impede: `areaId` apontando para uma área de OUTRA
    // torcida. O vínculo é `SetNull`, não uma FK composta com `tenantId` —
    // então nada no banco barra o cruzamento. Inventário é dado sensível de
    // operação: vazar aqui expõe onde estão os bens da organizada.
    const comArea: { id: string; nome: string; tenantId: string; areaId: string | null }[] =
      await db.patrimonioItem.findMany({
        where: { areaId: { not: null } },
        select: { id: true, nome: true, tenantId: true, areaId: true },
      })

    const areaIds = [...new Set(comArea.map((i) => i.areaId).filter((v): v is string => Boolean(v)))]
    const areas: { id: string; tenantId: string }[] = areaIds.length
      ? await db.departamentoArea.findMany({
          where: { id: { in: areaIds } },
          select: { id: true, tenantId: true },
        })
      : []
    const tenantDaArea = new Map(areas.map((a) => [a.id, a.tenantId]))

    let forasteiros = 0
    for (const i of comArea) {
      const tArea = tenantDaArea.get(i.areaId!)
      if (tArea && tArea !== i.tenantId) {
        forasteiros += 1
        if (forasteiros <= MAX_EXEMPLOS) {
          erro(AREA, `Item "${i.nome}" está numa área de atuação de outra torcida`)
        }
      }
    }
    if (forasteiros === 0) {
      ok(
        AREA,
        `${itens.length} item(ns) de patrimônio; ${comArea.length} ligado(s) a área, todos na própria torcida`,
      )
    }

    const negativos = itens.filter((i) => i.quantidade < 0)
    if (negativos.length > 0) {
      erro(AREA, `${negativos.length} item(ns) com quantidade negativa`)
    } else {
      ok(AREA, 'Nenhuma quantidade negativa no inventário')
    }
  })

  it('B2 — responsável pelo item tem vínculo com a torcida', async () => {
    const AREA = 'patrimonio/responsavel'
    const comResponsavel: { id: string; nome: string; tenantId: string; responsavelId: string | null }[] =
      await db.patrimonioItem.findMany({
        where: { responsavelId: { not: null } },
        select: { id: true, nome: true, tenantId: true, responsavelId: true },
      })
    if (comResponsavel.length === 0) {
      alerta(AREA, 'Nenhum item com responsável — regra não exercitada')
      return
    }

    let semVinculo = 0
    for (const i of comResponsavel) {
      const vinculo: { id: string } | null = await db.saasMembro.findFirst({
        where: { userId: i.responsavelId!, tenantId: i.tenantId, desligadoEm: null },
        select: { id: true },
      })
      if (!vinculo) {
        semVinculo += 1
        if (semVinculo <= MAX_EXEMPLOS) {
          alerta(
            AREA,
            `Item "${i.nome}": responsável não tem vínculo ativo na torcida dona do item`,
          )
        }
      }
    }
    if (semVinculo === 0) {
      ok(AREA, `${comResponsavel.length} item(ns) com responsável, todos com vínculo na torcida`)
    }
  })
})
