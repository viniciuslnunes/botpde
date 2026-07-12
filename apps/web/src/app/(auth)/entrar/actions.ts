'use server'

import { db } from '@torcida/db'
import { signIn } from '@/lib/auth'
import { AuthError } from 'next-auth'
import { redirect } from 'next/navigation'
import { excedeuLimite } from '@/lib/rate-limit'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

export type LoginSenhaState = { message?: string }

/** signIn em Server Action: grava cookie com redirect:false e navega depois. */
async function entrarComCredenciais(email: string, senha: string): Promise<LoginSenhaState> {
  try {
    const result = await signIn('credentials', {
      email,
      password: senha,
      redirect: false,
      redirectTo: '/auth/contexto',
    })
    if (typeof result === 'string' && result.includes('error=')) {
      return { message: 'E-mail ou senha inválidos.' }
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return { message: 'E-mail ou senha inválidos.' }
    }
    throw error
  }

  redirect('/auth/contexto')
}

export async function entrarComSenha(
  _prev: LoginSenhaState,
  formData: FormData,
): Promise<LoginSenhaState> {
  const email = (formData.get('email') as string)?.trim().toLowerCase()
  const senha = formData.get('senha') as string

  if (email && excedeuLimite(email)) {
    return { message: 'Muitas tentativas com este e-mail. Tente novamente em alguns minutos.' }
  }

  return entrarComCredenciais(email, senha)
}

const contaSchema = z
  .object({
    nome: z.string().min(3, 'Nome deve ter ao menos 3 caracteres').max(100),
    email: z.string().email('E-mail inválido'),
    senha: z.string().min(8, 'A senha deve ter ao menos 8 caracteres').max(72),
    confirmarSenha: z.string(),
  })
  .refine((data) => data.senha === data.confirmarSenha, {
    message: 'As senhas não coincidem',
    path: ['confirmarSenha'],
  })

export type ContaState = {
  errors?: Record<string, string[]>
  message?: string
}

export async function criarContaComSenha(
  _prev: ContaState,
  formData: FormData,
): Promise<ContaState> {
  const raw = {
    nome: formData.get('nome') as string,
    email: formData.get('email') as string,
    senha: formData.get('senha') as string,
    confirmarSenha: formData.get('confirmarSenha') as string,
  }

  const parsed = contaSchema.safeParse(raw)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { nome, senha } = parsed.data
  const email = parsed.data.email.trim().toLowerCase()

  const existente = await db.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
  })
  if (existente) {
    return { message: 'Já existe uma conta com este e-mail. Tente entrar.' }
  }

  const senhaHash = await bcrypt.hash(senha, 10)
  await db.user.create({ data: { nome, email, senhaHash } })

  const login = await entrarComCredenciais(email, senha)
  if (login.message) {
    return {
      message:
        'Conta criada, mas não foi possível entrar automaticamente. Use /entrar com seu e-mail e senha.',
    }
  }

  return login
}
