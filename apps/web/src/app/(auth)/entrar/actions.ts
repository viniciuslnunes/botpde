'use server'

import { db } from '@torcida/db'
import { nicknameSchema, senhaCadastroSchema } from '@torcida/types'
import { signIn } from '@/lib/auth'
import { AuthError } from 'next-auth'
import { excedeuLimite } from '@/lib/rate-limit'
import { checarNicknameDisponivel } from '@/lib/nickname-disponivel'
import { excedeuLimitePublico, registrarUsoPublico } from '@/lib/public-rate-limit'
import { getClientIp } from '@/lib/request-ip'
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
  login: string,
  senha: string,
  redirectTo: string,
): Promise<LoginSenhaState> {
  try {
    const result = await signIn('credentials', {
      email: login,
      password: senha,
      redirect: false,
      redirectTo,
    })
    if (signInRetornouErro(result)) {
      return { message: 'E-mail, apelido ou senha inválidos.' }
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return { message: 'E-mail, apelido ou senha inválidos.' }
    }
    throw error
  }

  return { redirectTo }
}

export async function entrarComSenha(
  _prev: LoginSenhaState,
  formData: FormData,
): Promise<LoginSenhaState> {
  const login = (formData.get('email') as string)?.trim() ?? ''
  const senha = formData.get('senha') as string
  const rateKey = login.toLowerCase().replace(/^@+/, '')

  if (rateKey && excedeuLimite(rateKey)) {
    return { message: 'Muitas tentativas. Tente novamente em alguns minutos.' }
  }

  return entrarComCredenciais(login, senha, '/auth/contexto')
}

const contaSchema = z.object({
  nome: z.string().min(3, 'Nome deve ter ao menos 3 caracteres').max(100),
  nickname: nicknameSchema,
  email: z.string().email('E-mail inválido'),
  senha: senhaCadastroSchema,
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
  const ip = await getClientIp()
  if (excedeuLimitePublico('criarConta', ip)) {
    return {
      message: 'Muitas contas criadas deste dispositivo. Tente novamente mais tarde.',
    }
  }

  const raw = {
    nome: formData.get('nome') as string,
    nickname: formData.get('nickname') as string,
    email: formData.get('email') as string,
    senha: formData.get('senha') as string,
  }

  const parsed = contaSchema.safeParse(raw)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { nome, nickname, senha } = parsed.data
  const email = parsed.data.email.trim().toLowerCase()

  // Conta tentada de fato — conta no rate limit (só após dados válidos).
  registrarUsoPublico('criarConta', ip)

  const emailExistente = await db.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
  })
  if (emailExistente) {
    return { message: 'Já existe uma conta com este e-mail. Tente entrar.' }
  }

  const nickCheck = await checarNicknameDisponivel(nickname)
  if (!nickCheck.ok) {
    return { errors: { nickname: [nickCheck.motivo] } }
  }
  if (!nickCheck.disponivel) {
    return { errors: { nickname: [nickCheck.motivo] } }
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
