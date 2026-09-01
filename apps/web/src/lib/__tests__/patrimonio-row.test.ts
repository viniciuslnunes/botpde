import { describe, expect, it } from 'vitest'
import { acervoItemParaRow } from '../patrimonio-row'

describe('acervoItemParaRow', () => {
  it('achata responsável e Decimal para o card', () => {
    const row = acervoItemParaRow({
      id: '00000000-0000-0000-0000-000000000001',
      nome: 'Bandeirão principal',
      categoria: 'BANDEIRA',
      status: 'DISPONIVEL',
      quantidade: 1,
      localizacao: 'Barracão',
      valorEstimado: { toString: () => '1500.5' },
      observacao: null,
      fotoUrl: 'https://example.com/trapo.jpg',
      fotoPreviewUrl: null,
      responsavel: { id: 'u1', nome: 'Gestor' },
      meta: null,
    })
    expect(row.valorEstimado).toBe(1500.5)
    expect(row.responsavelId).toBe('u1')
    expect(row.responsavelNome).toBe('Gestor')
    expect(row.fotoPreviewUrl).toBeNull()
    expect(row.temVistoria).toBe(false)
  })

  it('preserva ficha de vistoria já calculada (direção de bandeiras)', () => {
    const row = acervoItemParaRow({
      id: '00000000-0000-0000-0000-000000000002',
      nome: 'Faixa',
      categoria: 'BANDEIRA',
      status: 'DISPONIVEL',
      quantidade: 1,
      localizacao: null,
      valorEstimado: null,
      observacao: null,
      fotoUrl: null,
      responsavelId: 'u2',
      responsavelNome: 'Membro',
      temVistoria: true,
      vistoriaVencendo: true,
      vistoria: {
        larguraM: 12,
        alturaM: 8,
        comMastro: true,
        orgao: 'SCCP',
        protocolo: null,
        validade: '2026-01-01',
        observacao: null,
      },
    })
    expect(row.temVistoria).toBe(true)
    expect(row.vistoriaVencendo).toBe(true)
    expect(row.vistoria?.larguraM).toBe(12)
    expect(row.responsavelId).toBe('u2')
  })
})
