import { describe, expect, it } from 'vitest'
import {
  escolherCargoPrincipal,
  formatAutorCargoBadge,
  resolverDepartamentoBadge,
  rotuloCargoBadge,
} from '@/lib/autor-badges'
import { formatAutorUnidadeBadge } from '@/lib/autor-badges-format'

describe('autor-badges', () => {
  it('escolhe owner acima de perfis de área e member', () => {
    const principal = escolherCargoPrincipal([
      { nome: 'member', isSystem: true, ordem: 2, departamentoNome: null },
      { nome: 'Membro · Design', isSystem: false, ordem: 10, departamentoNome: 'Design' },
      { nome: 'owner', isSystem: true, ordem: 0, departamentoNome: 'Diretoria' },
    ])
    expect(principal?.nome).toBe('owner')
  })

  it('rotula cargo de sistema em PT-BR conforme o tipo da sede', () => {
    expect(
      rotuloCargoBadge(
        { nome: 'owner', isSystem: true, ordem: 0, departamentoNome: 'Diretoria' },
        'SEDE',
      ),
    ).toBe('Presidente')
    expect(
      rotuloCargoBadge(
        { nome: 'owner', isSystem: true, ordem: 0, departamentoNome: 'Diretoria' },
        'SUBSEDE',
      ),
    ).toBe('Liderança')
    expect(
      rotuloCargoBadge(
        { nome: 'Membro · Design', isSystem: false, ordem: 10, departamentoNome: 'Design' },
        'SEDE',
      ),
    ).toBe('Membro · Design')
  })

  it('só chama de "Membro" quem compõe departamento — sem área é "Sócio"', () => {
    const member = { nome: 'member', isSystem: true, ordem: 9, departamentoNome: null }
    expect(rotuloCargoBadge(member, 'SEDE')).toBe('Sócio')
    expect(rotuloCargoBadge(member, 'SEDE', { temDepartamento: false })).toBe('Sócio')
    expect(rotuloCargoBadge(member, 'SEDE', { temDepartamento: true })).toBe('Membro')
    expect(rotuloCargoBadge(member, 'PONTO_ENCONTRO', { temDepartamento: true })).toBe('Membro')
    // Cargos acima de member não mudam sem área.
    expect(
      rotuloCargoBadge({ nome: 'owner', isSystem: true, ordem: 0, departamentoNome: null }, 'SEDE'),
    ).toBe('Presidente')
  })

  it('prioriza membership real sobre preferência do cadastro', () => {
    expect(
      resolverDepartamentoBadge({
        memberships: ['Diretoria', 'Design'],
        roleDepartamento: 'Diretoria',
        preferencia: 'Comunicação',
      }),
    ).toBe('Diretoria · Design')
    expect(
      resolverDepartamentoBadge({
        memberships: [],
        roleDepartamento: 'Diretoria',
        preferencia: 'Comunicação',
      }),
    ).toBe('Diretoria')
    expect(
      resolverDepartamentoBadge({
        memberships: [],
        roleDepartamento: null,
        preferencia: 'Comunicação',
      }),
    ).toBe('Comunicação')
  })

  it('combina cargo e departamento sem duplicar área já no nome do perfil', () => {
    expect(formatAutorCargoBadge('Presidente', 'Diretoria')).toBe('Presidente · Diretoria')
    expect(formatAutorCargoBadge('Membro · Design', 'Design')).toBe('Membro · Design')
    expect(formatAutorCargoBadge('Torcedor', null)).toBe('Torcedor')
    expect(formatAutorCargoBadge('owner', null)).toBe('owner')
    expect(formatAutorCargoBadge(null, 'Design')).toBe('Design')
    expect(formatAutorCargoBadge(null, null)).toBeNull()
  })

  it('não repete a unidade quando ela é a própria torcida do post', () => {
    // Unidade promovida a tenant próprio (Caso B): tenant e sede têm o mesmo nome.
    expect(
      formatAutorUnidadeBadge('PDE FIEL BAIXADA - PRAIA GRANDE', 'PDE FIEL BAIXADA - PRAIA GRANDE'),
    ).toBeNull()
    // Sede raiz criada a partir do nome da torcida.
    expect(formatAutorUnidadeBadge('Sede — Camisa 12', 'CAMISA 12')).toBeNull()
  })

  it('mantém a unidade quando ela acrescenta origem', () => {
    expect(formatAutorUnidadeBadge('PDE Praia Grande', 'GAVIÕES DA FIEL')).toBe('PDE Praia Grande')
    expect(formatAutorUnidadeBadge(null, 'GAVIÕES DA FIEL')).toBeNull()
    expect(formatAutorUnidadeBadge('   ', 'GAVIÕES DA FIEL')).toBeNull()
  })
})
