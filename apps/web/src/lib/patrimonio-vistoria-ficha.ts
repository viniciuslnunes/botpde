import { lerVistoriaBandeira, vistoriaVencendo } from '@torcida/types'

export type FichaVistoriaPeca = {
  larguraM: number
  alturaM: number
  comMastro: boolean
  orgao: string | null
  protocolo: string | null
  validade: string | null
  observacao: string | null
} | null

/** Lê `meta.vistoria` para o card e o modal — nunca estoura em dado torto. */
export function fichaVistoriaDoItem(meta: unknown): {
  temVistoria: boolean
  vistoriaVencendo: boolean
  vistoria: FichaVistoriaPeca
} {
  const vistoria = lerVistoriaBandeira(meta)
  return {
    temVistoria: vistoria !== null,
    vistoriaVencendo: vistoriaVencendo(vistoria),
    vistoria: vistoria
      ? {
          larguraM: vistoria.larguraM,
          alturaM: vistoria.alturaM,
          comMastro: vistoria.comMastro,
          orgao: vistoria.orgao ?? null,
          protocolo: vistoria.protocolo ?? null,
          validade: vistoria.validade ?? null,
          observacao: vistoria.observacao ?? null,
        }
      : null,
  }
}
