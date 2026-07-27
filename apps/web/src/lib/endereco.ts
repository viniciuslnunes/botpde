/** Compara só o nome da rua (ignora número/complemento) ao preservar dígitos no CEP. */
export function normalizarInicioEndereco(valor: string): string {
  return valor
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/,?\s*\d+[a-z]?.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}
