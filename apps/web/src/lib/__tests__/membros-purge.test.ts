import { describe, expect, it, vi } from 'vitest'

// A regra testada é pura; o `db` só é importado pelo módulo.
vi.mock('@torcida/db', () => ({ db: {}, Prisma: {} }))

import { motivoImpedeApagar, type MembroParaPurge } from '@/lib/membros-purge'

const base: MembroParaPurge = {
  id: 'm1',
  tenantId: 't1',
  userId: 'u1',
  nome: 'Fulano',
  tipo: 'SOCIO',
  status: 'APROVADO',
  espelhado: false,
  desligadoEm: null,
  numeroAssociado: '42',
}

/**
 * Esta regra é o contrato que impede o super-admin de virar atalho: as duas
 * portas (Server Action com `members:purge` e rota da plataforma) chamam a
 * mesma função antes de apagar.
 */
describe('motivoImpedeApagar — só sai de vez quem já saiu da operação', () => {
  it('cadastro APROVADO ativo não pode ser apagado', () => {
    expect(motivoImpedeApagar(base)).toContain('reprovados ou desligados')
  })

  it('PENDENTE na fila não pode ser apagado', () => {
    expect(motivoImpedeApagar({ ...base, status: 'PENDENTE' })).toContain(
      'reprovados ou desligados',
    )
  })

  it('REPROVADO pode', () => {
    expect(motivoImpedeApagar({ ...base, status: 'REPROVADO' })).toBeNull()
  })

  it('desligado pode, mesmo tendo sido aprovado antes', () => {
    expect(
      motivoImpedeApagar({ ...base, desligadoEm: new Date('2026-02-01') }),
    ).toBeNull()
  })

  it('espelho da Sede é barrado — apaga-se na unidade de origem', () => {
    const espelho = { ...base, status: 'REPROVADO', espelhado: true }
    expect(motivoImpedeApagar(espelho)).toContain('espelho')
  })
})
