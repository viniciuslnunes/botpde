export type EnderecoViaCep = {
  logradouro: string
  bairro: string
  localidade: string
  uf: string
}

type ViaCepRespostaBruta = {
  erro?: boolean
  logradouro?: string
  bairro?: string
  localidade?: string
  uf?: string
}

/** Consulta a ViaCEP; retorna null se CEP inválido, inexistente, ou em caso de erro de rede (nunca lança). */
export async function buscarEnderecoPorCep(cepBruto: string): Promise<EnderecoViaCep | null> {
  const digitos = cepBruto.replace(/\D/g, '')
  if (digitos.length !== 8) return null
  try {
    const resp = await fetch(`https://viacep.com.br/ws/${digitos}/json/`)
    if (!resp.ok) return null
    const json = (await resp.json()) as ViaCepRespostaBruta
    if (json.erro) return null
    return {
      logradouro: json.logradouro ?? '',
      bairro: json.bairro ?? '',
      localidade: json.localidade ?? '',
      uf: json.uf ?? '',
    }
  } catch {
    return null
  }
}
