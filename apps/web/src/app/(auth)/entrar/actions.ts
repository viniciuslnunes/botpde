'use server'

import { db } from '@torcida/db'
import { nicknameSchema } from '@torcida/types'
import { signIn } from '@/lib/auth'
import { AuthError } from 'next-auth'
import { excedeuLimite } from '@/lib/rate-limit'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

export type LoginSenhaState = { message?: string; redirectTo?: string }

function signInRetornouErro(result: unknown): boolean {
  if (result == null || typeof result !== 'string') return true
  try {
    const url = new URL(result, 'http://local.invalid')
    return url.searchParams.has('error')
  } catch {
    return result.includes('error=')
  }
}

/**
 * signIn com redirect:false grava o cookie na resposta da Server Action;
 * o redirect() do servidor pode descartar esse cookie — o cliente navega depois.
 */
async function entrarComCredenciais(
  email: string,
  senha: string,
  redirectTo: string,
): Promise<LoginSenhaState> {
  try {
    const result = await signIn('credentials', {
      email,
      password: senha,
      redirect: false,
      redirectTo,
    })
    if (signInRetornouErro(result)) {
      return { message: 'E-mail ou senha inválidos.' }
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return { message: 'E-mail ou senha inválidos.' }
    }
    throw error
  }

  return { redirectTo }
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

  return entrarComCredenciais(email, senha, '/auth/contexto')
}

const contaSchema = z
  .object({
    nome: z.string().min(3, 'Nome deve ter ao menos 3 caracteres').max(100),
    nickname: nicknameSchema,
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
  redirectTo?: string
}

export async function criarContaComSenha(
  _prev: ContaState,
  formData: FormData,
): Promise<ContaState> {
  const raw = {
    nome: formData.get('nome') as string,
    nickname: formData.get('nickname') as string,
    email: formData.get('email') as string,
    senha: formData.get('senha') as string,
    confirmarSenha: formData.get('confirmarSenha') as string,
  }

  const parsed = contaSchema.safeParse(raw)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { nome, nickname, senha } = parsed.data
  const email = parsed.data.email.trim().toLowerCase()

  const [emailExistente, nickExistente] = await Promise.all([
    db.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    }),
    db.user.findFirst({
      where: { nickname },
      select: { id: true },
    }),
  ])
  if (emailExistente) {
    return { message: 'Já existe uma conta com este e-mail. Tente entrar.' }
  }
  if (nickExistente) {
    return { errors: { nickname: ['Este apelido já está em uso. Escolha outro.'] } }
  }

  const senhaHash = await bcrypt.hash(senha, 10)
  try {
    await db.user.create({ data: { nome, email, senhaHash, nickname } })
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : ''
    if (code === 'P2002') {
      return { message: 'E-mail ou apelido já cadastrado. Tente entrar ou escolha outro @.' }
    }
    throw err
  }

  // Router canônico: com nickname já definido → /onboarding (evita /definir-apelido).
  const login = await entrarComCredenciais(email, senha, '/auth/contexto')
  if (login.message) {
    return {
      message:
        'Conta criada, mas não foi possível entrar automaticamente. Use /entrar com seu e-mail e senha.',
    }
  }

  return login
}
