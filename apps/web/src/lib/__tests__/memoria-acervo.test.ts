import { describe, expect, it } from 'vitest'
import {
  diasParalelosNesteDia,
  montarParalelos,
  normalizarTermoBuscaMemoria,
  resumoParalelo,
  sugerirConviteDia,
} from '@/lib/memoria-acervo'
import type { MemoriaDiaDetalhe } from '@/lib/memoria-dia'

describe('diasParalelosNesteDia', () => {
  it('retorna 16/08 dos anos anteriores dentro do teto', () => {
    const dias = diasParalelosNesteDia('2026-08-16', '2026-08-16')
    expect(dias).toContain('2025-08-16')
    expect(dias).toContain('2024-08-16')
    expect(dias).not.toContain('2026-08-16')
  })

  it('ignora 29/02 quando o ano alvo não tem', () => {
    const dias = diasParalelosNesteDia('2024-02-29', '2026-03-01')
    expect(dias).not.toContain('2023-02-29')
  })
})

describe('sugerirConviteDia', () => {
  const base: MemoriaDiaDetalhe = {
    dia: '2026-08-16',
    partida: null,
    eventos: [],
    posts: [],
    fotos: [],
    marco: null,
  }

  it('convida após jogo sem publicação', () => {
    const convite = sugerirConviteDia(
      {
        ...base,
        partida: {
          id: 'p1',
          adversario: 'Palmeiras',
          competicao: null,
          mando: 'CASA',
          hora: '16:00',
          status: 'ENCERRADA',
          placarCasa: 2,
          placarFora: 1,
        },
      },
      '2026-08-16',
      true,
    )
    expect(convite?.titulo).toMatch(/jogo/i)
  })

  it('não convida sem permissão', () => {
    expect(sugerirConviteDia(base, '2026-08-16', false)).toBeNull()
  })
})

describe('montarParalelos', () => {
  it('marca dias sem conteúdo', () => {
    const out = montarParalelos('2026-08-16', ['2025-08-16'], {})
    expect(out[0]?.temConteudo).toBe(false)
  })
})

describe('resumoParalelo', () => {
  it('resume jogo com placar', () => {
    const s = resumoParalelo({
      dia: '2025-08-16',
      partida: {
        id: 'p',
        adversario: 'Santos',
        competicao: null,
        mando: 'FORA',
        hora: '19:00',
        status: 'ENCERRADA',
        placarCasa: 1,
        placarFora: 0,
      },
      eventos: [],
      posts: [],
      fotos: [],
      marco: null,
    })
    expect(s).toContain('Santos')
    expect(s).toContain('1–0')
  })
})

describe('normalizarTermoBuscaMemoria', () => {
  it('exige ao menos 2 caracteres', () => {
    expect(normalizarTermoBuscaMemoria('a')).toBeNull()
    expect(normalizarTermoBuscaMemoria('churrasco')).toBe('churrasco')
  })
})
