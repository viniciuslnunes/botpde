/**
 * Auditoria de JORNADAS — o lote semeado por `seed:jornadas` conferido contra
 * o código real: **direcionamento a canais** e **vazamento de permissão**.
 *
 * A pergunta que esta auditoria responde é uma só, repetida pessoa a pessoa:
 * *o que essa conta enxerga é exatamente o que o fluxo dela deveria dar?*
 * Nada de amostragem — cada usuário `@jornada.torcida.app` é medido, porque
 * vazamento costuma aparecer em **um** registro, não na média.
 *
 * Três blocos:
 *
 *   A. Estado por fluxo — compara cada pessoa contra `ESPERADO_POR_FLUXO`
 *      (tipo/status do vínculo, se abre a torcida, se vê o mural de sócios,
 *      canal da unidade × canal da Sede).
 *   B. Canais — quem está dentro de cada canal do lote é quem pode estar:
 *      visibilidade respeitada, pedido pendente sem acesso, canal fechado sem
 *      entrada direta, e ninguém de outro tenant/clube dentro.
 *   C. Permissões — matriz de permissões efetivas por desfecho. Pendente e
 *      reprovado não podem ter nada; torcedor não pode ter o pacote de sócio;
 *      aprovado não pode ter permissão de liderança sem cargo que a conceda.
 *
 * Somente leitura: nenhuma mutação, nada a reverter.
 *
 * Rodar (depois de `pnpm --filter @torcida/web seed:jornadas`):
 *   pnpm --filter @torcida/web audit:jornadas
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  DOMINIO_JORNADA,
  ESPERADO_POR_FLUXO,
  MARCA_JORNADA,
  type DesfechoJornada,
  type FluxoJornada,
} from '../__seed__/_jornadas'

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
// A auditoria é de leitura, mas a sonda B3 chama uma action para confirmar que
// ela **recusa**. Mockar a sessão é mais barato e mais honesto que trocar
// `auth` em runtime: importar o módulo real puxaria `next-auth`, que não
// resolve fora do bundler do Next.
let sessaoAtual: { user: { id: string; email: string; name: string } } | null = null
vi.mock('@/lib/auth', () => ({
  auth: async () => sessaoAtual,
  signIn: async () => {},
  signOut: async () => {},
  handlers: {},
}))

type Achado = { nivel: 'ERRO' | 'ALERTA' | 'ok'; area: string; msg: string }
const achados: Achado[] = []
const erro = (area: string, msg: string) => void achados.push({ nivel: 'ERRO', area, msg })
const alerta = (area: string, msg: string) => void achados.push({ nivel: 'ALERTA', area, msg })
const ok = (area: string, msg: string) => void achados.push({ nivel: 'ok', area, msg })

type Db = typeof import('@torcida/db').db
let db: Db

const FILTRO_JORNADA = { email: { endsWith: `@${DOMINIO_JORNADA}` } }

// ── Reconstrução do fluxo a partir do banco ──────────────────────────────
/**
 * O seed não grava uma coluna "fluxo" — não existe no modelo, e inventá-la
 * faria a auditoria conferir a própria anotação em vez do produto. O fluxo é
 * **derivado** do estado, exatamente como o produto o derivaria:
 *
 *   sem `SaasMembro`                     → torcedor_global
 *   `tipo: TORCEDOR`                     → torcedor_torcida
 *   `tipo: SOCIO` com `numeroAssociado`  → socio_vinculo   («já sou sócio»)
 *   `tipo: SOCIO` sem `numeroAssociado`  → socio_associacao («quero me associar»)
 *
 * A distinção sócio-vínculo × sócio-associação por `numeroAssociado` é a
 * mesma que `camposMembroDoCenario` e a fila de admissão usam.
 */
interface PessoaAuditada {
  userId: string
  email: string
  nome: string
  fluxo: FluxoJornada
  desfecho: DesfechoJornada
  tenantId: string | null
  tenantSlug: string | null
  sedeId: string | null
  membroId: string | null
}

async function carregarPessoas(): Promise<PessoaAuditada[]> {
  const users: {
    id: string
    email: string | null
    nome: string | null
  }[] = await db.user.findMany({
    where: FILTRO_JORNADA,
    select: { id: true, email: true, nome: true },
    orderBy: { criadoEm: 'asc' },
  })

  const pessoas: PessoaAuditada[] = []
  for (const u of users) {
    // Canônico = não espelhado. O espelho na Sede (Caso B) é projeção do
    // mesmo vínculo; auditar os dois contaria a mesma pessoa duas vezes.
    const membro: {
      id: string
      tenantId: string
      tipo: string
      status: string
      sedeId: string | null
      numeroAssociado: string | null
      tenant: { slug: string }
    } | null = await db.saasMembro.findFirst({
      where: { userId: u.id, espelhado: false, membroOrigemId: null },
      select: {
        id: true,
        tenantId: true,
        tipo: true,
        status: true,
        sedeId: true,
        numeroAssociado: true,
        tenant: { select: { slug: true } },
      },
      orderBy: { criadoEm: 'asc' },
    })

    const fluxo: FluxoJornada = !membro
      ? 'torcedor_global'
      : membro.tipo === 'TORCEDOR'
        ? 'torcedor_torcida'
        : membro.numeroAssociado
          ? 'socio_vinculo'
          : 'socio_associacao'

    const desfecho: DesfechoJornada = !membro
      ? 'pendente'
      : membro.status === 'APROVADO'
        ? 'aprovado'
        : membro.status === 'REPROVADO'
          ? 'reprovado'
          : 'pendente'

    pessoas.push({
      userId: u.id,
      email: u.email ?? '(sem e-mail)',
      nome: u.nome ?? '(sem nome)',
      fluxo,
      desfecho,
      tenantId: membro?.tenantId ?? null,
      tenantSlug: membro?.tenant.slug ?? null,
      sedeId: membro?.sedeId ?? null,
      membroId: membro?.id ?? null,
    })
  }
  return pessoas
}

let pessoas: PessoaAuditada[] = []

beforeAll(async () => {
  ;({ db } = await import('@torcida/db'))
  pessoas = await carregarPessoas()
  if (pessoas.length === 0) {
    throw new Error(
      'Nenhum usuário do lote de jornadas. Rode: pnpm --filter @torcida/web seed:jornadas',
    )
  }
})

afterAll(() => {
  const linhas: string[] = ['', '══════ AUDITORIA DE JORNADAS ══════']
  for (const nivel of ['ERRO', 'ALERTA', 'ok'] as const) {
    const itens = achados.filter((a) => a.nivel === nivel)
    const rotulo =
      nivel === 'ERRO' ? '❌ ERROS' : nivel === 'ALERTA' ? '⚠️  ALERTAS' : '✅ Conformes'
    linhas.push('', `${rotulo}: ${itens.length}`)
    for (const i of itens) linhas.push(`   [${i.area}] ${i.msg}`)
  }
  linhas.push('', `👥 Pessoas auditadas: ${pessoas.length}`)
  const relatorio = linhas.join('\n')
  process.stdout.write(`${relatorio}\n`)
  writeFileSync(join(process.cwd(), 'auditoria-jornadas.txt'), `${relatorio}\n`, 'utf8')

  const nErros = achados.filter((a) => a.nivel === 'ERRO').length
  expect(nErros, `${nErros} erro(s) na auditoria de jornadas`).toBe(0)
})

// ═════════════════════════════════════════════════════════════════════════
// A. Estado por fluxo
// ═════════════════════════════════════════════════════════════════════════
describe('A) cada fluxo termina no estado que a spec promete', () => {
  it('vínculo, contexto e mural batem com ESPERADO_POR_FLUXO', async () => {
    const AREA = 'jornada/estado'
    const { resolveUserTenantSlugForUser, vinculoAutorizaContextoTenant } = await import(
      '@/lib/tenant-context'
    )
    const { podeVerFeedSocios } = await import('@/lib/feed')

    for (const p of pessoas) {
      const esperado = ESPERADO_POR_FLUXO[p.fluxo]?.[p.desfecho]
      if (!esperado) {
        alerta(AREA, `${p.email}: combinação ${p.fluxo}/${p.desfecho} não prevista na matriz`)
        continue
      }
      const rotulo = `${p.email} (${p.fluxo}/${p.desfecho})`

      if (esperado.temMembro !== Boolean(p.membroId)) {
        erro(AREA, `${rotulo}: temMembro=${Boolean(p.membroId)}, esperado ${esperado.temMembro}`)
        continue
      }
      if (!p.tenantId) {
        // Torcedor global: só precisa não abrir nenhuma torcida.
        const slug = await resolveUserTenantSlugForUser(p.userId)
        if (slug) {
          erro(AREA, `${rotulo}: torcedor global resolveu a torcida "${slug}" — vazou modo sócio`)
        } else {
          ok(AREA, `${rotulo}: sem torcida ativa (Comunidade Nacional)`)
        }
        continue
      }

      // Abre a torcida? O predicado é o mesmo que o cookie e o subdomínio usam.
      const abre = await vinculoAutorizaContextoTenant(p.userId, p.tenantSlug!)
      if (abre !== esperado.abreTenant) {
        erro(
          AREA,
          `${rotulo}: vinculoAutorizaContextoTenant(${p.tenantSlug})=${abre}, esperado ${esperado.abreTenant}`,
        )
      } else {
        ok(AREA, `${rotulo}: acesso à torcida = ${abre}`)
      }

      const veMural = await podeVerFeedSocios(p.userId, p.tenantId)
      if (veMural !== esperado.veMuralSocios) {
        erro(
          AREA,
          `${rotulo}: podeVerFeedSocios=${veMural}, esperado ${esperado.veMuralSocios} — mural TENANT ${veMural ? 'vazou' : 'quebrou'}`,
        )
      } else {
        ok(AREA, `${rotulo}: mural de sócios = ${veMural}`)
      }
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════
// B. Canais — direcionamento
// ═════════════════════════════════════════════════════════════════════════

/** Canal oficial da unidade e da Sede raiz de um vínculo. */
async function canaisEsperados(
  tenantId: string,
  sedeId: string | null,
): Promise<{ unidade: string | null; sede: string | null }> {
  const { getAncestorTenantIds } = await import('@/lib/hierarquia')

  const unidade: { canalConversaId: string | null } | null = sedeId
    ? await db.sede.findUnique({ where: { id: sedeId }, select: { canalConversaId: true } })
    : null

  // Sede raiz = tenant mais distante na cadeia de ancestrais; se não houver
  // ancestral, o próprio tenant é a raiz.
  const ancestrais = await getAncestorTenantIds(tenantId)
  const raizId = ancestrais.length > 0 ? ancestrais[ancestrais.length - 1]! : tenantId
  const sedeRaiz: { canalConversaId: string | null } | null = await db.sede.findFirst({
    where: { tenantId: raizId, tipo: 'SEDE' },
    select: { canalConversaId: true },
    orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
  })

  return { unidade: unidade?.canalConversaId ?? null, sede: sedeRaiz?.canalConversaId ?? null }
}

/**
 * O canal da unidade está hospedado em OUTRO tenant que não o do vínculo
 * canônico da pessoa? É a assinatura do Caso B com canal emprestado — a
 * `Sede` pertence ao tenant-filho, a `Conversa` mora no tenant da mãe.
 */
async function canalEmprestado(conversaId: string, p: PessoaAuditada): Promise<boolean> {
  if (!p.tenantId) return false
  const conversa: { tenantId: string } | null = await db.conversa.findUnique({
    where: { id: conversaId },
    select: { tenantId: true },
  })
  return Boolean(conversa && conversa.tenantId !== p.tenantId)
}

describe('B1) canal oficial: quem entra na unidade e quem entra na Sede', () => {
  it('sócio aprovado nos dois; torcedor só na unidade; pendente em nenhum', async () => {
    const AREA = 'jornada/canal-oficial'

    for (const p of pessoas) {
      const esperado = ESPERADO_POR_FLUXO[p.fluxo]?.[p.desfecho]
      if (!esperado || !p.tenantId) continue
      const rotulo = `${p.email} (${p.fluxo}/${p.desfecho})`

      const { unidade, sede } = await canaisEsperados(p.tenantId, p.sedeId)

      const estaAtivo = async (conversaId: string | null): Promise<boolean> => {
        if (!conversaId) return false
        const m: { status: string; saiuEm: Date | null } | null =
          await db.membroConversa.findUnique({
            where: { conversaId_userId: { conversaId, userId: p.userId } },
            select: { status: true, saiuEm: true },
          })
        return m?.status === 'ATIVO' && !m.saiuEm
      }

      // Convite da Sede raiz pré-seleciona a própria SEDE como unidade
      // (`decidirPassoInicialConvite`), e aí "canal da unidade" e "canal da
      // Sede" são a MESMA `Conversa`. Medir a mesma linha com as duas
      // expectativas — uma verdadeira e uma falsa — garantiria um achado
      // falso. Quando coincidem, vale a regra da unidade: foi por ela que a
      // pessoa entrou.
      const mesmoCanal = Boolean(unidade && sede && unidade === sede)

      if (unidade) {
        const dentro = await estaAtivo(unidade)
        if (dentro !== esperado.noCanalDaUnidade) {
          if (p.desfecho === 'reprovado' && dentro) {
            // Herança do estado de PENDENTE: a inscrição no canal da unidade
            // acontece na solicitação, e `reprovarMembro` não a desfaz. Quem
            // foi recusado continua lendo o canal. Decisão de produto, não
            // defeito mecânico — ver ARCHITECTURE §7 18.
            alerta(
              AREA,
              `${rotulo}: segue ATIVO no canal da unidade após a reprovação — reprovarMembro não remove a inscrição`,
            )
          } else if (!dentro && p.desfecho === 'pendente' && (await canalEmprestado(unidade, p))) {
            // Caso B com canal emprestado: a `Sede` é do tenant-filho, mas a
            // `Conversa` está hospedada no tenant da mãe. O pendente tem
            // espelho na mãe e o canônico na unidade, e nenhum dos dois está
            // ATIVO — o fallback de canal emprestado então não troca o
            // `tenantVinculoId`, e a carve-out de SOCIO PENDENTE procura o
            // vínculo no tenant errado. Resultado: ele não entra em canal
            // nenhum, enquanto quem entrou pela Sede raiz entra.
            // Ver ARCHITECTURE §7 19.
            alerta(
              AREA,
              `${rotulo}: sem canal nenhum — canal emprestado da unidade Caso B não aceita o pendente (§7 19)`,
            )
          } else {
            const msg = dentro
              ? 'está no canal da unidade sem direito'
              : 'não foi inscrito no canal da unidade'
            erro(AREA, `${rotulo}: ${msg}`)
          }
        } else {
          ok(AREA, `${rotulo}: canal da unidade = ${dentro}`)
        }
      } else if (esperado.noCanalDaUnidade) {
        // Provisionamento é write-on-GET proibido: reportar, não corrigir.
        alerta(
          AREA,
          `${rotulo}: unidade sem canal oficial provisionado — rode db:ensure-canais-oficiais`,
        )
      }

      if (mesmoCanal) {
        // Já medido acima como canal da unidade. Mas há uma consequência de
        // produto que só aparece aqui: entrar pelo convite da Sede raiz
        // coloca TORCEDOR e SOCIO PENDENTE dentro do canal oficial da Sede —
        // o espaço que `vincularMembroCanaisAposAprovacao` documenta como
        // "de sócio". A regra é burlada pela geometria, não pelo código.
        if (!esperado.noCanalDaSede && (await estaAtivo(sede))) {
          // §7 17 fechado com `recusarCanalDaSede`: um lote semeado depois da
          // correção não produz mais isto. Aparecendo, é **dado legado** —
          // inscrição feita antes do fix, que o repair
          // `db:repair-canal-membro-pendente-aprovado` encerra.
          alerta(
            AREA,
            `${rotulo}: no canal oficial da SEDE — dado anterior ao fix do §7 17; limpar com db:repair-canal-membro-pendente-aprovado`,
          )
        }
      } else if (sede) {
        const dentro = await estaAtivo(sede)
        if (dentro !== esperado.noCanalDaSede) {
          const msg = dentro
            ? 'ENTROU no canal da SEDE sem ser sócio aprovado — vazamento'
            : 'sócio aprovado ficou fora do canal da SEDE'
          erro(AREA, `${rotulo}: ${msg}`)
        } else {
          ok(AREA, `${rotulo}: canal da Sede = ${dentro}`)
        }
      } else if (esperado.noCanalDaSede) {
        alerta(AREA, `${rotulo}: Sede raiz sem canal oficial provisionado`)
      }
    }
  })
})

describe('B2) canais do lote: ninguém dentro sem poder ver', () => {
  it('todo membro ATIVO passa por podeVerCanal do próprio contexto', async () => {
    const AREA = 'jornada/canal-tematico'
    const { podeVerCanal } = await import('@/lib/canais')
    const { getActiveTenant } = await import('@/lib/tenant')

    const canais: {
      id: string
      nome: string | null
      tenantId: string
      visibilidadeCanal: string
      publica: boolean
    }[] = await db.conversa.findMany({
      where: { tipo: 'CANAL', nome: { startsWith: MARCA_JORNADA } },
      select: { id: true, nome: true, tenantId: true, visibilidadeCanal: true, publica: true },
    })
    if (canais.length === 0) {
      alerta(AREA, 'Nenhum canal do lote — Fase 3 do seed não rodou')
      return
    }

    for (const canal of canais) {
      const membros: { userId: string; status: string; saiuEm: Date | null }[] =
        await db.membroConversa.findMany({
          where: { conversaId: canal.id },
          select: { userId: true, status: true, saiuEm: true },
        })

      let ativos = 0
      let pendentes = 0
      for (const m of membros) {
        if (m.saiuEm) continue
        if (m.status === 'PENDENTE') {
          pendentes += 1
          continue
        }
        if (m.status !== 'ATIVO') continue
        ativos += 1

        const u: { email: string | null } | null = await db.user.findUnique({
          where: { id: m.userId },
          select: { email: true },
        })
        const ativo = await getActiveTenant(m.userId, u?.email ?? null)
        // Sem tenant ativo (torcedor/CN) o gate é o ramo nacional de
        // `entrarCanal`: só canal PUBLICO de tenant não-sintético do clube.
        if (!ativo) {
          if (canal.visibilidadeCanal !== 'PUBLICO') {
            erro(
              AREA,
              `${u?.email} está ATIVO em "${canal.nome}" (${canal.visibilidadeCanal}) sem torcida ativa — só PUBLICO alcança a CN`,
            )
          }
          continue
        }
        const pode = await podeVerCanal(
          ativo.id,
          canal.tenantId,
          canal.visibilidadeCanal as 'TENANT' | 'HIERARQUIA' | 'ALIADOS' | 'PUBLICO',
          m.userId,
        )
        if (!pode) {
          erro(
            AREA,
            `${u?.email} está ATIVO em "${canal.nome}" (${canal.visibilidadeCanal}) mas podeVerCanal=false`,
          )
        }
      }

      ok(AREA, `"${canal.nome}": ${ativos} ativo(s), ${pendentes} pendente(s)`)

      // Canal fechado só admite quem foi decidido — pedido pendente não conta
      // como membro em lugar nenhum da UI.
      if (!canal.publica && pendentes > 0) {
        ok(AREA, `"${canal.nome}": fila de pedidos com ${pendentes} aguardando decisão`)
      }
    }
  })
})

describe('B3) canal fechado não aceita entrada direta', () => {
  it('entrarCanal recusa em canal com publica=false', async () => {
    const AREA = 'jornada/canal-fechado'
    const { entrarCanal } = await import('@/app/portal/comunidade/actions')

    const fechado: { id: string; nome: string | null; tenantId: string } | null =
      await db.conversa.findFirst({
        where: { tipo: 'CANAL', nome: { startsWith: MARCA_JORNADA }, publica: false },
        select: { id: true, nome: true, tenantId: true },
      })
    if (!fechado) {
      alerta(AREA, 'Nenhum canal fechado no lote — sonda não aplicável')
      return
    }

    // Alguém do lote, aprovado no mesmo tenant, que ainda não está no canal.
    const candidato = pessoas.find(
      (p) => p.tenantId === fechado.tenantId && p.desfecho === 'aprovado',
    )
    if (!candidato) {
      alerta(AREA, 'Sem candidato aprovado no tenant do canal fechado')
      return
    }
    const jaDentro: { id: string } | null = await db.membroConversa.findUnique({
      where: { conversaId_userId: { conversaId: fechado.id, userId: candidato.userId } },
      select: { id: true },
    })
    if (jaDentro) {
      ok(AREA, `${candidato.email} já passou pela fila deste canal — sonda pulada`)
      return
    }

    const anterior = sessaoAtual
    sessaoAtual = {
      user: { id: candidato.userId, email: candidato.email, name: candidato.nome },
    }
    try {
      await entrarCanal(fechado.id)
      erro(AREA, `entrarCanal aceitou entrada direta em canal fechado "${fechado.nome}"`)
    } catch (e) {
      ok(
        AREA,
        `entrarCanal recusou entrada direta em "${fechado.nome}": "${e instanceof Error ? e.message : e}"`,
      )
    } finally {
      sessaoAtual = anterior
    }
  })
})

describe('B4) canal do lote não mistura torcidas nem clubes', () => {
  it('todo membro ATIVO tem vínculo na linhagem do tenant do canal', async () => {
    const AREA = 'jornada/canal-isolamento'
    const { getTorcidaLineageTenantIds, getAlliedTenantIds } = await import('@/lib/hierarquia')

    const canais: {
      id: string
      nome: string | null
      tenantId: string
      visibilidadeCanal: string
    }[] = await db.conversa.findMany({
      where: { tipo: 'CANAL', nome: { startsWith: MARCA_JORNADA } },
      select: { id: true, nome: true, tenantId: true, visibilidadeCanal: true },
    })

    for (const canal of canais) {
      // `PUBLICO` alcança a Comunidade Nacional do clube — a checagem de
      // linhagem não se aplica, e o gate dele já foi medido em B2.
      if (canal.visibilidadeCanal === 'PUBLICO') continue

      const lineage = await getTorcidaLineageTenantIds(canal.tenantId)
      const aliados =
        canal.visibilidadeCanal === 'ALIADOS' ? await getAlliedTenantIds(canal.tenantId) : []
      const permitidos = new Set([...lineage, ...aliados])

      const membros: { userId: string }[] = await db.membroConversa.findMany({
        where: { conversaId: canal.id, status: 'ATIVO', saiuEm: null },
        select: { userId: true },
      })

      let forasteiros = 0
      for (const m of membros) {
        const vinculo: { tenantId: string } | null = await db.saasMembro.findFirst({
          where: {
            userId: m.userId,
            status: 'APROVADO',
            desligadoEm: null,
            tenantId: { in: [...permitidos] },
          },
          select: { tenantId: true },
        })
        if (!vinculo) {
          const u: { email: string | null } | null = await db.user.findUnique({
            where: { id: m.userId },
            select: { email: true },
          })
          forasteiros += 1
          erro(
            AREA,
            `${u?.email} está em "${canal.nome}" (${canal.visibilidadeCanal}) sem vínculo aprovado na linhagem/aliados do tenant`,
          )
        }
      }
      if (forasteiros === 0) {
        ok(AREA, `"${canal.nome}": ${membros.length} membro(s), todos da linhagem/aliados`)
      }
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════
// C. Permissões — vazamento
// ═════════════════════════════════════════════════════════════════════════

/** Permissões que só liderança tem — nenhuma delas pode aparecer sem cargo. */
const PERMISSOES_DE_LIDERANCA = [
  'members:approve',
  'members:reject',
  'roles:manage',
  'settings:manage',
  'finance:manage',
  'store:manage',
  'bar:manage',
  'members:purge',
]

describe('C1) pendente e reprovado não têm nenhuma permissão', () => {
  it('sem cargo, sem override, sem permissão efetiva', async () => {
    const AREA = 'jornada/permissao-fila'
    const { calculateEffectivePermissions } = await import('@torcida/types')
    const { getUserPermissionsInTenant } = await import('@/lib/tenant')

    for (const p of pessoas) {
      if (p.desfecho === 'aprovado' || !p.tenantId) continue
      const bruto = await getUserPermissionsInTenant(p.userId, p.tenantId)
      const efetivas = calculateEffectivePermissions(bruto.rolePermissions, bruto.overrides)
      if (efetivas.length > 0) {
        erro(
          AREA,
          `${p.email} (${p.desfecho}) tem ${efetivas.length} permissão(ões) em ${p.tenantSlug}: ${efetivas.join(', ')}`,
        )
      } else {
        ok(AREA, `${p.email} (${p.desfecho}): sem permissões em ${p.tenantSlug}`)
      }
    }
  })
})

describe('C2) torcedor aprovado não recebe o pacote de sócio', () => {
  it('TORCEDOR não ganha cargo member nem permissão de liderança', async () => {
    const AREA = 'jornada/permissao-torcedor'
    const { calculateEffectivePermissions } = await import('@torcida/types')
    const { getUserPermissionsInTenant } = await import('@/lib/tenant')

    for (const p of pessoas) {
      if (p.fluxo !== 'torcedor_torcida' || !p.tenantId) continue
      const bruto = await getUserPermissionsInTenant(p.userId, p.tenantId)
      const efetivas = calculateEffectivePermissions(bruto.rolePermissions, bruto.overrides)
      const vazadas = efetivas.filter((e) => PERMISSOES_DE_LIDERANCA.includes(e))
      if (vazadas.length > 0) {
        erro(AREA, `${p.email} (TORCEDOR) tem permissão de liderança: ${vazadas.join(', ')}`)
        continue
      }
      // `community:post` / `messages:send` viriam do cargo `member`, que só a
      // aprovação de sócio concede. Torcedor lê o mural, não publica nele.
      if (efetivas.includes('community:post')) {
        erro(AREA, `${p.email} (TORCEDOR) recebeu community:post — pacote de sócio vazou`)
      } else {
        ok(AREA, `${p.email}: TORCEDOR sem pacote de sócio (${efetivas.length} permissão(ões))`)
      }
    }
  })
})

describe('C3) sócio aprovado tem o pacote básico e nada além dele', () => {
  it('liderança só com cargo que a conceda', async () => {
    const AREA = 'jornada/permissao-socio'
    const { calculateEffectivePermissions } = await import('@torcida/types')
    const { getUserPermissionsInTenant } = await import('@/lib/tenant')

    for (const p of pessoas) {
      if (p.desfecho !== 'aprovado' || !p.tenantId) continue
      if (p.fluxo === 'torcedor_torcida' || p.fluxo === 'torcedor_global') continue

      const bruto = await getUserPermissionsInTenant(p.userId, p.tenantId)
      const efetivas = calculateEffectivePermissions(bruto.rolePermissions, bruto.overrides)

      if (!efetivas.includes('messages:send')) {
        erro(
          AREA,
          `${p.email}: sócio aprovado sem messages:send — cargo 'member' não foi concedido na aprovação`,
        )
      }

      const vazadas = efetivas.filter((e) => PERMISSOES_DE_LIDERANCA.includes(e))
      if (vazadas.length === 0) {
        ok(AREA, `${p.email}: pacote de sócio, sem liderança`)
        continue
      }

      // Quem tem liderança precisa ter um cargo que a conceda — o seed promove
      // um sócio por tenant a admin de propósito.
      const cargos: { role: { nome: string; isSystem: boolean } }[] = await db.userRole.findMany({
        where: { userId: p.userId, tenantId: p.tenantId },
        select: { role: { select: { nome: true, isSystem: true } } },
      })
      const temCargoDeLideranca = cargos.some(
        (c) => c.role.isSystem && ['owner', 'admin', 'vice'].includes(c.role.nome),
      )
      const temCargoDepartamento = cargos.some((c) => !c.role.isSystem)
      if (!temCargoDeLideranca && !temCargoDepartamento) {
        erro(
          AREA,
          `${p.email} tem ${vazadas.join(', ')} sem nenhum cargo que conceda — permissão órfã`,
        )
      } else {
        ok(
          AREA,
          `${p.email}: liderança justificada por cargo (${cargos.map((c) => c.role.nome).join(', ')})`,
        )
      }
    }
  })
})

describe('C4) permissão não atravessa a fronteira do tenant', () => {
  it('ninguém do lote tem permissão em torcida onde não tem vínculo aprovado', async () => {
    const AREA = 'jornada/permissao-cross-tenant'
    const { calculateEffectivePermissions } = await import('@torcida/types')
    const { getUserPermissionsInTenant } = await import('@/lib/tenant')

    const outrosTenants: { id: string; slug: string }[] = await db.tenant.findMany({
      where: { ativo: true, sintetico: false, membros: { some: {} } },
      select: { id: true, slug: true },
      take: 25,
    })

    for (const p of pessoas) {
      const aprovados: { tenantId: string }[] = await db.saasMembro.findMany({
        where: { userId: p.userId, status: 'APROVADO', desligadoEm: null },
        select: { tenantId: true },
      })
      const comVinculo = new Set(aprovados.map((a) => a.tenantId))

      let vazamentos = 0
      for (const t of outrosTenants) {
        if (comVinculo.has(t.id)) continue
        const bruto = await getUserPermissionsInTenant(p.userId, t.id)
        const efetivas = calculateEffectivePermissions(bruto.rolePermissions, bruto.overrides)
        if (efetivas.length > 0) {
          vazamentos += 1
          erro(
            AREA,
            `${p.email} tem ${efetivas.join(', ')} em ${t.slug} sem vínculo aprovado lá`,
          )
        }
      }
      if (vazamentos === 0) {
        ok(AREA, `${p.email}: sem permissão fora das ${comVinculo.size} torcida(s) do vínculo`)
      }
    }
  })
})

describe('C5) contexto de comunidade não abre aba indevida', () => {
  it('só sócio aprovado vê a aba da torcida', async () => {
    const AREA = 'jornada/contexto-comunidade'
    const { resolverContextoComunidade, resolverEscopoComunidade } = await import(
      '@/lib/comunidade-contexto'
    )

    for (const p of pessoas) {
      const esperado = ESPERADO_POR_FLUXO[p.fluxo]?.[p.desfecho]
      if (!esperado) continue

      const ctx = await resolverContextoComunidade(p.userId, p.email)
      if (!ctx) {
        // PerfilTorcedor incompleto: os fluxos do lote sempre concluem o
        // onboarding, então isso é sintoma, não estado de repouso.
        alerta(AREA, `${p.email}: resolverContextoComunidade devolveu null`)
        continue
      }

      if (ctx.escopos.torcida && !esperado.veMuralSocios) {
        erro(
          AREA,
          `${p.email} (${p.fluxo}/${p.desfecho}): escopos.torcida=true — aba da organizada vazou`,
        )
        continue
      }

      // Forçar `?escopo=torcida` na URL não pode furar o gate.
      const forcado = resolverEscopoComunidade(ctx, 'torcida')
      if (forcado === 'torcida' && !esperado.veMuralSocios) {
        erro(AREA, `${p.email}: ?escopo=torcida furou o gate na query string`)
      } else {
        ok(AREA, `${p.email}: contexto "${ctx.modo}", escopo forçado resolveu "${forcado}"`)
      }
    }
  })
})
