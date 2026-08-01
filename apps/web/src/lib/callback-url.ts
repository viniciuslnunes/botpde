/**
 * Destino de retorno pós-login/cadastro (`?callbackUrl=`).
 *
 * Só caminho INTERNO relativo é aceito: `//host` e URL absoluta viram open
 * redirect — e o vetor aqui é justamente um link colado por terceiros (convite
 * de unidade). Na dúvida, devolve `null` e o chamador usa o destino padrão.
 */
export function destinoInternoSeguro(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const destino = valor.trim()
  if (!destino.startsWith('/')) return null
  // `//host` e `/\host` são tratados como absolutos pelos navegadores.
  if (destino.startsWith('//') || destino.startsWith('/\\')) return null
  return destino
}
