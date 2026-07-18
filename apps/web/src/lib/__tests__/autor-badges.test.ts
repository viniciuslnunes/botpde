import { describe, expect, it } from 'vitest'
import {
  escolherCargoPrincipal,
  formatAutorCargoBadge,
  resolverDepartamentoBadge,
  rotuloCargoBadge,
} from '@/lib/autor-badges'

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
    expect(formatAutorCargoBadge('owner', null)).toBe('owner')
    expect(formatAutorCargoBadge(null, 'Design')).toBe('Design')
    expect(formatAutorCargoBadge(null, null)).toBeNull()
  })
})
