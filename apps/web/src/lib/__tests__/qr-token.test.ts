import { describe, expect, it } from 'vitest'
import { assinarQr, extrairPayloadDeQr, lerPayload, montarPayload } from '@/lib/qr-token'
import { janelaEmbarqueValida, lerQrEmbarque, montarQrEmbarque } from '@/lib/embarque-qr'
import { lerQrRetirada, montarQrRetirada } from '@/lib/pedido-qr'
import { montarQrComanda } from '@/lib/comanda-qr'
import { lerQrVendaBar, montarQrVendaBar } from '@/lib/venda-bar-qr'
import { lerQrItemPatrimonio, montarQrItemPatrimonio } from '@/lib/patrimonio-qr'
import { dadosDoPayloadQr, dadosDoQrOuUrl } from '@/lib/qr-payload'
import { montarPayloadQr, parsePayloadQr } from '@/lib/carteirinha-qr'
import { JANELA_QR_EMBARQUE_SEGUNDOS } from '@torcida/types'

const UUID = '11111111-2222-4333-8444-555555555555'

describe('primitiva de QR — propósito isola os módulos', () => {
  it('faz roundtrip dentro do mesmo propósito', () => {
    const p = montarPayload('teste', 'abc123')
    expect(lerPayload('teste', p)).toBe('abc123')
  })

  it('**recusa payload de outro propósito** — é o que impede um QR virar outro', () => {
    const daCarteirinha = montarPayload('carteirinha', UUID)
    expect(lerPayload('embarque', daCarteirinha)).toBeNull()
    expect(lerPayload('pedido-retirada', daCarteirinha)).toBeNull()
    expect(lerPayload('carteirinha', daCarteirinha)).toBe(UUID)
  })

  it('assinatura muda com o propósito, mesmo com dados idênticos', () => {
    expect(assinarQr('a', UUID)).not.toBe(assinarQr('b', UUID))
  })

  it('recusa payload adulterado e mal formado', () => {
    const p = montarPayload('teste', 'abc')
    expect(lerPayload('teste', `${p}x`)).toBeNull()
    expect(lerPayload('teste', 'abc.assinatura-falsa')).toBeNull()
    expect(lerPayload('teste', 'semponto')).toBeNull()
    expect(lerPayload('teste', '.soassinatura')).toBeNull()
    expect(lerPayload('teste', 'sodados.')).toBeNull()
    expect(lerPayload('teste', '')).toBeNull()
  })

  it('dados com ponto sobrevivem — o corte é no último separador', () => {
    const p = montarPayload('teste', 'a.b.c')
    expect(lerPayload('teste', p)).toBe('a.b.c')
  })
})

describe('extrairPayloadDeQr', () => {
  it('tira o t= da URL que a câmera abre e devolve payload cru intacto', () => {
    expect(extrairPayloadDeQr('https://app.exemplo/embarque?t=abc.def')).toBe('abc.def')
    expect(extrairPayloadDeQr('  abc.def  ')).toBe('abc.def')
    expect(extrairPayloadDeQr('/embarque?t=xyz.123')).toBe('xyz.123')
  })
})

describe('QR do embarque (rotativo)', () => {
  const agora = 1_700_000_000_000

  it('carrega evento, trecho e janela de volta', () => {
    const { payload } = montarQrEmbarque(UUID, 'VOLTA', agora)
    const lido = lerQrEmbarque(payload)
    expect(lido).not.toBeNull()
    expect(lido!.eventoId).toBe(UUID)
    expect(lido!.trecho).toBe('VOLTA')
    expect(janelaEmbarqueValida(lido!.janela, agora)).toBe(true)
  })

  it('trocar o trecho no payload invalida a assinatura', () => {
    const { payload } = montarQrEmbarque(UUID, 'IDA', agora)
    expect(lerQrEmbarque(payload.replace('IDA', 'VOLTA'))).toBeNull()
  })

  it('QR de duas janelas atrás ainda decodifica, mas não é mais válido', () => {
    const antigo = montarQrEmbarque(UUID, 'IDA', agora - 3 * JANELA_QR_EMBARQUE_SEGUNDOS * 1000)
    const lido = lerQrEmbarque(antigo.payload)
    // Decodificar e validar são passos separados de propósito: "QR expirado" e
    // "QR falso" precisam de mensagens diferentes na porta do ônibus.
    expect(lido).not.toBeNull()
    expect(janelaEmbarqueValida(lido!.janela, agora)).toBe(false)
  })

  it('QR de embarque não vale como retirada de pedido', () => {
    const { payload } = montarQrEmbarque(UUID, 'IDA', agora)
    expect(lerQrRetirada(payload)).toBeNull()
  })

  it('expiraEm fica dentro da janela', () => {
    const { expiraEm, janelaSegundos } = montarQrEmbarque(UUID, 'IDA', agora)
    expect(janelaSegundos).toBe(JANELA_QR_EMBARQUE_SEGUNDOS)
    expect(expiraEm).toBeGreaterThan(agora)
    expect(expiraEm - agora).toBeLessThanOrEqual(JANELA_QR_EMBARQUE_SEGUNDOS * 1000)
  })
})

describe('QR de retirada do pedido (estático)', () => {
  it('faz roundtrip do id do pedido', () => {
    expect(lerQrRetirada(montarQrRetirada(UUID))).toBe(UUID)
  })

  it('é estável entre chamadas — o comprador pode salvar na galeria', () => {
    expect(montarQrRetirada(UUID)).toBe(montarQrRetirada(UUID))
  })

  it('recusa dado assinado que não tem cara de uuid', () => {
    const forjado = montarPayload('pedido-retirada', 'nao-e-uuid')
    expect(lerQrRetirada(forjado)).toBeNull()
  })

  it('não vale como carteirinha nem como embarque', () => {
    const p = montarQrRetirada(UUID)
    expect(parsePayloadQr(p)).toBeNull()
    expect(lerQrEmbarque(p)).toBeNull()
  })
})

describe('extração sem verificação (qr-payload) — só para QR que não autoriza', () => {
  it('devolve o dado assinado sem validar a assinatura', () => {
    const p = montarPayload('bar-comanda', UUID)
    expect(dadosDoPayloadQr(p)).toBe(UUID)
    // De propósito: aqui não há segredo, então assinatura falsa "passa". É por
    // isso que o único uso é escolher entre itens já autorizados na tela.
    expect(dadosDoPayloadQr(`${UUID}.qualquercoisa`)).toBe(UUID)
  })

  it('recusa formato sem separador', () => {
    expect(dadosDoPayloadQr('semponto')).toBeNull()
    expect(dadosDoPayloadQr('.soassinatura')).toBeNull()
    expect(dadosDoPayloadQr('sodados.')).toBeNull()
    expect(dadosDoPayloadQr('   ')).toBeNull()
  })

  it('aceita a URL que a câmera nativa abre', () => {
    expect(dadosDoQrOuUrl(`https://app.exemplo/x?t=${UUID}.sig`)).toBe(UUID)
    expect(dadosDoQrOuUrl(`${UUID}.sig`)).toBe(UUID)
    expect(dadosDoQrOuUrl('lixo')).toBeNull()
  })

  it('concorda com o `lerPayload` verificado quando a assinatura é boa', () => {
    const p = montarQrComanda(UUID)
    expect(dadosDoPayloadQr(p)).toBe(lerPayload('bar-comanda', p))
  })
})

describe('carteirinha — formato congelado', () => {
  it('continua sendo `token.assinatura` com o namespace antigo', () => {
    const token = 'tok_abcdef123456'
    const payload = montarPayloadQr(token)

    expect(payload).toBe(`${token}.${assinaturaEsperada(token)}`)
    expect(parsePayloadQr(payload)).toBe(token)
  })
})

/**
 * Reproduz a assinatura pelo caminho genérico. Se este teste quebrar, uma
 * carteirinha já impressa parou de validar no portão — não é refactor, é
 * incidente.
 */
function assinaturaEsperada(token: string): string {
  return assinarQr('carteirinha', token)
}

describe('QR do item do patrimônio (etiqueta física)', () => {
  it('faz roundtrip e é estável — a etiqueta fica colada por anos', () => {
    expect(lerQrItemPatrimonio(montarQrItemPatrimonio(UUID))).toBe(UUID)
    expect(montarQrItemPatrimonio(UUID)).toBe(montarQrItemPatrimonio(UUID))
  })

  it('recusa dado assinado que não tem cara de uuid', () => {
    expect(lerQrItemPatrimonio(montarPayload('patrimonio-item', 'x'))).toBeNull()
  })

  it('não vale como comanda, pedido, embarque nem carteirinha', () => {
    const p = montarQrItemPatrimonio(UUID)
    expect(lerQrRetirada(p)).toBeNull()
    expect(lerQrEmbarque(p)).toBeNull()
    expect(parsePayloadQr(p)).toBeNull()
    expect(lerPayload('bar-comanda', p)).toBeNull()
  })
})

describe('vale da compra antecipada do bar', () => {
  it('faz roundtrip e é estável', () => {
    expect(lerQrVendaBar(montarQrVendaBar(UUID))).toBe(UUID)
    expect(montarQrVendaBar(UUID)).toBe(montarQrVendaBar(UUID))
  })

  it('**não vale como comanda** — os dois vivem no bar e fazem coisas opostas', () => {
    // A comanda é lida no cliente e não autoriza nada; o vale libera mercadoria.
    // Se um valesse pelo outro, escolher comanda viraria entregar bebida.
    const vale = montarQrVendaBar(UUID)
    const comanda = montarQrComanda(UUID)
    expect(lerPayload('bar-comanda', vale)).toBeNull()
    expect(lerQrVendaBar(comanda)).toBeNull()
  })

  it('recusa dado assinado fora do formato de uuid', () => {
    expect(lerQrVendaBar(montarPayload('bar-venda', 'nao-e-uuid'))).toBeNull()
  })
})
