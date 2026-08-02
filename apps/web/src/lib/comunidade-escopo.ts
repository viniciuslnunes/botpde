/**
 * Resolução pura do escopo da Comunidade (sem next/headers / DB).
 * Seguro para Client Components — não importar `comunidade-contexto` no client.
 */

/**
 * Escopo de leitura/publicação escolhido dentro da Comunidade (query `?escopo=`).
 *
 * - `nacional` — Comunidade Nacional do clube (a praça do torcedor);
 * - `torcida` — a organizada inteira (Sede + hierarquia). **Só sócio**;
 * - `unidade` — a subsede/PDE de vínculo, a que emitiu o convite.
 */
export type EscopoComunidade = 'nacional' | 'torcida' | 'unidade'

/**
 * Quais abas a pessoa tem direito de ver.
 *
 * Torcedor **não** tem `torcida`: ele pertence à unidade que o convidou, não à
 * organizada — e não pode estar inscrito no canal da Sede. Sócio tem as duas.
 */
export interface EscoposDisponiveis {
  torcida: boolean
  unidade: boolean
}

function ehEscopo(valor: unknown): valor is EscopoComunidade {
  return valor === 'nacional' || valor === 'torcida' || valor === 'unidade'
}

/** Chrome e navbar só têm dois estados: nacional ou "dentro de um tenant". */
export function ehEscopoNacional(escopo: EscopoComunidade): boolean {
  return escopo === 'nacional'
}

/**
 * Resolve o escopo efetivo a partir do parâmetro de query e do contexto do
 * usuário. Escopo pedido mas indisponível **nunca** vira erro: cai no default
 * de quem pediu — link colado não pode dar 403 na cara da pessoa.
 *
 * - Modo nacional (TORCEDOR) → default nacional
 * - Modo torcida (sócio) → default torcida, quando tem a aba
 */
export function resolverEscopoComunidadePorModo(
  modo: 'nacional' | 'torcida',
  disponiveis: EscoposDisponiveis,
  escopoParam: string | undefined | null,
): EscopoComunidade {
  const padrao: EscopoComunidade =
    modo === 'torcida' && disponiveis.torcida ? 'torcida' : 'nacional'

  if (!ehEscopo(escopoParam)) return padrao
  if (escopoParam === 'torcida' && !disponiveis.torcida) return padrao
  if (escopoParam === 'unidade' && !disponiveis.unidade) return padrao
  return escopoParam
}
