import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { assertMembroAtivo, assertPermission } from '@/lib/authz'
import { getTenantFromHost } from '@/lib/tenant'
import { isSuperAdminEmail } from '@/lib/tenant-context'
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
  'patrimonio',
  'brecho',
  'clube-escudo',
  'loja',
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
 * `loja` — capa/produto da vitrine; exige `store:manage` (ou Super Admin),
 *   não vínculo de associado. Torcida sem liderança continua operável.
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
    } else if (purpose === 'clube-escudo') {
      // Catálogo de clubes é global (sem tenant): o gate é a allowlist de
      // super-admin, igual ao resto de `/super-admin`, não `assertPermission`.
      if (!session.user.email || !isSuperAdminEmail(session.user.email)) {
        return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
      }
      folder = 'catalogo/clubes'
    } else if (purpose === 'patrimonio') {
      const { tenant } = await assertPermission(PERMISSIONS.PATRIMONY_VIEW)
      folder = `torcida/${tenant.id}/patrimonio`
    } else if (purpose === 'brecho') {
      const { assertSocioBrecho } = await import('@/lib/brecho-escopo')
      const ctx = await assertSocioBrecho()
      folder = `torcida/${ctx.raizId}/brecho/${session.user.id}`
    } else if (purpose === 'loja') {
      // Capa e produto da loja: gate = `store:manage` no tenant da vitrine
      // (gestor / cargo de sistema / Super Admin). `perfil-banner` exige
      // associado ativo e bloqueava o operador da plataforma em torcida
      // sem presidente — a action `atualizarCapaLoja` já usa `podeGerirLoja`.
      if (tenantIdCadastro) {
        const torcida = await db.tenant.findFirst({
          where: { id: tenantIdCadastro, ativo: true },
          select: { id: true },
        })
        if (!torcida) {
          return NextResponse.json({ error: 'Torcida não encontrada.' }, { status: 404 })
        }
        const { podeGerirLoja } = await import('@/lib/loja-lojas')
        const pode = await podeGerirLoja(session.user.id, torcida.id, session.user.email)
        if (!pode) {
          return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
        }
        folder = `torcida/${torcida.id}/loja`
      } else {
        const { tenant } = await assertPermission(PERMISSIONS.STORE_MANAGE)
        folder = `torcida/${tenant.id}/loja`
      }
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
