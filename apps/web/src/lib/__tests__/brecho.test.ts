import { describe, expect, it } from 'vitest'
import {
  calcularScoreConfianca,
  compararLojasConfiaveis,
  estadoConfirmacaoTroca,
  idCurtoBrecho,
  nomeConversaBrecho,
  podeAtenderDenunciaBrecho,
  podeConfirmarTroca,
  podeDemonstrarInteresse,
  podeParticiparBrecho,
  raizesDoFeedBrecho,
  rotuloPrecoBrecho,
  nomeExibicaoVendedorBrecho,
  rotuloRankingBrecho,
  rotuloTrocasBrecho,
  estrelasConfiancaBrecho,
} from '@torcida/types'

describe('podeParticiparBrecho', () => {
  it('sócio aprovado na linhagem entra', () => {
    expect(podeParticiparBrecho({ socioAprovadoNaLinhaagem: true, soUnidadesRestritas: false })).toEqual({
      ok: true,
    })
  })

  it('torcedor / não-sócio não entra', () => {
    expect(podeParticiparBrecho({ socioAprovadoNaLinhaagem: false, soUnidadesRestritas: false })).toEqual({
      ok: false,
      motivo: 'nao_socio',
    })
  })

  it('sócio só de unidade restrita não entra na praça nacional', () => {
    expect(podeParticiparBrecho({ socioAprovadoNaLinhaagem: true, soUnidadesRestritas: true })).toEqual({
      ok: false,
      motivo: 'canal_restrito',
    })
  })
})

describe('raizesDoFeedBrecho', () => {
  it('aliados desligados = só a própria raiz', () => {
    expect(
      raizesDoFeedBrecho({
        raizId: 'sede-a',
        brechoAliados: false,
        raizesAliadas: ['sede-b'],
      }),
    ).toEqual(['sede-a'])
  })

  it('aliados ligados incluem raízes aliadas sem duplicar', () => {
    expect(
      raizesDoFeedBrecho({
        raizId: 'sede-a',
        brechoAliados: true,
        raizesAliadas: ['sede-b', 'sede-a', 'sede-b'],
      }),
    ).toEqual(['sede-a', 'sede-b'])
  })
})

describe('calcularScoreConfianca', () => {
  it('loja congelada zera', () => {
    expect(
      calcularScoreConfianca({
        trocasConcluidas: 10,
        contrapartesUnicas: 8,
        congelada: true,
      }),
    ).toBe(0)
  })

  it('contraparte única pesa mais que repetir o mesmo par', () => {
    const unica = calcularScoreConfianca({ trocasConcluidas: 3, contrapartesUnicas: 3 })
    const repetida = calcularScoreConfianca({ trocasConcluidas: 3, contrapartesUnicas: 1 })
    expect(unica).toBeGreaterThan(repetida)
  })

  it('denúncia procedente derruba o score', () => {
    const limpa = calcularScoreConfianca({ trocasConcluidas: 4, contrapartesUnicas: 4 })
    const manchada = calcularScoreConfianca({
      trocasConcluidas: 4,
      contrapartesUnicas: 4,
      denunciasProcedentes: 2,
    })
    expect(manchada).toBe(Math.max(0, limpa - 40))
  })

  it('fica entre 0 e 100', () => {
    expect(calcularScoreConfianca({ trocasConcluidas: 0, contrapartesUnicas: 0 })).toBe(0)
    expect(
      calcularScoreConfianca({ trocasConcluidas: 20, contrapartesUnicas: 10 }),
    ).toBeLessThanOrEqual(100)
    expect(
      calcularScoreConfianca({ trocasConcluidas: 20, contrapartesUnicas: 10 }),
    ).toBeGreaterThan(0)
  })
})

describe('interesse e confirmação', () => {
  it('bloqueia interesse no próprio anúncio', () => {
    expect(
      podeDemonstrarInteresse({
        interessadoId: 'u1',
        vendedorId: 'u1',
        anuncioStatus: 'ATIVO',
        lojaAtiva: true,
        lojaCongelada: false,
      }).ok,
    ).toBe(false)
  })

  it('bloqueia loja congelada', () => {
    expect(
      podeDemonstrarInteresse({
        interessadoId: 'u2',
        vendedorId: 'u1',
        anuncioStatus: 'ATIVO',
        lojaAtiva: true,
        lojaCongelada: true,
      }).ok,
    ).toBe(false)
  })

  it('não confirma troca consigo mesmo', () => {
    expect(
      podeConfirmarTroca({
        userId: 'u1',
        vendedorId: 'u1',
        interessadoId: 'u1',
        jaConfirmou: false,
        anuncioStatus: 'ATIVO',
      }).ok,
    ).toBe(false)
  })

  it('os dois lados precisam confirmar para concluir', () => {
    expect(
      estadoConfirmacaoTroca({ vendedorConfirmouEm: null, interessadoConfirmouEm: null }),
    ).toBe('aberta')
    expect(
      estadoConfirmacaoTroca({ vendedorConfirmouEm: new Date(), interessadoConfirmouEm: null }),
    ).toBe('parcial')
    expect(
      estadoConfirmacaoTroca({
        vendedorConfirmouEm: new Date(),
        interessadoConfirmouEm: new Date(),
      }),
    ).toBe('concluida')
  })
})

describe('denúncia staff', () => {
  it('só atende PENDENTE sem atendente', () => {
    expect(podeAtenderDenunciaBrecho({ atendenteId: null, status: 'PENDENTE' }).ok).toBe(true)
    expect(podeAtenderDenunciaBrecho({ atendenteId: 'staff', status: 'PENDENTE' }).ok).toBe(false)
    expect(podeAtenderDenunciaBrecho({ atendenteId: null, status: 'RESOLVIDA' }).ok).toBe(false)
  })
})

describe('ranking e rótulos', () => {
  it('ordena por score e depois por trocas', () => {
    const a = { scoreConfianca: 40, trocasConcluidas: 9, nome: 'B' }
    const b = { scoreConfianca: 80, trocasConcluidas: 2, nome: 'A' }
    expect(compararLojasConfiaveis(a, b)).toBeGreaterThan(0)
  })

  it('monta nome de conversa e id curto', () => {
    expect(idCurtoBrecho('abcdef12-3456')).toBe('ABCDEF12')
    expect(nomeConversaBrecho({ titulo: 'Camisa 2012', idCurto: 'ABCDEF12' })).toContain('Brechó')
  })

  it('rótulo de preço segue a modalidade', () => {
    expect(rotuloPrecoBrecho({ modalidade: 'TROCA' })).toBe('Troca')
    expect(rotuloPrecoBrecho({ modalidade: 'DOACAO' })).toBe('Doação')
    expect(rotuloPrecoBrecho({ modalidade: 'VENDA', preco: 80 })).toContain('80')
  })

  it('nome do vendedor prefere o nome da pessoa, não o cargo do seed', () => {
    expect(
      nomeExibicaoVendedorBrecho({ nome: 'Pedro Lima', nickname: 'pedrao', lojaNome: 'Loja 12' }),
    ).toBe('Pedro Lima')
    expect(nomeExibicaoVendedorBrecho({ nome: null, nickname: 'pedrao', lojaNome: 'Loja 12' })).toBe(
      'pedrao',
    )
    expect(
      nomeExibicaoVendedorBrecho({
        nome: 'Gestor Materiais / Loja (teste)',
        nickname: 'gavioes_gestor_materiais',
        lojaNome: 'Cantinho da Loja',
      }),
    ).toBe('gavioes_gestor_materiais')
  })

  it('ranking da loja P2P usa as faixas de nível', () => {
    expect(rotuloRankingBrecho(0)).toBe('Novato')
    expect(rotuloRankingBrecho(50)).toBe('De casa')
    expect(rotuloRankingBrecho(80)).toBe('Referência')
  })

  it('trocas conta venda, troca e doação no mesmo número', () => {
    expect(rotuloTrocasBrecho(0)).toBe('0 trocas')
    expect(rotuloTrocasBrecho(1)).toBe('1 troca')
    expect(rotuloTrocasBrecho(6)).toBe('6 trocas')
  })

  it('estrelas são relativas ao topo da praça', () => {
    expect(estrelasConfiancaBrecho(0, 80)).toBe(0)
    expect(estrelasConfiancaBrecho(40, 0)).toBe(0)
    expect(estrelasConfiancaBrecho(80, 80)).toBe(5)
    expect(estrelasConfiancaBrecho(40, 80)).toBe(3)
    expect(estrelasConfiancaBrecho(8, 80)).toBe(1)
    expect(estrelasConfiancaBrecho(4, 80)).toBe(0)
  })
})

describe('CriarBrechoLojaSchema', () => {
  it('aceita capa da vitrine além da foto quadrada', async () => {
    const { CriarBrechoLojaSchema } = await import('@torcida/types')
    const parsed = CriarBrechoLojaSchema.safeParse({
      nome: 'Cantinho da Fiel',
      fotoUrl: 'https://res.cloudinary.com/demo/image/upload/v1/foto.jpg',
      capaUrl: 'https://res.cloudinary.com/demo/image/upload/v1/capa.jpg',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.capaUrl).toContain('capa.jpg')
    }
  })

  it('capa e foto são opcionais', async () => {
    const { CriarBrechoLojaSchema, AtualizarBrechoLojaSchema } = await import('@torcida/types')
    expect(CriarBrechoLojaSchema.safeParse({ nome: 'Minha loja' }).success).toBe(true)
    expect(
      AtualizarBrechoLojaSchema.safeParse({
        fotoUrl: 'https://res.cloudinary.com/demo/image/upload/v1/foto.jpg',
      }).success,
    ).toBe(true)
    expect(AtualizarBrechoLojaSchema.safeParse({ nome: 'Brechó da Bateria' }).success).toBe(true)
  })
})
