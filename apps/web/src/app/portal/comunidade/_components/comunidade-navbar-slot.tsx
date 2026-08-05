import { auth } from '@/lib/auth'
import { resolverContextoComunidade } from '@/lib/comunidade-contexto'
import { lerEscopoComunidadePersistido } from '@/lib/comunidade-escopo-cookie'
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
  const torcidaReal = ctx.torcidaReal
    ? {
        nome: ctx.torcidaReal.nome,
        corPrimaria: ctx.torcidaReal.corPrimaria,
        logoUrl: ctx.torcidaReal.logoUrl,
      }
    : ctx.modo === 'torcida'
      ? {
          nome: ctx.tenant.nome,
          corPrimaria: ctx.tenant.corPrimaria,
          logoUrl: ctx.tenant.logoUrl,
        }
      : null

  return (
    <>
      <ComunidadeEscopoNavbarOverride
        afiliacao={afiliacao}
        torcidaReal={torcidaReal}
        unidade={
          ctx.unidade
            ? { nome: ctx.unidade.nome, logoUrl: ctx.unidade.logoUrl }
            : null
        }
        escopos={ctx.escopos}
        modoContexto={ctx.modo}
        corPrimariaNacional={corPrimaria}
        tenantAtivoEhUnidade={ctx.modo === 'torcida' && Boolean(ctx.tenantAtivoEhUnidade)}
        escopoPersistido={await lerEscopoComunidadePersistido()}
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
