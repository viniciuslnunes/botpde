import { NextResponse } from 'next/server'
import { db } from '@torcida/db'
import { reabrirCanal } from '@/lib/canal-restrito-mutacoes'

/**
 * R5 — materializa a reativação automática do canal restrito: solicitações
 * PENDENTES cujo prazo venceu sem resposta da liderança.
 *
 * Importante: este cron NÃO é o que garante a regra. A expiração já é derivada
 * na leitura (`lib/isolamento.ts`), então o canal volta sozinho mesmo se o
 * scheduler estiver fora do ar. O que roda aqui é o acerto do registro: zera a
 * flag, fecha a solicitação como EXPIRADA, audita e notifica os dois lados.
 * Idempotente — rodar duas vezes não produz efeito extra.
 *
 * Protegido por `CRON_SECRET` (Bearer), igual aos demais crons.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const vencidas: Array<{ tenantId: string; tenant: { nome: string; canalRestrito: boolean } }> =
    await db.solicitacaoReativacaoCanal.findMany({
      where: { status: 'PENDENTE', prazoEm: { lte: new Date() } },
      select: { tenantId: true, tenant: { select: { nome: true, canalRestrito: true } } },
    })

  const porTenant = new Map<string, string>()
  for (const v of vencidas) {
    if (!v.tenant.canalRestrito) continue
    porTenant.set(v.tenantId, v.tenant.nome)
  }

  for (const [tenantId, nome] of porTenant) {
    await reabrirCanal({
      tenantId,
      tenantNome: nome,
      atorId: null,
      acao: 'CANAL_REATIVACAO_EXPIRADA',
      statusSolicitacao: 'EXPIRADA',
      corpoNotificacao:
        'A solicitação da Sede não foi respondida no prazo e o canal foi reaberto automaticamente.',
    })
  }

  return NextResponse.json({ ok: true, reativados: porTenant.size })
}
