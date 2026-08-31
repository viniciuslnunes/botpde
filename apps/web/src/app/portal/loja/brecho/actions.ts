'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import {
  AtualizarBrechoAnuncioSchema,
  AtualizarBrechoLojaSchema,
  CriarBrechoAnuncioSchema,
  CriarBrechoLojaSchema,
  DenunciaBrechoSchema,
} from '@torcida/types'
import { assertSocioBrecho } from '@/lib/brecho-escopo'
import {
  atualizarAnuncioBrecho,
  atualizarCamposLojaBrecho,
  atualizarCapaLojaBrecho,
  confirmarTrocaBrecho,
  criarAnuncioBrecho,
  demonstrarInteresseBrecho,
  upsertLojaBrecho,
} from '@/lib/brecho'
import { denunciarBrecho } from '@/lib/brecho-ticket'

export type BrechoActionState = { error?: string; ok?: boolean }

function formString(fd: FormData, key: string): string {
  return String(fd.get(key) ?? '').trim()
}

export async function salvarMinhaLojaBrecho(formData: FormData): Promise<BrechoActionState> {
  const ctx = await assertSocioBrecho()
  const parsed = CriarBrechoLojaSchema.safeParse({
    nome: formString(formData, 'nome'),
    bio: formString(formData, 'bio') || null,
    fotoUrl: formString(formData, 'fotoUrl') || null,
    capaUrl: formString(formData, 'capaUrl') || null,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  await upsertLojaBrecho(ctx, parsed.data)
  revalidatePath('/portal/loja')
  revalidatePath('/portal/loja/brecho')
  revalidatePath('/portal/loja/brecho/lojas')
  revalidatePath(`/portal/loja/brecho/lojas/${ctx.userId}`)
  revalidatePath('/portal/loja/brecho/minha-loja')
  return { ok: true }
}

const CapaBrechoSchema = z.object({
  capaUrl: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null))
    .pipe(z.union([z.string().url('URL da capa inválida'), z.null()])),
})

/** Foto quadrada / nome da vitrine P2P — só o dono. */
export async function atualizarIdentidadeBrecho(input: {
  nome?: string
  fotoUrl?: string | null
}): Promise<BrechoActionState> {
  try {
    const ctx = await assertSocioBrecho()
    const parsed = AtualizarBrechoLojaSchema.safeParse({
      nome: input.nome,
      fotoUrl: input.fotoUrl === '' ? null : input.fotoUrl,
    })
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
    }
    if (parsed.data.nome === undefined && parsed.data.fotoUrl === undefined) {
      return { error: 'Nada para atualizar.' }
    }
    const origem = parsed.data.nome !== undefined ? 'nome' : 'foto'
    await atualizarCamposLojaBrecho(ctx, parsed.data, origem)
    revalidatePath('/portal/loja')
    revalidatePath('/portal/loja/brecho')
    revalidatePath('/portal/loja/brecho/lojas')
    revalidatePath(`/portal/loja/brecho/lojas/${ctx.userId}`)
    revalidatePath('/portal/loja/brecho/minha-loja')
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível salvar.' }
  }
}

/** Capa da vitrine P2P — só o dono da loja (sócio da praça). */
export async function atualizarCapaBrecho(capaUrl: string | null): Promise<BrechoActionState> {
  try {
    const ctx = await assertSocioBrecho()
    const parsed = CapaBrechoSchema.safeParse({ capaUrl: capaUrl ?? '' })
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
    }
    await atualizarCapaLojaBrecho(ctx, parsed.data.capaUrl)
    revalidatePath('/portal/loja')
    revalidatePath('/portal/loja/brecho')
    revalidatePath('/portal/loja/brecho/lojas')
    revalidatePath(`/portal/loja/brecho/lojas/${ctx.userId}`)
    revalidatePath('/portal/loja/brecho/minha-loja')
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível salvar a capa.' }
  }
}

export async function criarAnuncioBrechoAction(formData: FormData): Promise<BrechoActionState> {
  const ctx = await assertSocioBrecho()
  let imagensUrl: string[] = []
  try {
    const raw = formString(formData, 'imagensUrlJson')
    if (raw) imagensUrl = JSON.parse(raw) as string[]
  } catch {
    imagensUrl = []
  }
  const foto = formString(formData, 'fotoUrl')
  if (foto && imagensUrl.length === 0) imagensUrl = [foto]

  const parsed = CriarBrechoAnuncioSchema.safeParse({
    titulo: formString(formData, 'titulo'),
    descricao: formString(formData, 'descricao'),
    modalidade: formString(formData, 'modalidade'),
    categoria: formString(formData, 'categoria'),
    tamanho: formString(formData, 'tamanho') || null,
    preco: formString(formData, 'preco') || undefined,
    aceitoTroca: formString(formData, 'aceitoTroca') || null,
    imagensUrl,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Anúncio inválido.' }
  }
  const criado = await criarAnuncioBrecho(ctx, parsed.data)
  revalidatePath('/portal/loja/brecho')
  revalidatePath('/portal/loja/brecho/minha-loja')
  redirect(`/portal/loja/brecho/${criado.id}`)
}

export async function atualizarAnuncioBrechoAction(formData: FormData): Promise<BrechoActionState> {
  const ctx = await assertSocioBrecho()
  const id = formString(formData, 'id')
  if (!id) return { error: 'Anúncio inválido.' }
  let imagensUrl: string[] | undefined
  const raw = formString(formData, 'imagensUrlJson')
  if (raw) {
    try {
      imagensUrl = JSON.parse(raw) as string[]
    } catch {
      imagensUrl = undefined
    }
  }
  const parsed = AtualizarBrechoAnuncioSchema.safeParse({
    titulo: formString(formData, 'titulo') || undefined,
    descricao: formString(formData, 'descricao') || undefined,
    modalidade: formString(formData, 'modalidade') || undefined,
    categoria: formString(formData, 'categoria') || undefined,
    tamanho: formString(formData, 'tamanho') || null,
    preco: formString(formData, 'preco') || undefined,
    aceitoTroca: formString(formData, 'aceitoTroca') || null,
    imagensUrl,
    status: formString(formData, 'status') || undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Anúncio inválido.' }
  }
  await atualizarAnuncioBrecho(ctx, id, parsed.data)
  revalidatePath('/portal/loja/brecho')
  revalidatePath(`/portal/loja/brecho/${id}`)
  revalidatePath('/portal/loja/brecho/minha-loja')
  return { ok: true }
}

export async function interessarBrechoAction(anuncioId: string): Promise<{
  error?: string
  conversaId?: string
}> {
  try {
    const ctx = await assertSocioBrecho()
    const r = await demonstrarInteresseBrecho(ctx, anuncioId)
    return { conversaId: r.conversaId }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível demonstrar interesse.' }
  }
}

export async function confirmarTrocaBrechoAction(interesseId: string): Promise<BrechoActionState> {
  try {
    const ctx = await assertSocioBrecho()
    await confirmarTrocaBrecho(ctx, interesseId)
    revalidatePath('/portal/loja/brecho')
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível confirmar.' }
  }
}

export async function denunciarBrechoAction(formData: FormData): Promise<BrechoActionState> {
  try {
    const ctx = await assertSocioBrecho()
    const parsed = DenunciaBrechoSchema.safeParse({
      motivo: formString(formData, 'motivo'),
      anuncioId: formString(formData, 'anuncioId') || undefined,
      lojaUserId: formString(formData, 'lojaUserId') || undefined,
      interesseId: formString(formData, 'interesseId') || undefined,
    })
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Denúncia inválida.' }
    }
    await denunciarBrecho(ctx, parsed.data)
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível enviar a denúncia.' }
  }
}

export async function atualizarLojaBrechoAction(formData: FormData): Promise<BrechoActionState> {
  const ctx = await assertSocioBrecho()
  const parsed = AtualizarBrechoLojaSchema.safeParse({
    nome: formString(formData, 'nome') || undefined,
    bio: formString(formData, 'bio') || null,
    fotoUrl: formString(formData, 'fotoUrl') || null,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  await upsertLojaBrecho(ctx, {
    nome: parsed.data.nome ?? 'Minha loja',
    bio: parsed.data.bio,
    fotoUrl: parsed.data.fotoUrl,
    capaUrl: parsed.data.capaUrl,
  })
  revalidatePath('/portal/loja')
  revalidatePath('/portal/loja/brecho/lojas')
  revalidatePath(`/portal/loja/brecho/lojas/${ctx.userId}`)
  revalidatePath('/portal/loja/brecho/minha-loja')
  return { ok: true }
}
