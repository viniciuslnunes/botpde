/**
 * Elegibilidade a benefício — a regra única que responde "essa pessoa pode
 * usar isto?".
 *
 * Até aqui cada módulo decidia sozinho: o evento tinha
 * `checkInExigePagamento`, o bar tinha limite de comanda, a Comunidade tinha
 * Confiança. Nenhum deles conversava, e a mesma pessoa era tratada de três
 * jeitos diferentes na mesma torcida.
 *
 * **Elegibilidade não é permissão.** Ela responde "pode usar o benefício",
 * nunca "pode administrar" — RBAC continua em `permissions.js`. Também não
 * decide sozinha o que fazer: devolve bloqueios e avisos, e quem chama escolhe
 * entre barrar, avisar ou registrar override (que é o que a operação real
 * exige — ninguém deixa o ônibus sair por causa de uma mensalidade).
 */

/** @typedef {'ESCALA'|'EMBARQUE'|'COMANDA'|'PRECO_SOCIO'} BeneficioElegivel */

export const BENEFICIOS_ELEGIBILIDADE = Object.freeze([
  'ESCALA',
  'EMBARQUE',
  'COMANDA',
  'PRECO_SOCIO',
])

export const BENEFICIO_ELEGIBILIDADE_LABEL = Object.freeze({
  ESCALA: 'Assumir posto na escala',
  EMBARQUE: 'Embarcar na caravana',
  COMANDA: 'Abrir comanda no bar',
  PRECO_SOCIO: 'Preço de sócio',
})

/**
 * @typedef {object} EstadoElegibilidade
 * @property {boolean} membroAtivo vínculo aprovado e vivo no tenant
 * @property {boolean} [desligado]
 * @property {boolean} [bloqueado]
 * @property {boolean} [adimplente]
 * @property {boolean} [ehSocio] sócio (tem carteirinha) × torcedor
 * @property {boolean} [carteirinhaValida]
 * @property {number} [nivelConfianca]
 */

/**
 * @typedef {object} ResultadoElegibilidade
 * @property {boolean} permitido
 * @property {string[]} bloqueios impedem o benefício
 * @property {string[]} avisos não impedem — quem opera decide
 */

/** Situações que barram qualquer benefício: a pessoa não está na torcida. */
function bloqueiosDeVinculo(estado) {
  const bloqueios = []
  if (estado?.bloqueado) bloqueios.push('Pessoa bloqueada na torcida')
  if (estado?.desligado) bloqueios.push('Vínculo desligado')
  if (!estado?.membroAtivo) bloqueios.push('Sem vínculo ativo nesta torcida')
  return bloqueios
}

/**
 * Avalia um benefício. A inadimplência quase nunca bloqueia: ela avisa, porque
 * a decisão de barrar é da liderança e tem custo humano no dia da viagem. A
 * exceção é a comanda, que é crédito — abrir mais crédito para quem já deve é
 * o erro que o fiado do bar já cometeu uma vez.
 *
 * @param {BeneficioElegivel | string} beneficio
 * @param {EstadoElegibilidade} estado
 * @returns {ResultadoElegibilidade}
 */
export function avaliarElegibilidade(beneficio, estado) {
  const bloqueios = bloqueiosDeVinculo(estado)
  const avisos = []

  const inadimplente = estado?.adimplente === false
  const carteirinhaVencida = Boolean(estado?.ehSocio) && estado?.carteirinhaValida === false

  if (inadimplente) {
    if (beneficio === 'COMANDA') bloqueios.push('Inadimplente — comanda é crédito')
    else avisos.push('Inadimplente')
  }
  if (carteirinhaVencida) {
    if (beneficio === 'PRECO_SOCIO') bloqueios.push('Carteirinha vencida')
    else avisos.push('Carteirinha vencida')
  }
  if (beneficio === 'PRECO_SOCIO' && !estado?.ehSocio) {
    bloqueios.push('Benefício exclusivo de sócio')
  }

  return { permitido: bloqueios.length === 0, bloqueios, avisos }
}

/**
 * Rótulo curto para chip na lista (escala, embarque). Null quando não há nada
 * a dizer — o caso normal não merece ruído na tela.
 *
 * @param {ResultadoElegibilidade | null | undefined} resultado
 */
export function resumoElegibilidade(resultado) {
  if (!resultado) return null
  if (resultado.bloqueios.length > 0) {
    return { texto: resultado.bloqueios[0], tom: 'danger' }
  }
  if (resultado.avisos.length > 0) {
    return { texto: resultado.avisos[0], tom: 'warning' }
  }
  return null
}
