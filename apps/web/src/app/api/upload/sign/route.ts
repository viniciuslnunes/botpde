import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { assertMembroAtivo } from '@/lib/authz'
import { getTenantFromHost } from '@/lib/tenant'
import { getCloudinaryConfig, signCloudinaryParams } from '@/lib/cloudinary'

const purposeSchema = z.enum(['comunidade', 'perfil-banner', 'perfil-avatar']).default('comunidade')

/**
 * Gera assinatura para upload direto ao Cloudinary.
 * purpose define a pasta de destino.
 */
export async function POST(request: NextRequest) {
  try {
    const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
    if (!session?.user?.id || !tenant) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }
    await assertMembroAtivo(tenant.id, session.user.id)

    const config = getCloudinaryConfig()
    if (!config) {
      return NextResponse.json(
        { error: 'O upload de arquivos ainda não foi configurado.' },
        { status: 501 },
      )
    }

    let purpose: z.infer<typeof purposeSchema> = 'comunidade'
    try {
      const body = (await request.json()) as { purpose?: string }
      purpose = purposeSchema.parse(body.purpose ?? 'comunidade')
    } catch {
      purpose = 'comunidade'
    }

    const folder =
      purpose === 'comunidade'
        ? `torcida/${tenant.id}/comunidade`
        : purpose === 'perfil-banner'
          ? `torcida/${tenant.id}/perfis/${session.user.id}/banner`
          : `torcida/${tenant.id}/perfis/${session.user.id}/avatar`

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
