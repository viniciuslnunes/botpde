/**
 * Aplica a senha padrão de teste (`SENHA_TESTE`) em todo usuário sintético que
 * ainda está sem `senhaHash` — os lotes semeados antes desta convenção.
 *
 * Os seeds gravam `senhaHash` na criação; este repair existe para o que já
 * está no banco. Sem ele, ~2400 usuários de teste ficam impossíveis de logar
 * e nenhum cenário pode ser conferido "de dentro".
 *
 * Guard: só toca em e-mail que casa `EMAIL_TESTE_REGEX` (domínios sintéticos).
 * Nenhuma conta real muda de senha, nem com `--forcar`.
 *
 * Uso:
 *   pnpm --filter @torcida/db db:senha-teste -- --dry-run
 *   pnpm --filter @torcida/db db:senha-teste
 *   pnpm --filter @torcida/db db:senha-teste -- --forcar   # regrava quem já tem hash
 */
import { db } from '../src/index.js'
import { DOMINIOS_TESTE, SENHA_TESTE, senhaHashTeste } from './lib/senha-teste.js'

const DRY_RUN = process.argv.includes('--dry-run')
const FORCAR = process.argv.includes('--forcar')
const LOTE = 200

async function main() {
  console.log(`${DRY_RUN ? '[dry-run] ' : ''}Senha de teste nos usuários sintéticos\n`)
  console.log(`Domínios cobertos: ${DOMINIOS_TESTE.join(', ')}`)
  console.log(`Senha: ${SENHA_TESTE}${FORCAR ? ' (--forcar: regrava quem já tem hash)' : ''}\n`)

  const hash = senhaHashTeste()
  let total = 0

  for (const dominio of DOMINIOS_TESTE) {
    const where = {
      email: { endsWith: `@${dominio}` },
      ...(FORCAR ? {} : { senhaHash: null }),
    }
    const alvos = await db.user.findMany({ where, select: { id: true } })
    if (alvos.length === 0) {
      console.log(`  ↔  @${dominio}: nada a fazer`)
      continue
    }
    if (DRY_RUN) {
      console.log(`  [dry-run] @${dominio}: ${alvos.length} usuário(s) receberiam a senha`)
      total += alvos.length
      continue
    }

    let feitos = 0
    for (let i = 0; i < alvos.length; i += LOTE) {
      const ids = alvos.slice(i, i + LOTE).map((u) => u.id)
      const res = await db.user.updateMany({ where: { id: { in: ids } }, data: { senhaHash: hash } })
      feitos += res.count
    }
    console.log(`  ✅ @${dominio}: ${feitos} usuário(s) com senha`)
    total += feitos
  }

  // Contas sintéticas sem e-mail não existem hoje, mas se surgirem o login por
  // credenciais é impossível de qualquer jeito — vale reportar, não corrigir.
  const semEmail = await db.user.count({ where: { email: null } })
  if (semEmail > 0) {
    console.log(`\n  ⚠️  ${semEmail} usuário(s) sem e-mail (só OAuth) — login por senha não se aplica`)
  }

  console.log(`\n🎉 ${DRY_RUN ? 'Simulação' : 'Concluído'}: ${total} usuário(s).`)
  if (!DRY_RUN && total > 0) {
    const exemplo = await db.user.findFirst({
      where: { email: { endsWith: `@${DOMINIOS_TESTE[0]}` }, senhaHash: { not: null } },
      select: { email: true },
    })
    if (exemplo) console.log(`   Entre em /entrar com: ${exemplo.email} / ${SENHA_TESTE}`)
  }
}

main()
  .catch((err) => {
    console.error('❌ Erro:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
