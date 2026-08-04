/**
 * Senha padrão dos usuários sintéticos dos seeds de teste.
 *
 * Todo `User` criado por um seed de teste (`seed-corinthians-teste*`,
 * `seed-nacional-teste`, `seed-jornadas`) nasce com esta senha, para que dê
 * para **entrar como ele** em `/entrar` e conferir o produto de dentro —
 * feed, canais, permissões, carteirinha. Sem isso o `senhaHash` ficava nulo e
 * o provider de credenciais (`apps/web/src/lib/auth.ts`) recusava o login.
 *
 * O hash é gerado uma vez por processo e **reusado em todos os usuários** do
 * lote: são milhares de linhas e o bcrypt custa ~80ms cada. Compartilhar o
 * salt entre contas sintéticas não tem consequência — a senha é pública neste
 * arquivo e nenhum desses e-mails existe fora do domínio de teste.
 *
 * ⚠️ Só use em usuário de domínio de teste. `repair-senha-teste.js` recusa
 * qualquer e-mail que não case com `EMAIL_TESTE_REGEX`.
 */
import bcrypt from 'bcryptjs'

export const SENHA_TESTE = 'm1k43l3n'

/** Domínios sintéticos reconhecidos como "usuário de seed". */
export const DOMINIOS_TESTE = [
  'teste.corinthians.torcida.app',
  'teste.nacional.torcida.app',
  'jornada.torcida.app',
]

/** Casa qualquer e-mail dos domínios acima. Guard do repair e do reset. */
export const EMAIL_TESTE_REGEX = new RegExp(
  `@(${DOMINIOS_TESTE.map((d) => d.replace(/\./g, '\\.')).join('|')})$`,
  'i',
)

export function isEmailTeste(email) {
  return typeof email === 'string' && EMAIL_TESTE_REGEX.test(email.trim())
}

let cache = null

/**
 * Hash bcrypt de `SENHA_TESTE`. Síncrono de propósito: os seeds montam arrays
 * grandes para `createMany` e um `await` por linha dobraria o tempo do lote.
 *
 * @returns {string}
 */
export function senhaHashTeste() {
  if (cache) return cache
  cache = bcrypt.hashSync(SENHA_TESTE, 10)
  return cache
}
