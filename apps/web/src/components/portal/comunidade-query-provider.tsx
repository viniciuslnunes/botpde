'use client'

import { type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 20 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined

/**
 * Client singleton — o layout e o feed (árvore client local, ver abaixo)
 * precisam do mesmo QueryClient senão prefetch/cache divergem.
 *
 * No servidor cada chamada devolve um client novo (não vazar dado entre
 * requests). Padrão do TanStack Query no App Router.
 */
export function getComunidadeQueryClient(): QueryClient {
  if (typeof window === 'undefined') return makeQueryClient()
  if (!browserQueryClient) browserQueryClient = makeQueryClient()
  return browserQueryClient
}

/**
 * Provider do feed. O layout envolve a Comunidade, mas o slot RSC `children`
 * é SSR'd à parte — `useQueryClient()` no feed/canal quebra no servidor
 * ("No QueryClient set") e o Next cai em client rendering. Por isso o
 * consumer client também envolve a si mesmo: mesma árvore, mesmo singleton.
 */
export function ComunidadeQueryProvider({ children }: { children: ReactNode }) {
  const client = getComunidadeQueryClient()
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
