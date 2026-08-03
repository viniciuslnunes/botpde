import { describe, it, expect } from 'vitest'
import {
  estaNaJanela,
  janelaCampanhaDoAno,
  labelStatusProjeto,
  labelTipoProjeto,
  progressoMeta,
  saudeOrcamento,
  slugCampanhaDoAno,
  slugifyProjeto,
  statusInicialCampanhaDoAno,
  STATUS_PROJETO_ABERTOS,
  tituloCampanhaDoAno,
} from '@torcida/types'

describe('progressoMeta', () => {
  it('sem meta declarada devolve null — 0% leria como fracasso', () => {
    expect(progressoMeta(0, null)).toBeNull()
    expect(progressoMeta(120, 0)).toBeNull()
    expect(progressoMeta(120, undefined)).toBeNull()
  })

  it('calcula percentual e satura em 100', () => {
    expect(progressoMeta(2500, 10000)).toBe(25)
    expect(progressoMeta(10000, 10000)).toBe(100)
    expect(progressoMeta(12000, 10000)).toBe(100)
  })

  it('realizado ausente conta como zero', () => {
    expect(progressoMeta(null, 200)).toBe(0)
    expect(progressoMeta(-50, 200)).toBe(0)
  })
})

describe('saudeOrcamento', () => {
  it('sem orçamento previsto devolve null — ausência de plano não é estouro', () => {
    expect(saudeOrcamento(500, null)).toBeNull()
    expect(saudeOrcamento(500, 0)).toBeNull()
  })

  it('marca estouro só acima do previsto', () => {
    expect(saudeOrcamento(800, 1000)).toEqual({ percentual: 80, estourou: false })
    expect(saudeOrcamento(1000, 1000)).toEqual({ percentual: 100, estourou: false })
    expect(saudeOrcamento(1250, 1000)).toEqual({ percentual: 125, estourou: true })
  })
})

describe('estaNaJanela', () => {
  const emJunho = new Date(2026, 5, 15)
  const emDezembro = new Date(2026, 11, 20)

  it('projeto contínuo (sem fim) vale de início em diante', () => {
    const p = { inicio: new Date(2025, 0, 1), fim: null, recorrenteAnual: false }
    expect(estaNaJanela(p, emJunho)).toBe(true)
  })

  it('projeto datado respeita começo e fim', () => {
    const p = { inicio: new Date(2026, 4, 1), fim: new Date(2026, 6, 31), recorrenteAnual: false }
    expect(estaNaJanela(p, emJunho)).toBe(true)
    expect(estaNaJanela(p, emDezembro)).toBe(false)
  })

  it('campanha recorrente compara dia/mês — o registro de 2025 marca a janela de 2026', () => {
    // Campanha do Agasalho: 01/05 a 31/07, cadastrada em 2025.
    const agasalho = {
      inicio: new Date(2025, 4, 1),
      fim: new Date(2025, 6, 31),
      recorrenteAnual: true,
    }
    expect(estaNaJanela(agasalho, emJunho)).toBe(true)
    expect(estaNaJanela(agasalho, emDezembro)).toBe(false)
  })

  it('janela recorrente que vira o ano cobre dezembro e janeiro', () => {
    // Natal solidário: 15/11 a 10/01.
    const natal = {
      inicio: new Date(2025, 10, 15),
      fim: new Date(2026, 0, 10),
      recorrenteAnual: true,
    }
    expect(estaNaJanela(natal, emDezembro)).toBe(true)
    expect(estaNaJanela(natal, new Date(2026, 0, 5))).toBe(true)
    expect(estaNaJanela(natal, emJunho)).toBe(false)
  })
})

describe('rótulos e slug', () => {
  it('rotula tipo e status conhecidos, com fallback seguro', () => {
    expect(labelTipoProjeto('CAMPANHA')).toBe('Campanha')
    expect(labelStatusProjeto('ATIVO')).toBe('Em andamento')
    expect(labelTipoProjeto('INEXISTENTE')).toBe('Projeto')
    expect(labelStatusProjeto(null)).toBe('Planejado')
  })

  it('slug de projeto normaliza acento e espaço', () => {
    expect(slugifyProjeto('Campanha do Agasalho')).toBe('campanha-do-agasalho')
    expect(slugifyProjeto('Festa das Crianças')).toBe('festa-das-criancas')
  })

  it('status abertos são os que ainda pedem atenção', () => {
    expect([...STATUS_PROJETO_ABERTOS]).toEqual(['PLANEJADO', 'ATIVO'])
  })

  it('campanha do ano: título, slug, janela e status', () => {
    expect(tituloCampanhaDoAno('Campanha do Agasalho', 2026)).toBe(
      'Campanha do Agasalho 2026',
    )
    expect(slugCampanhaDoAno('campanha-do-agasalho', 2026)).toBe(
      'campanha-do-agasalho-2026',
    )
    const { inicio, fim } = janelaCampanhaDoAno(2026)
    expect(inicio.getFullYear()).toBe(2026)
    expect(inicio.getMonth()).toBe(0)
    expect(inicio.getDate()).toBe(1)
    expect(fim.getMonth()).toBe(11)
    expect(fim.getDate()).toBe(31)
    expect(statusInicialCampanhaDoAno(2026, new Date(2026, 5, 1))).toBe('ATIVO')
    expect(statusInicialCampanhaDoAno(2027, new Date(2026, 5, 1))).toBe('PLANEJADO')
  })
})
