'use server'

import { db } from '@torcida/db'
import { signIn } from '@/lib/auth'
import { AuthError } from 'next-auth'
import { excedeuLimite, registrarTentativaFalha } from '@/lib/rate-limit'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

export type LoginSenhaState = { message?: string }

export async function entrarComSenha(
  _prev: LoginSenhaState,
  formData: FormData,
): Promise<LoginSenhaState> {
  const email = formData.get('email') as string
  const senha = formData.get('senha') as string

  if (email && excedeuLimite(email)) {
    return { message: 'Muitas tentativas com este e-mail. Tente novamente em alguns minutos.' }
  }

  try {
    // Em caso de sucesso, signIn() lança um redirect (NEXT_REDIRECT) que sai
    // desta função pelo `throw error` abaixo — não há linha "depois do
    // sucesso" pra limpar o contador aqui. O contador expira sozinho na
    // janela de tempo (ver rate-limit.ts), então algumas tentativas erradas
    // seguidas de acerto só custam ao usuário legítimo um pouco de margem
    // pelos minutos seguintes — sem impacto de segurança real.
    await signIn('credentials', { email, password: senha, redirectTo: '/portal' })
  } catch (error) {
    // AuthError = falha de autenticação real (e-mail/senha inválidos).
    // Qualquer outro erro (inclusive o redirect de sucesso) deve propagar.
    if (error instanceof AuthError) {
      if (email) registrarTentativaFalha(email)
      return { message: 'E-mail ou senha inválidos.' }
    }
    throw error
  }

  return {}
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

  const { nome, email, senha } = parsed.data

  // Não mescla com conta OAuth existente do mesmo e-mail — evita que alguém
  // "tome" uma conta Discord/Google só sabendo o e-mail dela.
  const existente = await db.user.findUnique({ where: { email } })
  if (existente) {
    return { message: 'Já existe uma conta com este e-mail. Tente entrar.' }
  }

  const senhaHash = await bcrypt.hash(senha, 10)
  await db.user.create({ data: { nome, email, senhaHash } })

  await signIn('credentials', { email, password: senha, redirectTo: '/portal' })
  return {}
}
