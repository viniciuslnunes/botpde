import { formatDataCompetenciaInput } from '@torcida/types'

/**
 * Rótulos legíveis dos campos de `SaasMembro` que aparecem no histórico do
 * card de detalhes. Campo sem rótulo aqui cai no nome cru — prefira cadastrar.
 */
export const CAMPO_MEMBRO_LABEL: Record<string, string> = {
  nome: 'Nome',
  tipo: 'Tipo',
  idade: 'Idade',
  telefone: 'Telefone',
  cidade: 'Cidade',
  discordTag: 'Discord',
  sedeId: 'Unidade',
  rg: 'RG',
  cpf: 'CPF',
  filiacao: 'Filiação',
  escolaridade: 'Escolaridade',
  profissao: 'Profissão',
  dataNascimento: 'Data de nascimento',
  planoAssociacaoId: 'Plano de associação',
  sexo: 'Sexo',
  estadoCivil: 'Estado civil',
  nacionalidade: 'Nacionalidade',
  logradouro: 'Logradouro',
  numero: 'Número',
  bloco: 'Bloco',
  complemento: 'Complemento',
  bairro: 'Bairro',
  cep: 'CEP',
  uf: 'UF',
  numeroAssociado: 'Nº de associado',
  anosSocio: 'Anos de sócio',
  imagemProva: 'Comprovante de vínculo',
  fotoDocumentoUrl: 'Foto do documento',
  comprovanteResidenciaUrl: 'Comprovante de residência',
  responsavelNome: 'Responsável',
  responsavelDocumento: 'Documento do responsável',
  termoResponsabilidadeAceitoEm: 'Termo de responsabilidade',
  autorizacaoMenorAceitaEm: 'Autorização do responsável',
}

/**
 * Campos lidos antes de um reenvio de cadastro para montar o diff. Precisa
 * cobrir tudo que o formulário grava — campo fora daqui é simplesmente
 * ignorado pelo diff (não vira um falso "vazio → valor").
 */
export const MEMBRO_DIFF_SELECT = {
  nome: true,
  tipo: true,
  idade: true,
  telefone: true,
  cidade: true,
  cep: true,
  numero: true,
  bloco: true,
  complemento: true,
  numeroAssociado: true,
  anosSocio: true,
  imagemProva: true,
  dataNascimento: true,
  sexo: true,
  estadoCivil: true,
  nacionalidade: true,
  rg: true,
  cpf: true,
  filiacao: true,
  profissao: true,
  logradouro: true,
  bairro: true,
  uf: true,
  fotoDocumentoUrl: true,
  comprovanteResidenciaUrl: true,
  responsavelNome: true,
  responsavelDocumento: true,
  sedeId: true,
} as const

export type AlteracaoCampo = { campo: string; de: string | null; para: string | null }

function valorAuditavel(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (v instanceof Date) return formatDataCompetenciaInput(v)
  return String(v)
}

/**
 * Diff campo a campo para o histórico do membro: o AuditLog guarda o que
 * mudou (rótulo + antes/depois), não só que "alguém editou". Percorre as
 * chaves de `depois` — o que não foi enviado na edição fica de fora.
 */
export function diffCamposMembro(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
): AlteracaoCampo[] {
  const alteracoes: AlteracaoCampo[] = []
  for (const campo of Object.keys(depois)) {
    // Campo ausente em `antes` = não foi lido do banco; sem base de comparação
    // viraria um falso "vazio → valor".
    if (!Object.prototype.hasOwnProperty.call(antes, campo)) continue
    const de = valorAuditavel(antes[campo])
    const para = valorAuditavel(depois[campo])
    if (de === para) continue
    alteracoes.push({ campo: CAMPO_MEMBRO_LABEL[campo] ?? campo, de, para })
  }
  return alteracoes
}
