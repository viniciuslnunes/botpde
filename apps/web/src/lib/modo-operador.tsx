'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * Modo operador: super-admin navegando uma torcida onde **não** tem
 * `SaasMembro` APROVADO. Lê tudo (canais, perfis, posts, sem precisar
 * solicitar entrada) e não escreve nada.
 *
 * Aqui é só a camada cosmética — desabilitar o que não vai funcionar em vez de
 * deixar a pessoa clicar e tomar erro. A trava real é servidor-side
 * (`assertVozComunidade` / `assertNaoOperador` / `resolverContextoEngajamento`
 * em `lib/authz.ts`); este contexto nunca é o critério de autorização.
 */
const ModoOperadorContext = createContext(false)

export function ModoOperadorProvider({
  ativo,
  children,
}: {
  ativo: boolean
  children: ReactNode
}) {
  return <ModoOperadorContext.Provider value={ativo}>{children}</ModoOperadorContext.Provider>
}

/** `true` quando o viewer está operando a torcida sem vínculo (só leitura). */
export function useModoOperador(): boolean {
  return useContext(ModoOperadorContext)
}

export const AVISO_MODO_OPERADOR =
  'Modo operador: você navega esta torcida como super-admin e não pode publicar, comentar ou reagir.'

/**
 * Faixa de leitura da Comunidade — mesma linguagem da faixa do `/admin`
 * ("Modo operador — gerenciando X"). Some sozinha para quem tem vínculo.
 */
export function ModoOperadorAviso() {
  if (!useModoOperador()) return null

  return (
    <p
      role="status"
      className="mb-4 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--background-subtle))] px-3 py-2 text-xs text-[rgb(var(--foreground-muted))]"
    >
      {AVISO_MODO_OPERADOR}
    </p>
  )
}
