import { describe, expect, it } from 'vitest'
import {
  checklistCompletudeCadastro,
  resumirCompletudeCadastroSocio,
} from '../completude-cadastro-socio'
import {
  elegivelPendenciaCadastro,
  inadimplentePorPendenciaCadastro,
  PENDENCIA_SOCIO_EXPEDICAO,
  PENDENCIA_SOCIO_FICHA,
  pendenciasCadastroVisiveis,
  resolverPendenciasCadastro,
  type MembroParaPendenciaCadastro,
} from '../pendencias-cadastro'

function base(over: Partial<MembroParaPendenciaCadastro> = {}): MembroParaPendenciaCadastro {
  return {
    isSocio: true,
    tipo: 'SOCIO',
    status: 'APROVADO',
    numeroAssociado: '52568',
    imagemProva: 'https://prova',
    cpf: null,
    rg: null,
    dataNascimento: null,
    logradouro: null,
    bairro: null,
    cep: '11700-000',
    uf: null,
    termoResponsabilidadeAceitoEm: null,
    dataExpedicaoCarteirinha: null,
    periodicidadePretendida: null,
    temCarteirinha: false,
    exigirDocumentosCadastro: false,
    solicitarPendenciasCadastro: true,
    pendenciasCadastroDispensadas: [],
    ...over,
  }
}

describe('checklistCompletudeCadastro', () => {
  it('espelha o card admin: nº/cep/prova ok e demais faltando', () => {
    const itens = checklistCompletudeCadastro(base())
    const byId = Object.fromEntries(itens.map((i) => [i.id, i.ok]))
    expect(byId.numeroAssociado).toBe(true)
    expect(byId.cep).toBe(true)
    expect(byId.prova).toBe(true)
    expect(byId.cpf).toBe(false)
    expect(byId.rg).toBe(false)
    expect(byId.nascimento).toBe(false)
    expect(byId.logradouro).toBe(false)
    expect(byId.bairro).toBe(false)
    expect(byId.uf).toBe(false)
    expect(byId.termo).toBe(false)
  })
})

describe('elegivelPendenciaCadastro', () => {
  it('aceita só sócio aprovado (membro, gestor, liderança com tipo SOCIO)', () => {
    expect(elegivelPendenciaCadastro({ tipo: 'SOCIO', status: 'APROVADO' })).toBe(true)
  })

  it('rejeita torcedor mesmo aprovado', () => {
    expect(elegivelPendenciaCadastro({ tipo: 'TORCEDOR', status: 'APROVADO' })).toBe(false)
  })

  it('rejeita sócio pendente', () => {
    expect(elegivelPendenciaCadastro({ tipo: 'SOCIO', status: 'PENDENTE' })).toBe(false)
  })
})

describe('resolverPendenciasCadastro via completude', () => {
  it('abre pendência com os obrigatórios faltando (+ carteirinha)', () => {
    const p = resolverPendenciasCadastro(base())
    expect(p).toHaveLength(1)
    expect(p[0]?.codigo).toBe(PENDENCIA_SOCIO_FICHA)
    expect(p[0]?.camposFaltantes).toEqual(
      expect.arrayContaining([
        'cpf',
        'rg',
        'nascimento',
        'logradouro',
        'bairro',
        'uf',
        'termo',
        'dataExpedicaoCarteirinha',
        'periodicidadePretendida',
      ]),
    )
    expect(p[0]?.progresso?.ok).toBeGreaterThanOrEqual(3)
  })

  it('some quando ficha + carteirinha estão completas', () => {
    const m = base({
      cpf: '123',
      rg: '456',
      dataNascimento: '1990-01-01',
      logradouro: 'Rua A',
      bairro: 'Centro',
      uf: 'SP',
      termoResponsabilidadeAceitoEm: new Date(),
      dataExpedicaoCarteirinha: new Date('2024-01-10'),
      periodicidadePretendida: 'ANUAL',
      temCarteirinha: true,
    })
    expect(resolverPendenciasCadastro(m)).toEqual([])
    expect(resumirCompletudeCadastroSocio(m, { exigirDocumentos: false, temCarteirinha: true }).completo).toBe(
      true,
    )
  })

  it('dispensa legada SOCIO_EXPEDICAO também esconde a ficha', () => {
    const m = base({ pendenciasCadastroDispensadas: [PENDENCIA_SOCIO_EXPEDICAO] })
    expect(pendenciasCadastroVisiveis(m)).toEqual([])
    expect(inadimplentePorPendenciaCadastro(m)).toBe(true)
  })

  it('Vinícius-like: ficha incompleta dispara mesmo com carteirinha já emitida', () => {
    const p = resolverPendenciasCadastro(
      base({
        numeroAssociado: '343221',
        cep: '84035-620',
        imagemProva: 'https://prova',
        temCarteirinha: true,
        exigirDocumentosCadastro: true,
      }),
    )
    expect(p).toHaveLength(1)
    expect(p[0]?.camposFaltantes).toEqual(
      expect.arrayContaining([
        'cpf',
        'rg',
        'nascimento',
        'logradouro',
        'bairro',
        'uf',
        'termo',
        'documento',
        'residencia',
      ]),
    )
    expect(p[0]?.camposFaltantes).not.toContain('dataExpedicaoCarteirinha')
  })

  it('TORCEDOR nunca entra no fluxo', () => {
    expect(
      resolverPendenciasCadastro(
        base({ tipo: 'TORCEDOR', isSocio: false }),
      ),
    ).toEqual([])
  })

  it('serviço desligado na unidade não abre pendência', () => {
    expect(
      resolverPendenciasCadastro(base({ solicitarPendenciasCadastro: false })),
    ).toEqual([])
    expect(
      inadimplentePorPendenciaCadastro(base({ solicitarPendenciasCadastro: false })),
    ).toBe(false)
  })
})
