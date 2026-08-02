import { auth } from '@/lib/auth'
import { resolverContextoComunidade } from '@/lib/comunidade-contexto'
import { ComunidadeEscopoNavbarOverride } from './comunidade-escopo-navbar-override'
import { ComunidadeNacionalPaletaSync } from './comunidade-nacional-paleta-sync'

/**
 * Override de marca da navbar no escopo Nacional + sync da paleta do clube.
 * Slot próprio para o layout seguir síncrono (ver `comunidade-aside-slot`);
 * ambos são efeitos, então chegar por streaming não muda nada visualmente.
 */
export async function ComunidadeNavbarSlot() {
  const session = await auth()
  if (!session?.user?.id) return null

  const ctx = await resolverContextoComunidade(session.user.id, session.user.email)
  if (!ctx) return null

  const afiliacao = ctx.afiliacao
  const corPrimaria = ctx.tenantSintetico?.corPrimaria ?? null

  return (
    <>
      <ComunidadeEscopoNavbarOverride
        afiliacao={afiliacao}
        podeEscopoTorcida={ctx.podeEscopoTorcida}
        modoContexto={ctx.modo}
        corPrimaria={corPrimaria}
      />
      {afiliacao && corPrimaria ? (
        <ComunidadeNacionalPaletaSync
          afiliacaoId={afiliacao.id}
          escudoUrl={afiliacao.escudoUrl}
          corPrimariaAtual={corPrimaria}
        />
      ) : null}
    </>
  )
}
