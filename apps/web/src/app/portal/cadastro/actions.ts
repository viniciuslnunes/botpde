'use server'

import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
import { diffCamposMembro } from '@/lib/membro-audit-diff'
import { estaBloqueadoNoTenant, REPROVACAO_LIMPA } from '@/lib/membros-sede'
import { notificarNovoMembroPendente } from '@/lib/notificacoes-routing'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const schema = z.object({
  nome: z.string().min(3, 'Nome deve ter ao menos 3 caracteres').max(100),
  tipo: z.enum(['SOCIO', 'TORCEDOR'], { message: 'Escolha um tipo de cadastro' }),
  idade: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined))
    .pipe(z.number().min(10, 'Idade mínima: 10 anos').max(120, 'Idade inválida').optional()),
  telefone: z
    .string()
    .max(20)
    .optional()
    .transform((v) => v || undefined),
  cidade: z
    .string()
    .max(60)
    .optional()
    .transform((v) => v || undefined),
  discordTag: z
    .string()
    .max(50)
    .optional()
    .transform((v) => v || undefined),
  sedeId: z
    .string()
    .optional()
    .transform((v) => v || undefined),
})

export type CadastroState = {
  errors?: Record<string, string[]>
  message?: string
}

export async function solicitarCadastro(
  _prev: CadastroState,
  formData: FormData,
): Promise<CadastroState> {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])

  if (!session?.user?.id) {
    return { message: 'Você precisa estar logado para se cadastrar.' }
  }

  if (!tenant) {
    return { message: 'Torcida não encontrada.' }
  }

  const raw = {
    nome: formData.get('nome') as string,
    tipo: formData.get('tipo') as string,
    idade: formData.get('idade') as string | undefined,
    telefone: formData.get('telefone') as string | undefined,
    cidade: formData.get('cidade') as string | undefined,
    discordTag: formData.get('discordTag') as string | undefined,
    sedeId: formData.get('sedeId') as string | undefined,
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const data = parsed.data

  // Vínculo territorial principal: se a torcida tem só uma unidade, usa ela
  // direto; se tem várias, exige que o associado tenha escolhido uma válida.
  const sedesDoTenant: { id: string }[] = await db.sede.findMany({
    where: { tenantId: tenant.id, ativa: true },
    select: { id: true },
  })

  let sedeId: string | undefined
  if (sedesDoTenant.length === 1) {
    sedeId = sedesDoTenant[0].id
  } else if (sedesDoTenant.length > 1) {
    if (!data.sedeId || !sedesDoTenant.some((s: { id: string }) => s.id === data.sedeId)) {
      return { errors: { sedeId: ['Selecione sua unidade'] } }
    }
    sedeId = data.sedeId
  }

  // Bloqueio da diretoria: barra mesmo sem cadastro anterior, e herda da Sede
  // para as unidades. Decisão sobre a pessoa, não sobre esta solicitação.
  if (await estaBloqueadoNoTenant(session.user.id, tenant.id)) {
    return {
      message:
        'A diretoria bloqueou seu acesso a esta torcida. Novas solicitações não são aceitas. Fale com a diretoria.',
    }
  }

  // Verifica se já existe um cadastro
  const existing: {
    id: string
    status: string
    reprovadoPermiteReenvio: boolean
    nome: string | null
    tipo: string | null
    idade: number | null
    telefone: string | null
    cidade: string | null
    discordTag: string | null
    sedeId: string | null
  } | null = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: session.user.id } },
    select: {
      id: true,
      status: true,
      reprovadoPermiteReenvio: true,
      nome: true,
      tipo: true,
      idade: true,
      telefone: true,
      cidade: true,
      discordTag: true,
      sedeId: true,
    },
  })

  if (existing) {
    if (existing.status === 'APROVADO') {
      return { message: 'Você já é membro aprovado desta torcida.' }
    }
    if (existing.status === 'PENDENTE') {
      return { message: 'Seu cadastro já está em análise.' }
    }
    if (!existing.reprovadoPermiteReenvio) {
      return {
        message:
          'A diretoria encerrou a análise deste cadastro e o reenvio está bloqueado. Fale com a torcida.',
      }
    }
    // REPROVADO — permite nova tentativa (atualiza o registro)
    const novosDados = {
      nome: data.nome,
      tipo: data.tipo,
      idade: data.idade,
      telefone: data.telefone,
      cidade: data.cidade,
      discordTag: data.discordTag,
      sedeId,
    }
    await db.saasMembro.update({
      where: { id: existing.id },
      data: {
        ...novosDados,
        departamentoId: data.tipo === 'TORCEDOR' ? null : undefined,
        status: 'PENDENTE',
        aprovadoPorId: null,
        aprovadoPorNome: null,
        aprovadoEm: null,
        ...REPROVACAO_LIMPA,
      },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'RECADASTRO_SOLICITADO',
        entidade: 'SaasMembro',
        entidadeId: existing.id,
        // O histórico do card precisa mostrar o que o solicitante corrigiu
        // após a reprovação, não só que houve reenvio.
        detalhes: { alteracoes: diffCamposMembro(existing, novosDados) },
      },
    })
  } else {
    const novo = await db.saasMembro.create({
      data: {
        tenantId: tenant.id,
        userId: session.user.id,
        nome: data.nome,
        tipo: data.tipo,
        idade: data.idade,
        telefone: data.telefone,
        cidade: data.cidade,
        discordTag: data.discordTag,
        sedeId,
        status: 'PENDENTE',
      },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'CADASTRO_SOLICITADO',
        entidade: 'SaasMembro',
        entidadeId: novo.id,
        detalhes: { origem: 'portal' },
      },
    })
  }

  await notificarNovoMembroPendente({
    tenantId: tenant.id,
    tenantNome: tenant.nome,
    solicitanteUserId: session.user.id,
    solicitanteNome: data.nome,
    tipoVinculo: data.tipo,
  })

  revalidatePath('/portal')
  redirect('/portal?cadastro=enviado')
}
