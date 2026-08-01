import { beforeEach, describe, expect, it, vi } from 'vitest'

const tenantFindMany = vi.hoisted(() => vi.fn())

vi.mock('@torcida/db', () => ({
  db: { tenant: { findMany: tenantFindMany } },
}))

// `unstable_cache` guarda as linhas cruas; o corte por tempo acontece FORA
// dele — é justamente isso que este teste protege.
vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => unknown) => fn,
  revalidateTag: vi.fn(),
}))

const DIA = 24 * 60 * 60 * 1000

function linha(id: string, prazoEm: Date | null) {
  return {
    id,
    solicitacoesReativacao: prazoEm ? [{ prazoEm }] : [],
  }
}

describe('getTenantsRestritos — expiração derivada na leitura', () => {
  beforeEach(() => {
    tenantFindMany.mockReset()
    vi.resetModules()
  })

  it('mantém restrito o tenant sem solicitação pendente', async () => {
    tenantFindMany.mockResolvedValue([linha('unidade-a', null)])
    const { getTenantsRestritos } = await import('@/lib/isolamento')
    expect([...(await getTenantsRestritos())]).toEqual(['unidade-a'])
  })

  it('mantém restrito enquanto o prazo da solicitação não venceu', async () => {
    tenantFindMany.mockResolvedValue([linha('unidade-a', new Date(Date.now() + 2 * DIA))])
    const { getTenantsRestritos } = await import('@/lib/isolamento')
    expect((await getTenantsRestritos()).has('unidade-a')).toBe(true)
  })

  it('reativa sozinho quando o prazo venceu, mesmo com canalRestrito=true no banco', async () => {
    // Cenário do cron fora do ar: a coluna ainda diz `true`, mas a regra dos
    // 5 dias já se cumpriu — o canal precisa estar aberto na leitura seguinte.
    tenantFindMany.mockResolvedValue([linha('unidade-a', new Date(Date.now() - 1000))])
    const { getTenantsRestritos } = await import('@/lib/isolamento')
    expect((await getTenantsRestritos()).size).toBe(0)
  })

  it('filtra ids preservando o próprio tenant do viewer', async () => {
    tenantFindMany.mockResolvedValue([linha('unidade-a', null), linha('unidade-b', null)])
    const { filtrarTenantsRestritos } = await import('@/lib/isolamento')

    const semManter = await filtrarTenantsRestritos(['sede', 'unidade-a', 'unidade-b'])
    expect(semManter).toEqual(['sede'])

    // A unidade isolada continua enxergando a si mesma.
    const comManter = await filtrarTenantsRestritos(['sede', 'unidade-a'], 'unidade-a')
    expect(comManter).toEqual(['sede', 'unidade-a'])
  })

  it('estadoIsolamentoDoPar informa os dois lados em uma leitura', async () => {
    tenantFindMany.mockResolvedValue([linha('unidade-a', null)])
    const { estadoIsolamentoDoPar } = await import('@/lib/isolamento')

    expect(await estadoIsolamentoDoPar('sede', 'unidade-a')).toEqual({
      atorRestrito: false,
      alvoRestrito: true,
    })
    expect(await estadoIsolamentoDoPar('unidade-a', 'sede')).toEqual({
      atorRestrito: true,
      alvoRestrito: false,
    })
  })

  it('orSomenteComunicadoOficial libera só o comunicado, nunca post comum', async () => {
    const { orSomenteComunicadoOficial } = await import('@/lib/feed')

    expect(orSomenteComunicadoOficial([])).toEqual([])

    const [clausula] = orSomenteComunicadoOficial(['sede'])
    expect(clausula).toMatchObject({
      tenantId: { in: ['sede'] },
      tipo: 'INSTITUCIONAL',
      comunicadoOrigemId: { not: null },
      visibilidade: 'PUBLICO',
      oculto: false,
    })
  })

  it('resolveTenantIdsSomenteComunicado só devolve ancestrais quando há isolamento', async () => {
    tenantFindMany.mockResolvedValue([])
    const { resolveTenantIdsSomenteComunicado } = await import('@/lib/feed')
    // Sem canal restrito não existe exceção: o feed segue as regras normais.
    expect(await resolveTenantIdsSomenteComunicado('unidade-a')).toEqual([])
  })

  it('prazoReativacaoAPartirDe soma exatamente 5 dias', async () => {
    const { PRAZO_REATIVACAO_DIAS, prazoReativacaoAPartirDe } = await import('@/lib/isolamento')
    const inicio = new Date('2026-07-01T12:00:00.000Z')
    expect(PRAZO_REATIVACAO_DIAS).toBe(5)
    expect(prazoReativacaoAPartirDe(inicio).toISOString()).toBe('2026-07-06T12:00:00.000Z')
  })
})
