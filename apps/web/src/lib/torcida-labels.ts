/** Tipos e rótulos de torcida — seguros para Client Components (sem next/headers). */

export type TorcidaOpcao = {
  id: string
  slug: string
  nome: string
  corPrimaria: string
  /** Clube (afiliação), para distinguir homônimas — ex. várias "Camisa 12". */
  clubeNome: string | null
  /** UF do clube (ex. SP), quando disponível. */
  clubeUf: string | null
}

export type TorcidaTransferencia = TorcidaOpcao & {
  temOwner: boolean
  ownerEmail: string | null
}

/** "Corinthians (SP)" — subtítulo / busca. */
export function labelClubeComUf(
  t: Pick<TorcidaOpcao, 'clubeNome' | 'clubeUf'>,
): string | null {
  if (!t.clubeNome) return null
  return t.clubeUf ? `${t.clubeNome} (${t.clubeUf})` : t.clubeNome
}

/** Rótulo "Torcida — Clube (UF)" para listagens e combobox. */
export function labelTorcidaComClube(
  t: Pick<TorcidaOpcao, 'nome' | 'clubeNome' | 'clubeUf'>,
): string {
  const clube = labelClubeComUf(t)
  return clube ? `${t.nome} — ${clube}` : t.nome
}
