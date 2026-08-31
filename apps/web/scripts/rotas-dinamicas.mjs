/**
 * Resolve rotas dinamicas REAIS a partir do banco, para a auditoria de
 * responsividade.
 *
 * Por que nao descobrir pela UI: a auditoria varria a listagem procurando
 * `<a href>` para a rota de detalhe e achava quase nada. A causa nao era falta
 * de dado semeado — era a premissa:
 *
 *   - `/portal/comunidade/canais` abre o canal com `<button>` + `router.push`
 *     (`AbrirCanalNaBarraLink`), entao nao existe `<a href>` no DOM;
 *   - `/portal/sedes` e master-detail na propria pagina (`selectedId` em
 *     estado) e NADA no app aponta para `/portal/sedes/[id]`;
 *   - `/admin/torcedores/[id]` so e linkado de DENTRO do modal de membro.
 *
 * Varrer a listagem nunca ia funcionar. Aqui os ids saem do banco, que e a
 * fonte de verdade — e rota dinamica com dado real e justamente onde nome de
 * membro / titulo de evento define a largura e estoura o layout.
 *
 *   node scripts/rotas-dinamicas.mjs            # imprime as rotas
 *   node scripts/rotas-dinamicas.mjs --json     # grava e2e/.rotas-dinamicas.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { db } from '@torcida/db'

const SAIDA = path.join(import.meta.dirname, '..', 'e2e', '.rotas-dinamicas.json')

/**
 * Tudo e escopado ao tenant do usuario de teste. Sem isso a query pega o
 * primeiro registro do banco, que pode ser de OUTRA torcida — a rota
 * redireciona e a auditoria acaba medindo a pagina errada achando que mediu a
 * certa. (Foi o que aconteceu com `/portal/sedes/<id>` de outro tenant.)
 */
const EMAIL_TESTE = process.env.E2E_TEST_EMAIL ?? 'viniciuslopesnunes10@gmail.com'

const membro = await db.saasMembro.findFirst({
  where: { user: { email: EMAIL_TESTE } },
  select: { tenantId: true },
})
if (!membro) {
  console.error(`Nenhum SaasMembro para ${EMAIL_TESTE} — nao da pra escopar por tenant.`)
  await db.$disconnect()
  process.exit(1)
}
const tenantId = membro.tenantId

/** Cada entrada devolve uma rota ou null. Falha isolada nao derruba o resto. */
const RESOLVEDORES = [
  {
    nome: 'canal-comunidade',
    async resolver() {
      const c = await db.conversa.findFirst({ where: { tipo: 'CANAL', tenantId }, select: { id: true } })
      return c && `/portal/comunidade/canais/${c.id}`
    },
  },
  {
    nome: 'sede',
    async resolver() {
      const s = await db.sede.findFirst({ where: { tenantId }, select: { id: true } })
      return s && `/portal/sedes/${s.id}`
    },
  },
  {
    nome: 'evento-portal',
    async resolver() {
      const e = await db.evento.findFirst({ where: { tenantId }, select: { id: true } })
      return e && `/portal/eventos/${e.id}`
    },
  },
  {
    nome: 'evento-admin',
    async resolver() {
      const e = await db.evento.findFirst({ where: { tenantId }, select: { id: true } })
      return e && `/admin/eventos/${e.id}`
    },
  },
  {
    nome: 'torcedor-admin',
    async resolver() {
      const m = await db.saasMembro.findFirst({ where: { tenantId }, select: { id: true } })
      return m && `/admin/torcedores/${m.id}`
    },
  },
  {
    nome: 'departamento-cockpit',
    async resolver() {
      const d = await db.departamento.findFirst({
        where: { slug: { not: '' }, tenantId },
        select: { slug: true },
      })
      return d && `/portal/departamentos/${d.slug}`
    },
  },
  {
    nome: 'patrimonio-item',
    async resolver() {
      const i = await db.patrimonioItem.findFirst({ where: { tenantId }, select: { id: true } })
      return i && `/admin/patrimonio?item=${i.id}`
    },
  },
]

const rotas = []
const falhas = []

for (const r of RESOLVEDORES) {
  try {
    const rota = await r.resolver()
    if (rota) rotas.push(rota)
    else falhas.push(`${r.nome}: sem registro no banco`)
  } catch (e) {
    falhas.push(`${r.nome}: ${e.message.split('\n')[0]}`)
  }
}

if (process.argv.includes('--json')) {
  fs.writeFileSync(SAIDA, JSON.stringify(rotas, null, 2))
  console.log(`Gravado ${SAIDA} (${rotas.length} rotas)`)
} else {
  console.log(`${rotas.length} rota(s) dinamica(s) resolvida(s):`)
  for (const r of rotas) console.log(`  ${r}`)
}
if (falhas.length) {
  console.log(`\n${falhas.length} nao resolvida(s):`)
  for (const f of falhas) console.log(`  ${f}`)
}

await db.$disconnect()
