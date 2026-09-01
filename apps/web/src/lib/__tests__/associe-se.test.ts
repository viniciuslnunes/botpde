import { describe, expect, it } from 'vitest'
import {
  avaliarAssociacaoNaTorcida,
  avaliarVinculoUnidade,
  avaliarTravaVinculoUnidade,
  decidirFlagsVinculoUnidade,
  CARENCIA_CORRECAO_VINCULO_UNIDADE_MS,
  TRAVA_VINCULO_UNIDADE_MS,
  estadoCtaAssocieSe,
  parseRegiaoOnboarding,
  torcidaElegivelVitrine,
  vinculoContaComoAssociacao,
  jaVinculadoNestaUnidade,
  temVinculoUnidadeLocal,
  mensagemTravaVinculoUnidade,
  MENSAGEM_BLOQUEIO_ASSOCIACAO,
  mensagemSemLiderancaUnidade,
} from '@torcida/types/associe-se'

const base = {
  raizId: 'gavioes',
  tipo: 'SOCIO' as const,
  status: 'APROVADO' as const,
  espelhado: false,
  desligadoEm: null,
}

describe('vinculoContaComoAssociacao', () => {
  it('ignora espelho, desligado e reprovado', () => {
    expect(vinculoContaComoAssociacao({ ...base, espelhado: true })).toBe(false)
    expect(vinculoContaComoAssociacao({ ...base, desligadoEm: new Date() })).toBe(false)
    expect(vinculoContaComoAssociacao({ ...base, status: 'REPROVADO' })).toBe(false)
  })

  it('conta sócio/torcedor aprovado ou pendente', () => {
    expect(vinculoContaComoAssociacao(base)).toBe(true)
    expect(vinculoContaComoAssociacao({ ...base, tipo: 'TORCEDOR' })).toBe(true)
    expect(vinculoContaComoAssociacao({ ...base, status: 'PENDENTE' })).toBe(true)
  })
})

describe('torcidaElegivelVitrine', () => {
  it('exige portal ativo, não sintético, com presidente e sem canal restrito', () => {
    expect(
      torcidaElegivelVitrine({
        ativo: true,
        sintetico: false,
        temLideranca: true,
        canalRestrito: false,
      }),
    ).toBe(true)
    expect(
      torcidaElegivelVitrine({
        ativo: true,
        sintetico: false,
        temLideranca: false,
        canalRestrito: false,
      }),
    ).toBe(false)
    expect(
      torcidaElegivelVitrine({
        ativo: true,
        sintetico: false,
        temLideranca: true,
        canalRestrito: true,
      }),
    ).toBe(false)
  })
})

describe('avaliarAssociacaoNaTorcida', () => {
  it('libera quem ainda não tem torcida', () => {
    expect(avaliarAssociacaoNaTorcida('gavioes', [])).toEqual({ ok: true })
  })

  it('bloqueia segunda torcida', () => {
    expect(avaliarAssociacaoNaTorcida('camisa-12', [base])).toEqual({
      ok: false,
      motivo: 'outra_torcida',
    })
  })

  it('bloqueia quem já é sócio da mesma', () => {
    expect(avaliarAssociacaoNaTorcida('gavioes', [base])).toEqual({
      ok: false,
      motivo: 'ja_socio',
    })
  })

  it('bloqueia solicitação duplicada pendente', () => {
    expect(
      avaliarAssociacaoNaTorcida('gavioes', [{ ...base, status: 'PENDENTE' }]),
    ).toEqual({ ok: false, motivo: 'pendente' })
  })

  it('permite upgrade torcedor → sócio na mesma worktree', () => {
    expect(
      avaliarAssociacaoNaTorcida('gavioes', [{ ...base, tipo: 'TORCEDOR' }]),
    ).toEqual({ ok: true, upgrade: true })
  })

  it('não deixa o torcedor de A associar em B', () => {
    expect(
      avaliarAssociacaoNaTorcida('camisa-12', [{ ...base, tipo: 'TORCEDOR' }]),
    ).toEqual({ ok: false, motivo: 'outra_torcida' })
  })
})

describe('estadoCtaAssocieSe', () => {
  it('descobrir sem vínculo, oculto se já sócio', () => {
    expect(estadoCtaAssocieSe([])).toEqual({
      mostrar: true,
      modo: 'descobrir',
      raizId: null,
    })
    expect(estadoCtaAssocieSe([base])).toEqual({
      mostrar: false,
      modo: 'oculto',
      raizId: 'gavioes',
    })
  })

  it('pendente e upgrade', () => {
    expect(estadoCtaAssocieSe([{ ...base, status: 'PENDENTE' }])).toEqual({
      mostrar: true,
      modo: 'pendente',
      raizId: 'gavioes',
    })
    expect(estadoCtaAssocieSe([{ ...base, tipo: 'TORCEDOR' }])).toEqual({
      mostrar: true,
      modo: 'upgrade',
      raizId: 'gavioes',
    })
  })
})

describe('parseRegiaoOnboarding', () => {
  it('lê cidade e UF do label gravado', () => {
    expect(parseRegiaoOnboarding('São Paulo - SP')).toEqual({
      cidade: 'São Paulo',
      uf: 'SP',
    })
    expect(parseRegiaoOnboarding('SP')).toEqual({ cidade: '', uf: 'SP' })
    expect(parseRegiaoOnboarding(null)).toEqual({ cidade: '', uf: '' })
  })
})

describe('MENSAGEM_BLOQUEIO_ASSOCIACAO', () => {
  it('explica associação só no clube do onboarding', () => {
    expect(MENSAGEM_BLOQUEIO_ASSOCIACAO.clube_errado).toMatch(/clube/i)
  })
})

describe('mensagemSemLiderancaUnidade', () => {
  it('sede usa o aviso da torcida; unidade fala da própria liderança', () => {
    expect(mensagemSemLiderancaUnidade('SEDE')).toBe(
      MENSAGEM_BLOQUEIO_ASSOCIACAO.sem_lideranca,
    )
    expect(mensagemSemLiderancaUnidade('SUBSEDE')).toMatch(/subsede está sem liderança/i)
    expect(mensagemSemLiderancaUnidade('PONTO_ENCONTRO')).toMatch(
      /ponto de encontro está sem liderança/i,
    )
  })
})

describe('avaliarVinculoUnidade', () => {
  const okBase = {
    isSocioAprovadoWorktree: true,
    mesmaWorktree: true,
    canalRestrito: false,
    bloqueado: false,
    tipoUnidade: 'PONTO_ENCONTRO' as const,
    jaVinculadoNestaUnidade: false,
  }

  it('libera sócio aprovado da worktree numa unidade local', () => {
    expect(avaliarVinculoUnidade(okBase)).toEqual({ ok: true })
    expect(avaliarVinculoUnidade({ ...okBase, tipoUnidade: 'SUBSEDE' })).toEqual({ ok: true })
  })

  it('barra torcedor, Sede raiz, canal restrito e já vinculado', () => {
    expect(avaliarVinculoUnidade({ ...okBase, isSocioAprovadoWorktree: false })).toEqual({
      ok: false,
      motivo: 'nao_socio',
    })
    expect(avaliarVinculoUnidade({ ...okBase, tipoUnidade: 'SEDE' })).toEqual({
      ok: false,
      motivo: 'sede_raiz',
    })
    expect(avaliarVinculoUnidade({ ...okBase, canalRestrito: true })).toEqual({
      ok: false,
      motivo: 'canal_restrito',
    })
    expect(avaliarVinculoUnidade({ ...okBase, jaVinculadoNestaUnidade: true })).toEqual({
      ok: false,
      motivo: 'ja_vinculado',
    })
    expect(avaliarVinculoUnidade({ ...okBase, mesmaWorktree: false })).toEqual({
      ok: false,
      motivo: 'outra_torcida',
    })
    expect(avaliarVinculoUnidade({ ...okBase, travaAtiva: true })).toEqual({
      ok: false,
      motivo: 'trava',
    })
  })
})

describe('jaVinculadoNestaUnidade', () => {
  it('Caso A exige sedeId; Caso B basta o tenant da unidade', () => {
    const raiz = 'sede'
    expect(
      jaVinculadoNestaUnidade({
        sedeId: 'pde-a',
        sedeTenantId: raiz,
        raizTenantId: raiz,
        vinculos: [{ tenantId: raiz, sedeId: 'pde-a', espelhado: false }],
      }),
    ).toBe(true)
    expect(
      jaVinculadoNestaUnidade({
        sedeId: 'pde-a',
        sedeTenantId: raiz,
        raizTenantId: raiz,
        vinculos: [{ tenantId: raiz, sedeId: null, espelhado: false }],
      }),
    ).toBe(false)
    expect(
      jaVinculadoNestaUnidade({
        sedeId: 'pde-b',
        sedeTenantId: 'filho',
        raizTenantId: raiz,
        vinculos: [{ tenantId: 'filho', sedeId: 'pde-b', espelhado: false }],
      }),
    ).toBe(true)
    expect(
      jaVinculadoNestaUnidade({
        sedeId: 'pde-b',
        sedeTenantId: 'filho',
        raizTenantId: raiz,
        vinculos: [{ tenantId: raiz, sedeId: null, espelhado: false }],
      }),
    ).toBe(false)
    expect(
      jaVinculadoNestaUnidade({
        sedeId: 'pde-b',
        sedeTenantId: 'filho',
        raizTenantId: raiz,
        vinculos: [{ tenantId: 'filho', sedeId: 'pde-b', espelhado: true }],
      }),
    ).toBe(false)
  })
})

describe('avaliarTravaVinculoUnidade', () => {
  const t0 = Date.parse('2026-09-01T12:00:00.000Z')

  it('primeira vez e janela de 48h ainda permitem correção', () => {
    expect(avaliarTravaVinculoUnidade(null, t0)).toEqual({ ok: true })
    expect(avaliarTravaVinculoUnidade(t0, t0 + 2 * 60 * 60 * 1000)).toEqual({
      ok: true,
      emCorrecao: true,
    })
    expect(avaliarTravaVinculoUnidade(t0, t0 + CARENCIA_CORRECAO_VINCULO_UNIDADE_MS)).toEqual({
      ok: true,
      emCorrecao: true,
    })
  })

  it('depois da carência trava até 30 dias da última mudança', () => {
    const t3d = t0 + 3 * 24 * 60 * 60 * 1000
    const locked = avaliarTravaVinculoUnidade(t0, t3d)
    expect(locked.ok).toBe(false)
    if (!locked.ok) {
      expect(locked.motivo).toBe('trava')
      expect(locked.liberaEm.getTime()).toBe(t0 + TRAVA_VINCULO_UNIDADE_MS)
    }
    expect(avaliarTravaVinculoUnidade(t0, t0 + TRAVA_VINCULO_UNIDADE_MS)).toEqual({ ok: true })
    expect(mensagemTravaVinculoUnidade(new Date(t0 + TRAVA_VINCULO_UNIDADE_MS))).toMatch(
      /próxima mudança libera/i,
    )
  })
})

describe('temVinculoUnidadeLocal / decidirFlagsVinculoUnidade', () => {
  const raiz = 'sede'
  const hq = 'sede-hq'

  it('HQ não conta como casa local; PDE e Caso B sim', () => {
    expect(
      temVinculoUnidadeLocal({
        raizTenantId: raiz,
        hqSedeId: hq,
        vinculos: [{ tenantId: raiz, sedeId: hq, espelhado: false }],
      }),
    ).toBe(false)
    expect(
      temVinculoUnidadeLocal({
        raizTenantId: raiz,
        hqSedeId: hq,
        vinculos: [{ tenantId: raiz, sedeId: 'pde-a', espelhado: false }],
      }),
    ).toBe(true)
    expect(
      temVinculoUnidadeLocal({
        raizTenantId: raiz,
        hqSedeId: hq,
        vinculos: [{ tenantId: 'filho', sedeId: 'pde-b', espelhado: false }],
      }),
    ).toBe(true)
    expect(
      temVinculoUnidadeLocal({
        raizTenantId: raiz,
        hqSedeId: hq,
        vinculos: [{ tenantId: 'filho', sedeId: 'pde-b', espelhado: true }],
      }),
    ).toBe(false)
  })

  it('Sede raiz nunca desvincula; 1ª vez vincula, depois troca', () => {
    expect(
      decidirFlagsVinculoUnidade({
        tipoUnidade: 'SEDE',
        jaNestaUnidade: true,
        podeVincularBase: false,
        travaOk: true,
        temUnidadeLocalAtual: false,
        liberaEm: null,
      }),
    ).toEqual({
      podeVincularUnidade: false,
      podeTrocarUnidade: false,
      podeDesvincularUnidade: false,
      vinculoUnidadeLiberaEm: null,
    })
    expect(
      decidirFlagsVinculoUnidade({
        tipoUnidade: 'PONTO_ENCONTRO',
        jaNestaUnidade: false,
        podeVincularBase: true,
        travaOk: true,
        temUnidadeLocalAtual: false,
        liberaEm: null,
      }),
    ).toMatchObject({ podeVincularUnidade: true, podeTrocarUnidade: false })
    expect(
      decidirFlagsVinculoUnidade({
        tipoUnidade: 'PONTO_ENCONTRO',
        jaNestaUnidade: false,
        podeVincularBase: true,
        travaOk: true,
        temUnidadeLocalAtual: true,
        liberaEm: null,
      }),
    ).toMatchObject({ podeVincularUnidade: false, podeTrocarUnidade: true })
    expect(
      decidirFlagsVinculoUnidade({
        tipoUnidade: 'SUBSEDE',
        jaNestaUnidade: true,
        podeVincularBase: false,
        travaOk: true,
        temUnidadeLocalAtual: true,
        liberaEm: null,
      }),
    ).toMatchObject({ podeDesvincularUnidade: true })
  })

  it('trava esconde CTAs e mostra a data', () => {
    const libera = '2026-10-01T12:00:00.000Z'
    expect(
      decidirFlagsVinculoUnidade({
        tipoUnidade: 'PONTO_ENCONTRO',
        jaNestaUnidade: true,
        podeVincularBase: false,
        travaOk: false,
        temUnidadeLocalAtual: true,
        liberaEm: libera,
      }),
    ).toEqual({
      podeVincularUnidade: false,
      podeTrocarUnidade: false,
      podeDesvincularUnidade: false,
      vinculoUnidadeLiberaEm: libera,
    })
  })
})
