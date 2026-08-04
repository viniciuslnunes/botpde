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
 * - Modo torcida com **unidade ativa** → default unidade: o tenant ativo é a
 *   fonte única. Quem selecionou a PDE (liderança da unidade Caso B ou
 *   operador da plataforma) tem que cair no canal dela, não no da Sede —
 *   senão o portal fica com duas verdades (admin na unidade, comunidade na
 *   raiz) e a marca do header troca de rota em rota.
 */
export function resolverEscopoComunidadePorModo(
  modo: 'nacional' | 'torcida',
  disponiveis: EscoposDisponiveis,
  escopoParam: string | undefined | null,
  opcoes?: {
    /** Tenant ativo é uma subsede/PDE promovida (Caso B), não a Sede raiz. */
    tenantAtivoEhUnidade?: boolean
  },
): EscopoComunidade {
  const padrao: EscopoComunidade =
    modo === 'torcida'
      ? opcoes?.tenantAtivoEhUnidade && disponiveis.unidade
        ? 'unidade'
        : disponiveis.torcida
          ? 'torcida'
          : 'nacional'
      : 'nacional'

  if (!ehEscopo(escopoParam)) return padrao
  if (escopoParam === 'torcida' && !disponiveis.torcida) return padrao
  if (escopoParam === 'unidade' && !disponiveis.unidade) return padrao
  return escopoParam
}
