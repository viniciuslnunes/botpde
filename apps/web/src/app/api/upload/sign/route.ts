import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { assertMembroAtivo } from '@/lib/authz'
import { getTenantFromHost } from '@/lib/tenant'
import { getCloudinaryConfig, signCloudinaryParams } from '@/lib/cloudinary'

/**
 * Gera uma assinatura para upload direto ao Cloudinary (o arquivo vai do
 * navegador para o Cloudinary, não passa pelo nosso servidor). Protegido:
 * só membros ativos que podem publicar recebem assinatura.
 */
export async function POST() {
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

    const timestamp = Math.floor(Date.now() / 1000)
    const folder = `torcida/${tenant.id}/comunidade`
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
