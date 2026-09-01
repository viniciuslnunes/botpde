import { describe, expect, it } from 'vitest'
import { formatUnidadeLabel, nomeUnidadeEhSede, nomesEquivalentes, unidadeRepeteTorcida } from '@/lib/torcida-labels'

describe('rótulo de unidade ao lado da torcida', () => {
  it('reconhece unidade promovida a tenant próprio (Caso B)', () => {
    expect(
      unidadeRepeteTorcida('PDE FIEL BAIXADA - PRAIA GRANDE', 'PDE FIEL BAIXADA - PRAIA GRANDE'),
    ).toBe(true)
    // Caixa, acento e pontuação não fazem a repetição escapar.
    expect(unidadeRepeteTorcida('PDE Fiel Baixada – Praia Grande', 'PDE FIEL BAIXADA - PRAIA GRANDE')).toBe(true)
    expect(unidadeRepeteTorcida('Gaviões da Fiel', 'GAVIOES DA FIEL')).toBe(true)
  })

  it('reconhece Sede raiz nomeada a partir da torcida', () => {
    expect(unidadeRepeteTorcida('Sede — Camisa 12', 'CAMISA 12')).toBe(true)
    expect(unidadeRepeteTorcida('Sede — Fúria Jovem do Botafogo', 'FÚRIA JOVEM DO BOTAFOGO')).toBe(true)
    expect(unidadeRepeteTorcida('Sede', 'CAMISA 12')).toBe(true)
    expect(nomeUnidadeEhSede('Sede')).toBe(true)
    expect(nomeUnidadeEhSede('Sede — Camisa 12')).toBe(true)
    expect(nomeUnidadeEhSede('Sede Santos')).toBe(true)
    expect(nomeUnidadeEhSede('PDE Praia Grande')).toBe(false)
    expect(nomeUnidadeEhSede('GAVIÕES DA FIEL')).toBe(false)
  })

  it('mantém unidade que identifica um lugar próprio', () => {
    expect(unidadeRepeteTorcida('PDE Praia Grande', 'GAVIÕES DA FIEL')).toBe(false)
    // Só o tipo é descartado nas pontas — token que identifica nunca some.
    expect(unidadeRepeteTorcida('Sede Santos', 'GAVIÕES SANTOS')).toBe(false)
    expect(unidadeRepeteTorcida('Subsede Zona Leste', 'CAMISA 12')).toBe(false)
  })

  it('sem torcida para comparar, nada é escondido', () => {
    expect(unidadeRepeteTorcida('Sede — Camisa 12', null)).toBe(false)
    expect(formatUnidadeLabel({ nome: 'Sede — Camisa 12', torcidaNome: null })).toBe('Sede — Camisa 12')
  })

  it('não prefixa o tipo que já está no nome da unidade', () => {
    expect(
      formatUnidadeLabel({
        nome: 'PDE Praia Grande',
        tipo: 'PONTO_ENCONTRO',
        torcidaNome: 'GAVIÕES DA FIEL',
      }),
    ).toBe('PDE Praia Grande')
    expect(
      formatUnidadeLabel({ nome: 'Praia Grande', tipo: 'PONTO_ENCONTRO', torcidaNome: 'GAVIÕES DA FIEL' }),
    ).toBe('PDE Praia Grande')
    expect(
      formatUnidadeLabel({ nome: 'Zona Leste', tipo: 'SUBSEDE', torcidaNome: 'GAVIÕES DA FIEL' }),
    ).toBe('Subsede Zona Leste')
  })

  it('unidade redundante some mesmo com tipo declarado', () => {
    expect(
      formatUnidadeLabel({
        nome: 'PDE FIEL BAIXADA - PRAIA GRANDE',
        tipo: 'PONTO_ENCONTRO',
        torcidaNome: 'PDE FIEL BAIXADA - PRAIA GRANDE',
      }),
    ).toBeNull()
    expect(formatUnidadeLabel({ nome: 'Sede — Camisa 12', tipo: 'SEDE', torcidaNome: 'CAMISA 12' })).toBeNull()
  })

  it('serve também ao canal oficial, cujo nome é o da própria unidade', () => {
    // Card/detalhe de canal repetia "PDE FIEL BAIXADA - PRAIA GRANDE" no título
    // e no subtítulo da torcida.
    expect(nomesEquivalentes('PDE FIEL BAIXADA - PRAIA GRANDE', 'PDE FIEL BAIXADA - PRAIA GRANDE')).toBe(true)
    // Canal temático mantém a torcida no subtítulo.
    expect(nomesEquivalentes('Bateria 24h', 'GAVIÕES DA FIEL')).toBe(false)
    expect(nomesEquivalentes(null, 'GAVIÕES DA FIEL')).toBe(false)
  })

  it('entrada vazia não vira rótulo', () => {
    expect(formatUnidadeLabel({ nome: null, torcidaNome: 'CAMISA 12' })).toBeNull()
    expect(formatUnidadeLabel({ nome: '   ', torcidaNome: 'CAMISA 12' })).toBeNull()
  })
})
