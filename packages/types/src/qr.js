/**
 * Registro dos propósitos de QR do produto.
 *
 * O propósito é o namespace que entra no HMAC (`apps/web/src/lib/qr-token.ts`)
 * e é **a única coisa que impede um QR de um módulo valer em outro**. Enquanto
 * eram literais espalhados em cinco arquivos, dois módulos podiam escolher a
 * mesma string sem ninguém notar — e o efeito disso não é um bug de digitação,
 * é um token de carteirinha abrindo a retirada de um pedido.
 *
 * Aqui eles ficam num lugar só, com a decisão de desenho de cada um ao lado.
 * As duas regras que governam a coluna `rotativo` e a coluna `verificacao`
 * estão em `ARCHITECTURE.md` §5.37 e no estudo
 * `docs/data/plano-qr-multi-modulo.md`:
 *
 * - **O que o QR identifica manda no desenho.** Recurso coletivo (o QR do
 *   evento, que serve a quem apontar) tem de girar, senão vira print no grupo.
 *   Pessoa, conta e objeto são estáticos: o conferente vê quem está na frente
 *   dele, o dono pode estar sem sinal, e etiqueta colada não se reemite.
 * - **Verificar só é obrigatório quando a leitura DECIDE algo.** Liberar
 *   embarque ou entregar pedido vai ao servidor; escolher entre comandas que já
 *   estão na tela do operador pode ser lido no cliente.
 */

/** @typedef {'pessoa' | 'conta' | 'objeto' | 'recurso-coletivo'} QrIdentifica */
/** @typedef {'servidor' | 'cliente'} QrVerificacao */

/**
 * @typedef {{
 *   id: string,
 *   identifica: QrIdentifica,
 *   rotativo: boolean,
 *   verificacao: QrVerificacao,
 *   modulo: string,
 * }} QrProposito
 */

export const QR_CARTEIRINHA = 'carteirinha'
export const QR_EMBARQUE = 'embarque'
export const QR_PEDIDO_RETIRADA = 'pedido-retirada'
export const QR_BAR_COMANDA = 'bar-comanda'
export const QR_PATRIMONIO_ITEM = 'patrimonio-item'
export const QR_BAR_VENDA = 'bar-venda'

/**
 * Todo propósito em uso. **Formato congelado para `carteirinha`**: mudar o id
 * quebra carteirinha já impressa e salva na galeria de quem está na fila do
 * portão — é incidente, não refactor.
 *
 * @type {Readonly<Record<string, QrProposito>>}
 */
export const QR_PROPOSITOS = Object.freeze({
  [QR_CARTEIRINHA]: {
    id: QR_CARTEIRINHA,
    identifica: 'pessoa',
    rotativo: false,
    verificacao: 'servidor',
    modulo: 'associacao',
  },
  [QR_EMBARQUE]: {
    id: QR_EMBARQUE,
    identifica: 'recurso-coletivo',
    rotativo: true,
    verificacao: 'servidor',
    modulo: 'caravanas',
  },
  [QR_PEDIDO_RETIRADA]: {
    id: QR_PEDIDO_RETIRADA,
    identifica: 'conta',
    rotativo: false,
    verificacao: 'servidor',
    modulo: 'loja',
  },
  [QR_BAR_COMANDA]: {
    id: QR_BAR_COMANDA,
    identifica: 'conta',
    rotativo: false,
    verificacao: 'cliente',
    modulo: 'bar',
  },
  [QR_PATRIMONIO_ITEM]: {
    id: QR_PATRIMONIO_ITEM,
    identifica: 'objeto',
    rotativo: false,
    verificacao: 'servidor',
    modulo: 'patrimonio',
  },
  // Vale da compra antecipada: libera mercadoria no balcão, então verifica no
  // servidor — ao contrário da comanda, que só escolhe entre o que já está na
  // tela do operador.
  [QR_BAR_VENDA]: {
    id: QR_BAR_VENDA,
    identifica: 'conta',
    rotativo: false,
    verificacao: 'servidor',
    modulo: 'bar',
  },
})

/** Ids registrados, para varredura e teste de unicidade. */
export const QR_PROPOSITOS_IDS = Object.freeze(Object.keys(QR_PROPOSITOS))

/**
 * O propósito está registrado? Serve de guarda em código que recebe o valor de
 * fora do conjunto conhecido.
 *
 * @param {string} proposito
 * @returns {boolean}
 */
export function ehPropositoQrConhecido(proposito) {
  return Object.hasOwn(QR_PROPOSITOS, proposito)
}

/**
 * Um recurso coletivo **precisa** de QR rotativo. Invariante do desenho, não
 * preferência: fixo, ele é fotografado e compartilhado, e a pergunta que o QR
 * existe para responder passa a ter resposta errada.
 *
 * @param {QrProposito} p
 * @returns {boolean}
 */
export function propositoQrCoerente(p) {
  return p.identifica === 'recurso-coletivo' ? p.rotativo : true
}
