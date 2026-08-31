export type ErrosEnderecoCheckout = { cep?: string; rua?: string; numero?: string }

/** Validação de cliente do endereço de envio — espelha `EnderecoEntregaSchema`. */
export function validarEnderecoEnvio(input: {
  cep: string
  rua: string
  numero: string
}): ErrosEnderecoCheckout {
  const erros: ErrosEnderecoCheckout = {}
  if (input.cep.replace(/\D/g, '').length !== 8) erros.cep = 'Informe um CEP válido.'
  if (input.rua.trim().length < 2) erros.rua = 'Informe a rua.'
  if (!input.numero.trim()) erros.numero = 'Informe o número.'
  return erros
}
