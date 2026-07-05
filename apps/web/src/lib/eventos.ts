import { db } from '@torcida/db'
import { getAncestorTenantIds } from './hierarquia'

/**
 * Cláusula `where` do Prisma que decide quais eventos um associado enxerga:
 * eventos podem ser globais (sedeId nulo, valem pro tenant inteiro) ou
 * restritos a uma unidade específica dentro do próprio tenant (sedeId
 * preenchido, só quem tem vínculo com aquela unidade vê); eventos de
 * tenants ancestrais (sede-mãe) cascadeiam só quando globais dentro do
 * tenant de origem — um evento restrito a uma unidade da sede-mãe não diz
 * respeito a uma subsede/PDE diferente.
 */
export async function getEscopoEventosVisiveis(tenantId: string, userId: string | undefined) {
  const [membro, ancestrais] = await Promise.all([
    userId
      ? db.saasMembro.findUnique({
          where: { tenantId_userId: { tenantId, userId } },
          select: { sedeId: true },
        })
      : null,
    getAncestorTenantIds(tenantId),
  ])

  return {
    OR: [
      {
        tenantId,
        ...(membro?.sedeId
          ? { OR: [{ sedeId: null }, { sedeId: membro.sedeId }] }
          : { sedeId: null }),
      },
      ...(ancestrais.length > 0 ? [{ tenantId: { in: ancestrais }, sedeId: null }] : []),
    ],
  }
}
