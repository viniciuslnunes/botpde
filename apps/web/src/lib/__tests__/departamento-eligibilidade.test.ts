import { describe, expect, it } from 'vitest'
import { isMembroElegivelDepartamento, PAPEL_DEPARTAMENTO } from '@torcida/types'
import { syncMembershipFromRoles } from '../../../../../packages/db/src/departamentos-canonicos.js'

type MembroFake = {
  tenantId: string
  tipo: string
  status: string
  desligadoEm: Date | null
  espelhado: boolean
  membroOrigemId: string | null
}

const socioElegivel: MembroFake = {
  tenantId: 'tenant-1',
  tipo: 'SOCIO',
  status: 'APROVADO',
  desligadoEm: null,
  espelhado: false,
  membroOrigemId: null,
}

describe('elegibilidade departamental', () => {
  it('aceita sócio aprovado, ativo e canônico no tenant', () => {
    expect(isMembroElegivelDepartamento(socioElegivel, 'tenant-1')).toBe(true)
  })

  it('recusa torcedor mesmo aprovado', () => {
    expect(
      isMembroElegivelDepartamento({ ...socioElegivel, tipo: 'TORCEDOR' }, 'tenant-1'),
    ).toBe(false)
  })

  it.each([null, undefined])('recusa ausência de SaasMembro (%s)', (membro) => {
    expect(isMembroElegivelDepartamento(membro, 'tenant-1')).toBe(false)
  })

  it.each([
    { caso: 'não aprovado', membro: { ...socioElegivel, status: 'PENDENTE' } },
    { caso: 'reprovado', membro: { ...socioElegivel, status: 'REPROVADO' } },
    { caso: 'desligado', membro: { ...socioElegivel, desligadoEm: new Date() } },
    { caso: 'espelhado', membro: { ...socioElegivel, espelhado: true } },
    {
      caso: 'com origem espelhada',
      membro: { ...socioElegivel, membroOrigemId: 'origem-1' },
    },
    { caso: 'de outro tenant', membro: socioElegivel, tenantId: 'tenant-2' },
  ])('recusa vínculo $caso', ({ membro, tenantId = 'tenant-1' }) => {
    expect(isMembroElegivelDepartamento(membro, tenantId)).toBe(false)
  })
})

// ── Projeção perfil de área → equipe/gestoria ────────────────────────────
// `syncMembershipFromRoles` é o núcleo transacional usado por
// /admin/acessos e pela aprovação de membro. Aqui ele roda contra um cliente
// falso tipado (sem Prisma), para provar a matriz de elegibilidade e a
// remoção das projeções já existentes quando o vínculo deixa de valer.

const TENANT = 'tenant-1'
const USER = 'user-1'
const FINANCEIRO = 'depto-financeiro'
const COMUNICACAO = 'depto-comunicacao'

type PapelArea = 'MEMBRO' | 'GESTOR'
type PerfilFake = { departamentoId: string | null; papelNoDepartamento: PapelArea | null }

type EstadoDepartamental = {
  /** `null` = usuário sem SaasMembro no tenant. */
  membro: MembroFake | null
  /** Perfis (Role) do usuário no tenant, já resolvidos para área + papel. */
  perfis: PerfilFake[]
  /** UserDepartamento existentes (ids de departamento). */
  equipe: string[]
  /** DepartamentoGestor existentes (ids de departamento). */
  gestoria: string[]
}

type ClienteSync = Parameters<typeof syncMembershipFromRoles>[0]

function estadoDe(parcial: Partial<EstadoDepartamental> = {}): EstadoDepartamental {
  return {
    membro: parcial.membro === undefined ? { ...socioElegivel } : parcial.membro,
    perfis: parcial.perfis ?? [],
    equipe: parcial.equipe ?? [],
    gestoria: parcial.gestoria ?? [],
  }
}

/**
 * Cliente falso com a superfície exata que `syncMembershipFromRoles` usa.
 * Registra as escritas para o teste afirmar que nada é materializado quando o
 * membro é inelegível.
 */
function clienteFake(estado: EstadoDepartamental) {
  const escritas: string[] = []
  const modelosLidos: string[] = []

  const cliente = {
    saasMembro: {
      findUnique: async (): Promise<MembroFake | null> => {
        modelosLidos.push('saasMembro')
        return estado.membro
      },
    },
    userRole: {
      // Dois call sites distintos batem em `userRole`: os perfis DO usuário
      // (projeção de área) e a liderança DO tenant (`idsLiderancaTenant`, via
      // canais de departamento). Só o primeiro é gateado por elegibilidade —
      // sem separar, a invariante do torcedor testava a chamada errada.
      findMany: async (
        args: { where?: { userId?: string } } = {},
      ): Promise<{ role: PerfilFake }[] | { userId: string }[]> => {
        if (!args.where?.userId) {
          modelosLidos.push('userRole:lideranca')
          return []
        }
        modelosLidos.push('userRole:perfis')
        return estado.perfis.map((perfil) => ({ role: perfil }))
      },
    },
    user: {
      findMany: async (): Promise<{ id: string }[]> => [],
    },
    userDepartamento: {
      findMany: async (): Promise<{ departamentoId: string }[]> =>
        estado.equipe.map((departamentoId) => ({ departamentoId })),
      create: async ({ data }: { data: { departamentoId: string } }): Promise<void> => {
        estado.equipe.push(data.departamentoId)
        escritas.push(`equipe.criar:${data.departamentoId}`)
      },
      deleteMany: async ({ where }: { where: { departamentoId: string } }): Promise<void> => {
        estado.equipe = estado.equipe.filter((id) => id !== where.departamentoId)
        escritas.push(`equipe.remover:${where.departamentoId}`)
      },
    },
    departamentoGestor: {
      findMany: async (): Promise<{ departamentoId: string }[]> =>
        estado.gestoria.map((departamentoId) => ({ departamentoId })),
      create: async ({ data }: { data: { departamentoId: string } }): Promise<void> => {
        estado.gestoria.push(data.departamentoId)
        escritas.push(`gestoria.criar:${data.departamentoId}`)
      },
      deleteMany: async ({ where }: { where: { departamentoId: string } }): Promise<void> => {
        estado.gestoria = estado.gestoria.filter((id) => id !== where.departamentoId)
        escritas.push(`gestoria.remover:${where.departamentoId}`)
      },
    },
    // Superfície mínima de `syncCanaisDepartamentosDoUsuario` — sem canais no mock.
    departamentoAreaMembro: {
      findMany: async (): Promise<Array<{ areaId: string; area: { departamentoId: string } }>> => [],
    },
    departamentoArea: {
      findMany: async (): Promise<Array<{ id: string; canalConversaId: string | null; departamentoId: string }>> => [],
    },
    departamento: {
      findMany: async (): Promise<Array<{ id: string; canalConversaId: string | null }>> => [],
    },
    membroConversa: {
      upsert: async (): Promise<void> => undefined,
      updateMany: async (): Promise<void> => undefined,
    },
  }

  return { cliente: cliente as unknown as ClienteSync, escritas, modelosLidos }
}

async function sincronizar(estado: EstadoDepartamental) {
  const { cliente, escritas, modelosLidos } = clienteFake(estado)
  await syncMembershipFromRoles(cliente, { userId: USER, tenantId: TENANT })
  // `deleteMany` da gestoria pode repetir (é idempotente no Prisma); o que
  // importa é o conjunto de efeitos, não a contagem de chamadas.
  return { escritas: [...new Set(escritas)], modelosLidos, estado }
}

describe('syncMembershipFromRoles — projeção de perfil de área', () => {
  it('sócio elegível com perfil de membro entra na equipe da área, sem gestoria', async () => {
    const { estado, escritas } = await sincronizar(
      estadoDe({ perfis: [{ departamentoId: FINANCEIRO, papelNoDepartamento: PAPEL_DEPARTAMENTO.MEMBRO }] }),
    )

    expect(estado.equipe).toEqual([FINANCEIRO])
    expect(estado.gestoria).toEqual([])
    expect(escritas).toEqual(['equipe.criar:depto-financeiro'])
  })

  it('sócio elegível com perfil de gestor entra na equipe E na gestoria da área', async () => {
    const { estado } = await sincronizar(
      estadoDe({ perfis: [{ departamentoId: COMUNICACAO, papelNoDepartamento: PAPEL_DEPARTAMENTO.GESTOR }] }),
    )

    expect(estado.equipe).toEqual([COMUNICACAO])
    expect(estado.gestoria).toEqual([COMUNICACAO])
  })

  it('gestor vence membro quando o sócio acumula os dois perfis da mesma área', async () => {
    const { estado } = await sincronizar(
      estadoDe({
        perfis: [
          { departamentoId: FINANCEIRO, papelNoDepartamento: PAPEL_DEPARTAMENTO.MEMBRO },
          { departamentoId: FINANCEIRO, papelNoDepartamento: PAPEL_DEPARTAMENTO.GESTOR },
        ],
      }),
    )

    expect(estado.gestoria).toEqual([FINANCEIRO])
  })

  it('perfil sem departamento (cargo transversal) não projeta nenhuma área', async () => {
    const { estado, escritas } = await sincronizar(
      estadoDe({ perfis: [{ departamentoId: null, papelNoDepartamento: null }] }),
    )

    expect(estado.equipe).toEqual([])
    expect(estado.gestoria).toEqual([])
    expect(escritas).toEqual([])
  })

  it('rebaixar gestor a membro tira a gestoria e mantém a equipe', async () => {
    const { estado, escritas } = await sincronizar(
      estadoDe({
        perfis: [{ departamentoId: FINANCEIRO, papelNoDepartamento: PAPEL_DEPARTAMENTO.MEMBRO }],
        equipe: [FINANCEIRO],
        gestoria: [FINANCEIRO],
      }),
    )

    expect(estado.equipe).toEqual([FINANCEIRO])
    expect(estado.gestoria).toEqual([])
    expect(escritas).toEqual(['gestoria.remover:depto-financeiro'])
  })

  it('retirar o perfil de área remove equipe e gestoria daquela área', async () => {
    const { estado } = await sincronizar(
      estadoDe({ perfis: [], equipe: [FINANCEIRO], gestoria: [FINANCEIRO] }),
    )

    expect(estado.equipe).toEqual([])
    expect(estado.gestoria).toEqual([])
  })

  it('sócio já projetado corretamente não gera escrita nenhuma (idempotente)', async () => {
    const { escritas } = await sincronizar(
      estadoDe({
        perfis: [{ departamentoId: COMUNICACAO, papelNoDepartamento: PAPEL_DEPARTAMENTO.GESTOR }],
        equipe: [COMUNICACAO],
        gestoria: [COMUNICACAO],
      }),
    )

    expect(escritas).toEqual([])
  })

  it('torcedor não materializa área nenhuma, mesmo com perfil de gestor atribuído', async () => {
    const { estado, escritas, modelosLidos } = await sincronizar(
      estadoDe({
        membro: { ...socioElegivel, tipo: 'TORCEDOR' },
        perfis: [{ departamentoId: COMUNICACAO, papelNoDepartamento: PAPEL_DEPARTAMENTO.GESTOR }],
      }),
    )

    expect(estado.equipe).toEqual([])
    expect(estado.gestoria).toEqual([])
    expect(escritas).toEqual([])
    // Inelegível nem chega a ler os perfis: nada pode ser desejado.
    expect(modelosLidos).not.toContain('userRole:perfis')
  })

  it('torcedor com projeções herdadas perde equipe e gestoria na sincronização', async () => {
    const { estado, escritas } = await sincronizar(
      estadoDe({
        membro: { ...socioElegivel, tipo: 'TORCEDOR' },
        perfis: [{ departamentoId: COMUNICACAO, papelNoDepartamento: PAPEL_DEPARTAMENTO.GESTOR }],
        equipe: [COMUNICACAO],
        gestoria: [COMUNICACAO],
      }),
    )

    expect(estado.equipe).toEqual([])
    expect(estado.gestoria).toEqual([])
    expect(escritas).toEqual([
      'equipe.remover:depto-comunicacao',
      'gestoria.remover:depto-comunicacao',
    ])
  })

  it.each([
    { caso: 'membro desligado', membro: { ...socioElegivel, desligadoEm: new Date() } },
    { caso: 'membro pendente', membro: { ...socioElegivel, status: 'PENDENTE' } },
    { caso: 'membro reprovado', membro: { ...socioElegivel, status: 'REPROVADO' } },
    { caso: 'registro espelhado', membro: { ...socioElegivel, espelhado: true } },
    { caso: 'espelho da origem', membro: { ...socioElegivel, membroOrigemId: 'origem-1' } },
    { caso: 'vínculo de outro tenant', membro: { ...socioElegivel, tenantId: 'tenant-2' } },
    { caso: 'sem SaasMembro no tenant', membro: null },
  ])('$caso perde equipe e gestoria e não recebe nada de volta', async ({ membro }) => {
    const { estado, escritas } = await sincronizar(
      estadoDe({
        membro,
        perfis: [{ departamentoId: FINANCEIRO, papelNoDepartamento: PAPEL_DEPARTAMENTO.GESTOR }],
        equipe: [FINANCEIRO],
        gestoria: [FINANCEIRO],
      }),
    )

    expect(estado.equipe).toEqual([])
    expect(estado.gestoria).toEqual([])
    expect(escritas.filter((e) => e.includes('.criar:'))).toEqual([])
  })
})
