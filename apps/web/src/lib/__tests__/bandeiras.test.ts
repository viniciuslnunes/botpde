import { describe, expect, it } from 'vitest'
import {
  CATEGORIA_BANDEIRA,
  gravarVistoriaBandeira,
  lerVistoriaBandeira,
  PERMISSIONS,
  podeGerirCategoriaPatrimonio,
  podeVerCategoriaPatrimonio,
  resolverEscopoPatrimonio,
  vistoriaVencendo,
  VistoriaBandeiraSchema,
} from '@torcida/types'
import { DEPARTAMENTOS_CANONICOS } from '../../../../../packages/db/src/departamentos-canonicos.js'

const bandeiras = DEPARTAMENTOS_CANONICOS.find((d) => d.nome === 'Bandeiras')!

describe('escopo do acervo: patrimony:* × flags:*', () => {
  it('flags:view enxerga só BANDEIRA — a categoria fica travada na query', () => {
    const escopo = resolverEscopoPatrimonio([PERMISSIONS.FLAGS_VIEW])
    expect(escopo.podeVer).toBe(true)
    expect(escopo.podeVerTudo).toBe(false)
    expect(escopo.categoriaTravada).toBe(CATEGORIA_BANDEIRA)
    expect(escopo.podeGerir).toBe(false)
  })

  it('patrimony:view enxerga o inventário inteiro, sem trava', () => {
    const escopo = resolverEscopoPatrimonio([PERMISSIONS.PATRIMONY_VIEW])
    expect(escopo.podeVerTudo).toBe(true)
    expect(escopo.categoriaTravada).toBeNull()
    expect(escopo.podeGerir).toBe(false)
  })

  it('patrimony:manage gere bandeira também; flags:manage NÃO gere o resto', () => {
    expect(podeGerirCategoriaPatrimonio([PERMISSIONS.PATRIMONY_MANAGE], 'BANDEIRA')).toBe(true)
    expect(podeGerirCategoriaPatrimonio([PERMISSIONS.PATRIMONY_MANAGE], 'MOBILIARIO')).toBe(true)

    expect(podeGerirCategoriaPatrimonio([PERMISSIONS.FLAGS_MANAGE], 'BANDEIRA')).toBe(true)
    for (const fora of ['MOBILIARIO', 'ELETRONICO', 'INSTRUMENTO', 'ESPACO', 'UNIFORME', 'OUTROS']) {
      expect(podeGerirCategoriaPatrimonio([PERMISSIONS.FLAGS_MANAGE], fora), fora).toBe(false)
    }
  })

  it('flags:manage não vaza leitura do inventário geral', () => {
    expect(podeVerCategoriaPatrimonio([PERMISSIONS.FLAGS_MANAGE], 'BANDEIRA')).toBe(true)
    expect(podeVerCategoriaPatrimonio([PERMISSIONS.FLAGS_MANAGE], 'ELETRONICO')).toBe(false)
    // ...mas quem vê o inventário inteiro continua vendo bandeira.
    expect(podeVerCategoriaPatrimonio([PERMISSIONS.PATRIMONY_VIEW], 'BANDEIRA')).toBe(true)
  })

  it('sem nenhuma das quatro permissões, não vê nem gere', () => {
    const escopo = resolverEscopoPatrimonio([PERMISSIONS.COMMUNITY_POST])
    expect(escopo.podeVer).toBe(false)
    expect(escopo.podeGerir).toBe(false)
    expect(podeVerCategoriaPatrimonio([], 'BANDEIRA')).toBe(false)
    expect(podeGerirCategoriaPatrimonio([], 'BANDEIRA')).toBe(false)
  })
})

describe('pacote canônico do departamento de Bandeiras', () => {
  it('colaborador vê só o acervo de bandeiras — nunca o inventário geral', () => {
    expect(bandeiras.permissions).toContain(PERMISSIONS.FLAGS_VIEW)
    expect(bandeiras.permissions).not.toContain(PERMISSIONS.PATRIMONY_VIEW)
    expect(bandeiras.permissions).not.toContain(PERMISSIONS.PATRIMONY_MANAGE)
    expect(bandeiras.permissions).not.toContain(PERMISSIONS.FLAGS_MANAGE)
  })

  it('gestor escreve em bandeira, lê o patrimônio, e não vira mini-admin', () => {
    expect(bandeiras.permissionsGestor).toContain(PERMISSIONS.FLAGS_MANAGE)
    expect(bandeiras.permissionsGestor).toContain(PERMISSIONS.PATRIMONY_VIEW)
    expect(bandeiras.permissionsGestor).not.toContain(PERMISSIONS.PATRIMONY_MANAGE)
    expect(bandeiras.permissionsGestor).not.toContain(PERMISSIONS.FINANCE_MANAGE)
    expect(bandeiras.permissionsGestor).not.toContain(PERMISSIONS.STORE_MANAGE)
    expect(bandeiras.permissionsGestor).not.toContain(PERMISSIONS.SEDES_MANAGE)
  })
})

describe('ficha de vistoria (meta.vistoria)', () => {
  const base = { larguraM: 12, alturaM: 8, comMastro: '1', validade: '2027-01-31' }

  it('grava sem apagar o resto do meta', () => {
    const vistoria = VistoriaBandeiraSchema.parse(base)
    const meta = gravarVistoriaBandeira({ outraCoisa: 1 }, vistoria)
    expect(meta.outraCoisa).toBe(1)
    expect(lerVistoriaBandeira(meta)?.larguraM).toBe(12)
  })

  it('meta inválido ou ausente devolve null em vez de estourar', () => {
    expect(lerVistoriaBandeira(null)).toBeNull()
    expect(lerVistoriaBandeira({})).toBeNull()
    expect(lerVistoriaBandeira({ vistoria: 'texto solto' })).toBeNull()
    expect(lerVistoriaBandeira({ vistoria: { larguraM: -1, alturaM: 2 } })).toBeNull()
  })

  it('checkbox de FormData: ausente é false, "on" é true', () => {
    expect(VistoriaBandeiraSchema.parse({ larguraM: 3, alturaM: 2 }).comMastro).toBe(false)
    expect(
      VistoriaBandeiraSchema.parse({ larguraM: 3, alturaM: 2, comMastro: 'on' }).comMastro,
    ).toBe(true)
  })

  it('sem validade declarada não alarma; vencida e a vencer alarmam', () => {
    const ref = new Date('2026-08-06T12:00:00Z')
    expect(vistoriaVencendo({ validade: undefined }, { ref })).toBe(false)
    expect(vistoriaVencendo(null, { ref })).toBe(false)
    expect(vistoriaVencendo({ validade: '2026-08-01' }, { ref })).toBe(true)
    expect(vistoriaVencendo({ validade: '2026-08-20' }, { ref })).toBe(false)
    expect(vistoriaVencendo({ validade: '2026-08-20' }, { ref, diasAviso: 30 })).toBe(true)
  })
})
