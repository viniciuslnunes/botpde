import { describe, expect, it } from 'vitest'
import { PERMISSIONS, PAPEL_DEPARTAMENTO } from '@torcida/types'
import {
  diffAcessoUsuario,
  listaLegivel,
  rotuloPermissao,
  type AcessoDepartamentoLite,
  type AcessoRoleLite,
} from '@/lib/acesso-audit-diff'

const PATRIMONIO: AcessoDepartamentoLite = {
  id: 'depto-patrimonio',
  nome: 'Patrimônio',
  permissions: [PERMISSIONS.PATRIMONY_VIEW],
  permissionsGestor: [PERMISSIONS.PATRIMONY_MANAGE],
}

const RECRUTADOR: AcessoRoleLite = {
  id: 'role-recrutador',
  nome: 'Recrutador',
  isSystem: false,
  permissions: [PERMISSIONS.MEMBERS_VIEW, PERMISSIONS.MEMBERS_APPROVE],
  permissionsExtras: [],
  departamentoId: null,
  papelNoDepartamento: null,
}

const COLABORADOR_PATRIMONIO: AcessoRoleLite = {
  id: 'role-patrimonio-membro',
  nome: 'Patrimônio · colaborador',
  isSystem: false,
  permissions: [],
  permissionsExtras: [],
  departamentoId: PATRIMONIO.id,
  papelNoDepartamento: PAPEL_DEPARTAMENTO.MEMBRO,
}

const GESTOR_PATRIMONIO: AcessoRoleLite = {
  id: 'role-patrimonio-gestor',
  nome: 'Patrimônio · gestor',
  isSystem: false,
  permissions: [],
  permissionsExtras: [],
  departamentoId: PATRIMONIO.id,
  papelNoDepartamento: PAPEL_DEPARTAMENTO.GESTOR,
}

const OWNER: AcessoRoleLite = {
  id: 'role-owner',
  nome: 'owner',
  isSystem: true,
  permissions: ['*'],
  permissionsExtras: [],
  departamentoId: null,
  papelNoDepartamento: null,
}

const ROLES = [RECRUTADOR, COLABORADOR_PATRIMONIO, GESTOR_PATRIMONIO, OWNER]
const DEPTOS = new Map([[PATRIMONIO.id, PATRIMONIO]])

function diff(over: Partial<Parameters<typeof diffAcessoUsuario>[0]> = {}) {
  return diffAcessoUsuario({
    rolesTenant: ROLES,
    deptoById: DEPTOS,
    tipoSede: 'SEDE',
    perfilIdsAntes: new Set(),
    perfilIdsDepois: new Set(),
    overridesAntes: [],
    permissoesDepois: new Set(),
    cobertoDepois: new Set(),
    ...over,
  })
}

describe('diffAcessoUsuario', () => {
  it('não inventa linha quando nada muda', () => {
    expect(
      diff({
        perfilIdsAntes: new Set([RECRUTADOR.id]),
        perfilIdsDepois: new Set([RECRUTADOR.id]),
        permissoesDepois: new Set(RECRUTADOR.permissions),
        cobertoDepois: new Set(RECRUTADOR.permissions),
      }),
    ).toEqual([])
  })

  it('registra cargo concedido com estado anterior', () => {
    const linhas = diff({
      perfilIdsDepois: new Set([RECRUTADOR.id]),
      permissoesDepois: new Set(RECRUTADOR.permissions),
      cobertoDepois: new Set(RECRUTADOR.permissions),
    })
    expect(linhas).toContainEqual({ campo: 'Cargos', de: '—', para: 'Recrutador' })
  })

  it('registra cargo retirado — o histórico precisa mostrar quem perdeu o quê', () => {
    const linhas = diff({
      perfilIdsAntes: new Set([RECRUTADOR.id]),
    })
    expect(linhas).toContainEqual({ campo: 'Cargos', de: 'Recrutador', para: '—' })
  })

  it('traduz cargo de sistema pelo rótulo da unidade, não pelo nome interno', () => {
    const linhas = diff({ perfilIdsDepois: new Set([OWNER.id]) })
    const cargos = linhas.find((l) => l.campo === 'Cargos')
    expect(cargos?.para).not.toBe('owner')
    expect(cargos?.para).toBeTruthy()
  })

  it('deriva a área do perfil de departamento e marca o gestor', () => {
    const linhas = diff({
      perfilIdsAntes: new Set([COLABORADOR_PATRIMONIO.id]),
      perfilIdsDepois: new Set([GESTOR_PATRIMONIO.id]),
    })
    expect(linhas).toContainEqual({
      campo: 'Áreas',
      de: 'Patrimônio',
      para: 'Patrimônio · gestor',
    })
  })

  it('conta como adicional só o que o cargo não cobre', () => {
    const linhas = diff({
      perfilIdsAntes: new Set([RECRUTADOR.id]),
      perfilIdsDepois: new Set([RECRUTADOR.id]),
      // `members:view` já vem do cargo: não é permissão adicional.
      overridesAntes: [{ permission: PERMISSIONS.MEMBERS_VIEW, granted: true }],
      permissoesDepois: new Set([...RECRUTADOR.permissions, PERMISSIONS.FINANCE_VIEW]),
      cobertoDepois: new Set(RECRUTADOR.permissions),
    })
    const adicionais = linhas.find((l) => l.campo === 'Permissões adicionais')
    expect(adicionais?.de).toBe('—')
    expect(adicionais?.para).toBe(rotuloPermissao(PERMISSIONS.FINANCE_VIEW))
  })

  it('registra permissão do cargo revogada na pessoa', () => {
    const linhas = diff({
      perfilIdsAntes: new Set([RECRUTADOR.id]),
      perfilIdsDepois: new Set([RECRUTADOR.id]),
      permissoesDepois: new Set([PERMISSIONS.MEMBERS_VIEW]),
      cobertoDepois: new Set(RECRUTADOR.permissions),
    })
    expect(linhas).toContainEqual({
      campo: 'Permissões revogadas do cargo',
      de: '—',
      para: rotuloPermissao(PERMISSIONS.MEMBERS_APPROVE),
    })
  })
})

describe('listaLegivel', () => {
  it('usa travessão para lista vazia', () => {
    expect(listaLegivel([])).toBe('—')
  })

  it('ordena e trunca listas longas', () => {
    const valores = Array.from({ length: 12 }, (_, i) => `p${String(i).padStart(2, '0')}`)
    expect(listaLegivel(valores, 3)).toBe('p00, p01, p02 +9')
  })
})
