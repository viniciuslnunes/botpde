'use client'

import { useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  aplicarSnapshotListagem,
  limparSkipRestoreListagem,
  snapshotContratoListagem,
  temSkipRestoreListagem,
  urlTemParamContrato,
} from '@/lib/listagem/form-query'

export interface ListagemPersistenciaProps {
  listagemId: string
  basePath: string
  /**
   * Params do contrato presentes na URL — a URL sempre ganha do snapshot.
   * Inclui abas efêmeras (`?status=`) para link/notificação não ser sobrescrito.
   */
  paramsDoContrato: readonly string[]
  /** Recorte persistível (contrato menos abas efêmeras do spec). */
  paramsPersistiveis: readonly string[]
  /**
   * Discriminador do escopo — normalmente o `tenantId`. Sem ele, o filtro de
   * unidade salvo numa torcida seria reaplicado em outra e a lista abriria
   * inexplicavelmente vazia.
   */
  escopoChave: string
}

const PREFIXO = 'torcida:listagem:'

/**
 * Sobrevive a remount do client component no mesmo JS (troca de `?q=` para
 * URL nua). Sem isso, "Limpar busca" gravava o snapshot vazio, o componente
 * remontava e o effect da montagem nova ressuscitava o `q` antigo.
 */
const restoreBloqueado = new Set<string>()

/**
 * Guarda a última visão de uma listagem (filtros, ordenação, tamanho de página)
 * e a restaura quando o admin volta pela URL nua.
 *
 * Busca (`q`) e offset (`pagina`) ficam de fora: são consulta pontual. Sem
 * isso, procurar um nome e sair da aba reabria a lista já filtrada na próxima
 * visita — e o X do campo não "pegava", porque o snapshot reaplicava o termo.
 *
 * Precedência é explícita: **a URL sempre ganha**. O snapshot só entra quando
 * nenhum param do contrato está presente — assim um link compartilhado nunca é
 * sobrescrito pelo filtro salvo de quem clicou. A restauração usa `replace`,
 * então não cria entrada nova no histórico, e acontece no máximo uma vez por
 * montagem: é isso que faz "Limpar tudo" realmente limpar em vez de ser
 * ressuscitado pelo snapshot no render seguinte.
 *
 * Limpar a busca (URL nua depois de ter tido params) marca a chave em
 * `restoreBloqueado` para um remount imediato não reaplicar o snapshot.
 */
export function ListagemPersistencia({
  listagemId,
  basePath,
  paramsDoContrato,
  paramsPersistiveis,
  escopoChave,
}: ListagemPersistenciaProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const restaurado = useRef(false)

  useEffect(() => {
    const chave = `${PREFIXO}${escopoChave}:${listagemId}`
    const atuais = new URLSearchParams(searchParams.toString())
    const urlTemContrato = urlTemParamContrato(atuais, paramsDoContrato)
    const serializado = snapshotContratoListagem(atuais, paramsPersistiveis).toString()

    if (!restaurado.current) {
      restaurado.current = true
      const skipRestore = temSkipRestoreListagem(basePath) || restoreBloqueado.has(chave)
      if (!urlTemContrato && !skipRestore) {
        let salvo: string | null = null
        try {
          salvo = window.localStorage.getItem(chave)
        } catch {
          // Modo privativo / storage bloqueado: segue sem persistência.
        }
        if (salvo) {
          const destino = aplicarSnapshotListagem(atuais, salvo, paramsPersistiveis)
          const qs = destino.toString()
          if (qs) {
            router.replace(`${basePath}?${qs}`, { scroll: false })
            return
          }
        }
      }
    }

    try {
      if (serializado) {
        limparSkipRestoreListagem(basePath)
        restoreBloqueado.delete(chave)
        window.localStorage.setItem(chave, serializado)
      } else if (!urlTemContrato) {
        restoreBloqueado.add(chave)
        window.localStorage.removeItem(chave)
      } else {
        // URL só com busca/página: não grava o termo, e tira `q` de snapshot velho.
        let salvo: string | null = null
        try {
          salvo = window.localStorage.getItem(chave)
        } catch {
          // storage bloqueado
        }
        if (!salvo) return
        const limpo = snapshotContratoListagem(
          new URLSearchParams(salvo),
          paramsPersistiveis,
        ).toString()
        if (limpo) window.localStorage.setItem(chave, limpo)
        else window.localStorage.removeItem(chave)
      }
    } catch {
      // Idem: persistência é conveniência, nunca requisito.
    }
  }, [
    searchParams,
    basePath,
    listagemId,
    paramsDoContrato,
    paramsPersistiveis,
    router,
    escopoChave,
  ])

  return null
}
