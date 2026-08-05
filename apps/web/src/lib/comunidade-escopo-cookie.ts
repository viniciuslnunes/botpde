import 'server-only'

import { cookies } from 'next/headers'
import { isProd } from '@/lib/env'
import { sharedCookieOptions } from '@/lib/session-cookie'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'

/**
 * Última aba-escudo aberta na Comunidade (nacional / torcida / unidade).
 *
 * O escopo vive na query (`?escopo=`) e só existe dentro de
 * `/portal/comunidade`. Agenda, Sedes e Loja ficam fora dessa rota — sem este
 * cookie o header voltava ao clube (CN) no primeiro clique da topbar, mesmo
 * com a unidade selecionada. Cookie próprio, como `operador_canais_abertos`:
 * **não** é sessão de tenant e não decide permissão nenhuma — é preferência de
 * navegação (qual canal a pessoa está lendo), sempre revalidada por
 * `resolverEscopoComunidadePorModo` contra os escopos que ela realmente tem.
 */
export const COMUNIDADE_ESCOPO_COOKIE = 'comunidade_escopo'

function ehEscopo(valor: string | undefined): valor is EscopoComunidade {
  return valor === 'nacional' || valor === 'torcida' || valor === 'unidade'
}

export async function lerEscopoComunidadePersistido(): Promise<EscopoComunidade | null> {
  const store = await cookies()
  const raw = store.get(COMUNIDADE_ESCOPO_COOKIE)?.value?.trim()
  return ehEscopo(raw) ? raw : null
}

export async function gravarEscopoComunidade(escopo: EscopoComunidade): Promise<void> {
  const store = await cookies()
  store.set(COMUNIDADE_ESCOPO_COOKIE, escopo, {
    ...sharedCookieOptions(isProd),
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
  })
}
