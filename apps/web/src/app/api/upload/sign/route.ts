import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { assertMembroAtivo, assertPermission } from '@/lib/authz'
import { getTenantFromHost } from '@/lib/tenant'
import { getCloudinaryConfig, signCloudinaryParams } from '@/lib/cloudinary'
import { db } from '@torcida/db'
import { PERMISSIONS } from '@torcida/types'
import { assertPodeEnviarNaConversa } from '@/lib/mensageria'

const purposeSchema = z.enum([
  'comunidade',
  'perfil-banner',
  'perfil-avatar',
  'cadastro',
  'sede',
  'mensagem',
])

const bodySchema = z.object({
  purpose: purposeSchema.optional(),
  tenantId: z.string().uuid().optional(),
  conversaId: z.string().uuid().optional(),
})

/**
 * Gera assinatura para upload direto ao Cloudinary.
 * purpose define a pasta de destino.
 * `cadastro` — onboarding (comprovante de vínculo), sem exigir membro ativo.
 * `sede` — foto de unidade; exige `SEDES_MANAGE`.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    let purpose: z.infer<typeof purposeSchema> = 'comunidade'
    let tenantIdCadastro: string | undefined
    let conversaId: string | undefined
    try {
      const body = bodySchema.parse(await request.json())
      purpose = body.purpose ?? 'comunidade'
      tenantIdCadastro = body.tenantId
      conversaId = body.conversaId
    } catch {
      purpose = 'comunidade'
    }

    const config = getCloudinaryConfig()
    if (!config) {
      return NextResponse.json(
        { error: 'O upload de arquivos ainda não foi configurado.' },
        { status: 501 },
      )
    }

    let folder: string

    if (purpose === 'cadastro') {
      if (!tenantIdCadastro) {
        return NextResponse.json({ error: 'Torcida inválida para upload.' }, { status: 400 })
      }
      const torcida = await db.tenant.findFirst({
        where: { id: tenantIdCadastro, ativo: true },
        select: { id: true },
      })
      if (!torcida) {
        return NextResponse.json({ error: 'Torcida não encontrada.' }, { status: 400 })
      }
      folder = `torcida/${torcida.id}/cadastro/${session.user.id}`
    } else if (purpose === 'sede') {
      const { tenant } = await assertPermission(PERMISSIONS.SEDES_MANAGE)
      folder = `torcida/${tenant.id}/sedes`
    } else if (purpose === 'mensagem') {
      if (!conversaId) {
        return NextResponse.json({ error: 'Conversa inválida para upload.' }, { status: 400 })
      }
      // Anexo de DM: autoriza por participação na conversa (`MembroConversa`),
      // não por vínculo de sócio no tenant — torcedor sem cadastro de associado
      // também pode anexar mídia em conversas das quais participa.
      const { membro } = await assertPodeEnviarNaConversa(conversaId, session.user.id)
      folder = `torcida/${membro.conversa.tenantId}/mensagens/${conversaId}`
    } else if (
      tenantIdCadastro
      && (purpose === 'perfil-banner' || purpose === 'perfil-avatar')
    ) {
      const torcida = await db.tenant.findFirst({
        where: { id: tenantIdCadastro, ativo: true },
        select: { id: true },
      })
      if (!torcida) {
        return NextResponse.json({ error: 'Torcida não encontrada.' }, { status: 404 })
      }
      await assertMembroAtivo(torcida.id, session.user.id)
      folder =
        purpose === 'perfil-banner'
          ? `torcida/${torcida.id}/perfis/${session.user.id}/banner`
          : `torcida/${torcida.id}/perfis/${session.user.id}/avatar`
    } else {
      const tenant = await getTenantFromHost()
      if (!tenant) {
        return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
      }
      await assertMembroAtivo(tenant.id, session.user.id)
      folder =
        purpose === 'comunidade'
          ? `torcida/${tenant.id}/comunidade`
          : purpose === 'perfil-banner'
            ? `torcida/${tenant.id}/perfis/${session.user.id}/banner`
            : `torcida/${tenant.id}/perfis/${session.user.id}/avatar`
    }

    const timestamp = Math.floor(Date.now() / 1000)
    const signature = signCloudinaryParams({ folder, timestamp }, config.apiSecret)

    return NextResponse.json({
      cloudName: config.cloudName,
      apiKey: config.apiKey,
      timestamp,
      folder,
      signature,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao autorizar upload.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
