import { getOrCreateComunidadeNacionalTenant } from './comunidade-contexto'

/**
 * Tenant onde o aviso de desfecho ao denunciante é gravado.
 *
 * `Notificacao.tenantId` é não-nulo de propósito: `emitNotificacaoPing` chaveia
 * o realtime por tenant, e nulo degradaria o ping além de obrigar a auditar
 * todo filtro por tenant. Em denúncia de superfície global (praça de escopo
 * CLUBE) o dono semântico do aviso é o **tenant sintético da Comunidade
 * Nacional** do clube — é onde a pessoa vive a praça.
 *
 * Sem tenant e sem afiliação não há onde gravar: devolve `null` e o chamador
 * pula o aviso, em vez de inventar destino.
 */
export async function tenantParaAvisoDenuncia(denuncia: {
  tenantId: string | null
  afiliacaoId: string | null
}): Promise<string | null> {
  if (denuncia.tenantId) return denuncia.tenantId
  if (!denuncia.afiliacaoId) return null
  try {
    const sintetico = await getOrCreateComunidadeNacionalTenant(denuncia.afiliacaoId)
    return sintetico.id
  } catch {
    // A decisão de moderação já foi gravada — falha ao resolver o container do
    // aviso não pode derrubar a ação do moderador.
    return null
  }
}
