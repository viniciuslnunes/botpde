import { describe, expect, it } from 'vitest'
import { escolherTenantCarteirinha } from '../associacao-escopo'

const PDE = 'tenant-pde'
const SEDE = 'tenant-sede'
const IRMA = 'tenant-irma'

describe('escolherTenantCarteirinha', () => {
  it('fica no canal atual quando não há sócio na worktree', () => {
    expect(
      escolherTenantCarteirinha({
        tenantAtualId: PDE,
        raizId: SEDE,
        sociosAprovados: [],
      }),
    ).toBe(PDE)
  })

  it('prefere o vínculo local (origem ou espelho na unidade)', () => {
    expect(
      escolherTenantCarteirinha({
        tenantAtualId: PDE,
        raizId: SEDE,
        sociosAprovados: [
          { tenantId: PDE, espelhado: false },
          { tenantId: SEDE, espelhado: true },
        ],
      }),
    ).toBe(PDE)
  })

  it('sócio da Sede vê a carteirinha da torcida em qualquer unidade', () => {
    expect(
      escolherTenantCarteirinha({
        tenantAtualId: PDE,
        raizId: SEDE,
        sociosAprovados: [{ tenantId: SEDE, espelhado: false }],
      }),
    ).toBe(SEDE)
  })

  it('espelho na Sede + origem numa irmã: a carteirinha da torcida é a da Sede', () => {
    expect(
      escolherTenantCarteirinha({
        tenantAtualId: PDE,
        raizId: SEDE,
        sociosAprovados: [
          { tenantId: IRMA, espelhado: false },
          { tenantId: SEDE, espelhado: true },
        ],
      }),
    ).toBe(SEDE)
  })

  it('sem Sede na lista, cai no canônico (não-espelho) da worktree', () => {
    expect(
      escolherTenantCarteirinha({
        tenantAtualId: PDE,
        raizId: SEDE,
        sociosAprovados: [{ tenantId: IRMA, espelhado: false }],
      }),
    ).toBe(IRMA)
  })

  it('na própria Sede o vínculo local ganha', () => {
    expect(
      escolherTenantCarteirinha({
        tenantAtualId: SEDE,
        raizId: SEDE,
        sociosAprovados: [{ tenantId: SEDE, espelhado: false }],
      }),
    ).toBe(SEDE)
  })
})
