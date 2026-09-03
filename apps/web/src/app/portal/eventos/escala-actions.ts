'use server'

import { db } from '@torcida/db'
import { revalidatePath } from 'next/cache'
import { FUNCAO_ESCALA_LABEL, PERMISSIONS } from '@torcida/types'
import { auth } from '@/lib/auth'
import { getActiveTenant } from '@/lib/tenant'
import { assertMembroAtivo } from '@/lib/authz'
import { invalidateAdminDirecao } from '@/lib/admin-direcao-cache'
import { hrefAdminEvento, slugDepartamentoDoEvento } from '@/lib/eventos-admin-href'
import { notificarUsuariosComPermissao } from '@/lib/notificacoes'

/**
 * Resposta do escalado — o outro lado da convocação. Sem isto a escala seria
 * uma lista de nomes que o gestor torce para estarem certos; com ela, silêncio
 * perto do evento vira pendência no posto de comando.
 *
 * Gate é ser **a própria pessoa** convocada, não uma permissão: aceitar um
 * posto é ato de quem vai cumpri-lo.
 */

export type ResponderEscalaResult = { ok: true; status: string } | { ok: false; error: string }

export async function responderConvocacaoEscala(
  escalaId: string,
  aceita: boolean,
): Promise<ResponderEscalaResult> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: 'Não autenticado' }
  const tenant = await getActiveTenant(session.user.id, session.user.email)
  if (!tenant) return { ok: false, error: 'Torcida não encontrada' }

  await assertMembroAtivo(tenant.id, session.user.id)

  type EscalaComEvento = {
    id: string
    userId: string
    status: string
    funcao: string
    eventoId: string
    evento: {
      id: string
      tipo: string
      titulo: string
      data: Date
      departamento: { slug: string } | null
      projeto: { departamento: { slug: string } | null } | null
    }
  }

  const escala: EscalaComEvento | null = (await db.eventoEscala.findFirst({
    where: { id: escalaId, tenantId: tenant.id },
    select: {
      id: true,
      userId: true,
      status: true,
      funcao: true,
      eventoId: true,
      evento: {
        select: {
          id: true,
          tipo: true,
          titulo: true,
          data: true,
          departamento: { select: { slug: true } },
          projeto: { select: { departamento: { select: { slug: true } } } },
        },
      },
    },
  })) as EscalaComEvento | null

  if (!escala) return { ok: false, error: 'Convocação não encontrada' }
  if (escala.userId !== session.user.id) {
    return { ok: false, error: 'Esta convocação é de outra pessoa' }
  }
  if (escala.status === 'SUBSTITUIDO') {
    return { ok: false, error: 'Você já foi substituído neste posto' }
  }
  if (escala.evento.data.getTime() < Date.now()) {
    return { ok: false, error: 'Operação já encerrada' }
  }

  const status = aceita ? 'ACEITO' : 'RECUSADO'

  await db.eventoEscala.update({
    where: { id: escala.id },
    data: { status, respondidoEm: new Date() },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'EVENTO_ESCALA_RESPONDIDA',
      entidade: 'EventoEscala',
      entidadeId: escala.id,
      detalhes: {
        eventoId: escala.eventoId,
        funcao: escala.funcao,
        de: escala.status,
        para: status,
      },
    },
  })

  // Recusa é o que muda o dia de quem monta a operação: avisa quem gere.
  if (!aceita) {
    const nome = session.user.name ?? 'Alguém'
    const funcaoLabel =
      FUNCAO_ESCALA_LABEL[escala.funcao as keyof typeof FUNCAO_ESCALA_LABEL] ?? escala.funcao
    await notificarUsuariosComPermissao(PERMISSIONS.EVENTS_MANAGE, {
      tenantId: tenant.id,
      tipo: 'ESCALA_RESPONDIDA',
      titulo: 'Posto vago na escala',
      corpo: `${nome} recusou ${funcaoLabel} em “${escala.evento.titulo}”.`,
      link: hrefAdminEvento({
        id: escala.evento.id,
        tipo: escala.evento.tipo,
        departamentoSlug: slugDepartamentoDoEvento(escala.evento),
      }),
      atorId: session.user.id,
      excetoUserId: session.user.id,
    })
  }

  invalidateAdminDirecao(tenant.id)
  revalidatePath(`/portal/eventos/${escala.eventoId}`)
  revalidatePath('/portal/eventos')
  revalidatePath(`/admin/eventos/${escala.eventoId}`)

  return { ok: true, status }
}
