'use client'

import { useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export interface ListagemPersistenciaProps {
  listagemId: string
  basePath: string
  /**
   * Nomes dos params que pertencem ao contrato da listagem (busca, ordenação,
   * paginação e filtros do spec). Só eles entram no snapshot — params de outra
   * natureza (aba, seção, período de gráfico) continuam sendo da URL.
   */
  paramsDoContrato: readonly string[]
  /**
   * Discriminador do escopo — normalmente o `tenantId`. Sem ele, o filtro de
   * unidade salvo numa torcida seria reaplicado em outra e a lista abriria
   * inexplicavelmente vazia.
   */
  escopoChave: string
}

const PREFIXO = 'torcida:listagem:'

/**
 * Guarda a última visão de uma listagem (filtros, ordenação, tamanho de página)
 * e a restaura quando o admin volta pela URL nua.
 *
 * Precedência é explícita: **a URL sempre ganha**. O snapshot só entra quando
 * nenhum param do contrato está presente — assim um link compartilhado nunca é
 * sobrescrito pelo filtro salvo de quem clicou. A restauração usa `replace`,
 * então não cria entrada nova no histórico, e acontece no máximo uma vez por
 * montagem: é isso que faz "Limpar tudo" realmente limpar em vez de ser
 * ressuscitado pelo snapshot no render seguinte.
 */
export function ListagemPersistencia({
  listagemId,
  basePath,
  paramsDoContrato,
  escopoChave,
}: ListagemPersistenciaProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const restaurado = useRef(false)

  useEffect(() => {
    const chave = `${PREFIXO}${escopoChave}:${listagemId}`
    const atuais = new URLSearchParams(searchParams.toString())
    const doContrato = new URLSearchParams()
    for (const nome of paramsDoContrato) {
      const valor = atuais.get(nome)
      if (valor !== null) doContrato.set(nome, valor)
    }
    const serializado = doContrato.toString()

    if (!restaurado.current) {
      restaurado.current = true
      if (serializado === '') {
        let salvo: string | null = null
        try {
          salvo = window.localStorage.getItem(chave)
        } catch {
          // Modo privativo / storage bloqueado: segue sem persistência.
        }
        if (salvo) {
          const destino = new URLSearchParams(atuais.toString())
          for (const [nome, valor] of new URLSearchParams(salvo).entries()) {
            if (!paramsDoContrato.includes(nome)) continue
            destino.set(nome, valor)
          }
          const qs = destino.toString()
          router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false })
          return
        }
      }
    }

    try {
      if (serializado) window.localStorage.setItem(chave, serializado)
      else window.localStorage.removeItem(chave)
    } catch {
      // Idem: persistência é conveniência, nunca requisito.
    }
  }, [searchParams, basePath, listagemId, paramsDoContrato, router, escopoChave])

  return null
}
