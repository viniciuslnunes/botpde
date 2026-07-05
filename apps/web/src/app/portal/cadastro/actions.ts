'use server'

import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'
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
    .pipe(
      z
        .number()
        .min(10, 'Idade mínima: 10 anos')
        .max(120, 'Idade inválida')
        .optional(),
    ),
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

  // Verifica se já existe um cadastro
  const existing = await db.saasMembro.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: session.user.id } },
    select: { id: true, status: true },
  })

  if (existing) {
    if (existing.status === 'APROVADO') {
      return { message: 'Você já é membro aprovado desta torcida.' }
    }
    if (existing.status === 'PENDENTE') {
      return { message: 'Seu cadastro já está em análise.' }
    }
    // REPROVADO — permite nova tentativa (atualiza o registro)
    await db.saasMembro.update({
      where: { id: existing.id },
      data: {
        nome: data.nome,
        tipo: data.tipo,
        idade: data.idade,
        telefone: data.telefone,
        cidade: data.cidade,
        discordTag: data.discordTag,
        sedeId,
        status: 'PENDENTE',
        aprovadoPorId: null,
        aprovadoPorNome: null,
        aprovadoEm: null,
      },
    })

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        atorId: session.user.id,
        acao: 'RECADASTRO_SOLICITADO',
        entidade: 'SaasMembro',
        entidadeId: existing.id,
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
      },
    })
  }

  revalidatePath('/portal')
  redirect('/portal?cadastro=enviado')
}
