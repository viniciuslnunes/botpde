/**
 * Roda todas as auditorias funcionais em sequência e consolida o resultado.
 *
 * Por que existe: já são 12 comandos `audit:*`, cada um com o seu relatório em
 * disco. Rodar um a um dá um retrato parcial e caro — e o que interessa antes
 * de um deploy é *uma* resposta: passou ou não, e o que ficou em aberto.
 *
 * Sequencial de propósito: todas batem no mesmo banco remoto, e várias mutam e
 * revertem. Em paralelo elas disputariam as mesmas linhas e produziriam
 * achados falsos.
 *
 * Falha do processo ≠ achado: uma auditoria pode falhar por banco fora do ar.
 * O resumo separa "encontrou problema" de "não conseguiu rodar".
 *
 * Uso:
 *   pnpm --filter @torcida/web audit:tudo
 *   pnpm --filter @torcida/web audit:tudo -- --rapidas   # pula as lentas
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `lenta` marca as que passam de ~3 min contra o banco remoto — no fluxo do
 * dia a dia dá para pular; antes de deploy, não.
 */
const AUDITORIAS = [
  { nome: 'dados', arquivo: 'dados-reais.audit.ts', relatorio: 'auditoria-dados-reais.txt' },
  { nome: 'fluxos', arquivo: 'fluxos.audit.ts', relatorio: 'auditoria-fluxos.txt', lenta: true },
  {
    nome: 'fluxos-avancados',
    arquivo: 'fluxos-avancados.audit.ts',
    relatorio: 'auditoria-fluxos-avancados.txt',
    lenta: true,
  },
  { nome: 'hierarquia', arquivo: 'hierarquia.audit.ts', relatorio: 'auditoria-hierarquia.txt' },
  { nome: 'notificacoes', arquivo: 'notificacoes.audit.ts', relatorio: 'auditoria-notificacoes.txt' },
  { nome: 'mensageria', arquivo: 'mensageria.audit.ts', relatorio: 'auditoria-mensageria.txt' },
  { nome: 'loja', arquivo: 'loja.audit.ts', relatorio: 'auditoria-loja.txt' },
  { nome: 'canal-restrito', arquivo: 'canal-restrito.audit.ts', relatorio: 'auditoria-canal-restrito.txt' },
  {
    nome: 'onboarding',
    arquivo: 'onboarding-comunidade.audit.ts',
    relatorio: 'audit-onboarding-comunidade.txt',
  },
  { nome: 'jornadas', arquivo: 'jornadas.audit.ts', relatorio: 'auditoria-jornadas.txt', lenta: true },
  {
    nome: 'areas-projetos',
    arquivo: 'areas-projetos.audit.ts',
    relatorio: 'auditoria-areas-projetos.txt',
  },
  {
    nome: 'carteirinha-patrimonio',
    arquivo: 'carteirinha-patrimonio.audit.ts',
    relatorio: 'auditoria-carteirinha-patrimonio.txt',
  },
  { nome: 'achados', arquivo: 'achados.audit.ts', relatorio: 'auditoria-achados.txt' },
]

const SO_RAPIDAS = process.argv.includes('--rapidas')
const alvos = SO_RAPIDAS ? AUDITORIAS.filter((a) => !a.lenta) : AUDITORIAS

/** Conta as linhas de cada nível no relatório em disco. */
function lerContagens(relatorio) {
  const caminho = join(process.cwd(), relatorio)
  if (!existsSync(caminho)) return null
  const texto = readFileSync(caminho, 'utf8')
  const pegar = (rotulo) => {
    const m = new RegExp(`${rotulo}[^:]*: (\\d+)`).exec(texto)
    return m ? Number(m[1]) : 0
  }
  return {
    erros: pegar('❌'),
    alertas: pegar('⚠️'),
    conformes: pegar('✅'),
  }
}

console.log(`\n🔍 Auditoria completa — ${alvos.length} suíte(s)${SO_RAPIDAS ? ' (só as rápidas)' : ''}\n`)

const resultados = []
const inicioGeral = Date.now()

for (const a of alvos) {
  const inicio = Date.now()
  process.stdout.write(`  ▶ ${a.nome}... `)
  const res = spawnSync(
    'npx',
    ['vitest', 'run', '--config', 'vitest.audit.config.ts', `src/lib/__audit__/${a.arquivo}`],
    { stdio: 'pipe', shell: true, encoding: 'utf8' },
  )
  const segundos = Math.round((Date.now() - inicio) / 1000)
  const contagens = lerContagens(a.relatorio)

  // Sem relatório em disco a suíte nem chegou a rodar (import quebrado, banco
  // fora, fixture ausente). É diferente de "rodou e achou problema".
  const executou = contagens !== null
  const status = !executou ? 'NÃO RODOU' : res.status === 0 ? 'ok' : 'ACHADOS'

  resultados.push({ ...a, status, contagens, segundos, saida: res.stdout ?? '' })
  const detalhe = contagens
    ? `${contagens.erros} erro(s), ${contagens.alertas} alerta(s), ${contagens.conformes} conforme(s)`
    : 'sem relatório'
  console.log(`${status === 'ok' ? '✅' : status === 'ACHADOS' ? '❌' : '⚠️ '} ${detalhe} · ${segundos}s`)
}

const totalMin = Math.round((Date.now() - inicioGeral) / 6000) / 10
console.log(`\n${'═'.repeat(70)}\nRESUMO (${totalMin} min)\n${'═'.repeat(70)}\n`)

const comAchados = resultados.filter((r) => r.status === 'ACHADOS')
const naoRodaram = resultados.filter((r) => r.status === 'NÃO RODOU')
const totais = resultados.reduce(
  (acc, r) => {
    if (!r.contagens) return acc
    acc.erros += r.contagens.erros
    acc.alertas += r.contagens.alertas
    acc.conformes += r.contagens.conformes
    return acc
  },
  { erros: 0, alertas: 0, conformes: 0 },
)

console.log(`   Conformes : ${totais.conformes}`)
console.log(`   Alertas   : ${totais.alertas}  (em aberto / não exercitado)`)
console.log(`   Erros     : ${totais.erros}`)

if (naoRodaram.length > 0) {
  console.log(`\n⚠️  ${naoRodaram.length} suíte(s) NÃO rodaram — isto não é "sem achados":`)
  for (const r of naoRodaram) console.log(`     ${r.nome}`)
}

if (comAchados.length > 0) {
  console.log(`\n❌ ${comAchados.length} suíte(s) com achados:`)
  for (const r of comAchados) {
    console.log(`\n   ── ${r.nome} (${r.relatorio}) ──`)
    const linhas = (r.saida.match(/^ {3}\[.+$/gm) ?? []).slice(0, 8)
    for (const l of linhas) console.log(`   ${l.trim()}`)
  }
  console.log('')
  process.exit(1)
}

console.log('\n✅ Nenhum achado. Os alertas acima são itens em aberto conhecidos.\n')
