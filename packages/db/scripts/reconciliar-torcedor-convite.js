/**
 * Reconcilia um torcedor GLOBAL que deveria ter entrado por um link de convite.
 *
 * Sintoma: a pessoa clicou no convite de uma unidade, o contexto se perdeu num
 * elo do login social e ela terminou o onboarding pelo card «sou só torcedor do
 * clube» — `PerfilTorcedor` gravado, nenhum `SaasMembro`. Fica invisível na
 * unidade E na Sede.
 *
 * O fluxo em si já foi corrigido (`concluirComoTorcedor` converte o atalho em
 * vínculo quando há convite). Este script existe para os casos anteriores.
 *
 * Cria o vínculo TORCEDOR/APROVADO na unidade do convite e o espelho na Sede
 * raiz — os dois com AuditLog. Não mexe em canais: rode
 * `db:repair-aprovado-canal-membro` depois se precisar.
 *
 * Uso:
 *   node scripts/reconciliar-torcedor-convite.js --email=<email> --convite=<slug> --dry-run
 *   node scripts/reconciliar-torcedor-convite.js --email=<email> --convite=<slug>
 */
import { db } from '../src/index.js'

const arg = (nome) =>
  process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3)

const dryRun = process.argv.includes('--dry-run')
const email = arg('email')
const conviteSlug = arg('convite')

if (!email || !conviteSlug) {
  console.error('Uso: --email=<email> --convite=<slug> [--dry-run]')
  process.exit(1)
}

const user = await db.user.findFirst({
  where: { email: { equals: email, mode: 'insensitive' } },
  select: { id: true, nome: true, email: true },
})
if (!user) {
  console.error(`Usuário não encontrado: ${email}`)
  process.exit(1)
}

const unidade = await db.tenant.findFirst({
  where: { conviteSlug, conviteAtivo: true, ativo: true, sintetico: false },
  select: { id: true, slug: true, nome: true },
})
if (!unidade) {
  console.error(`Convite inválido ou desativado: ${conviteSlug}`)
  process.exit(1)
}

const jaMembro = await db.saasMembro.findMany({
  where: { userId: user.id },
  select: { tenantId: true, tipo: true, status: true },
})
if (jaMembro.length > 0) {
  console.error(
    `${user.nome} já tem vínculo(s): ${jaMembro.map((m) => `${m.tenantId}:${m.tipo}/${m.status}`).join(', ')}. Nada a reconciliar.`,
  )
  process.exit(1)
}

/** Unidade territorial do vínculo: a `Sede` que aponta para o tenant convidado. */
const sede = await db.sede.findFirst({
  where: { tenantId: unidade.id, ativa: true },
  select: { id: true, nome: true },
  orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
})

/** Sobe a árvore de `Sede` até a raiz. */
async function resolverTenantRaizId(tenantId) {
  let atual =
    (await db.sede.findFirst({
      where: { tenantId, tipo: 'SEDE' },
      select: { id: true, tenantId: true, sedeId: true },
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
    })) ??
    (await db.sede.findFirst({
      where: { tenantId },
      select: { id: true, tenantId: true, sedeId: true },
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
    }))
  if (!atual) return tenantId

  let raiz = tenantId
  for (let i = 0; i < 10 && atual?.sedeId; i++) {
    const pai = await db.sede.findUnique({
      where: { id: atual.sedeId },
      select: { id: true, tenantId: true, sedeId: true },
    })
    if (!pai) break
    if (pai.tenantId) raiz = pai.tenantId
    atual = pai
  }
  return raiz
}

const raizId = await resolverTenantRaizId(unidade.id)
const raiz =
  raizId === unidade.id
    ? null
    : await db.tenant.findUnique({ where: { id: raizId }, select: { slug: true, nome: true } })

console.log(`Usuário : ${user.nome} <${user.email}>`)
console.log(`Unidade : ${unidade.nome} (${unidade.slug})`)
console.log(`Sede    : ${raiz ? `${raiz.nome} (${raiz.slug})` : '— a unidade já é a raiz'}`)
console.log(`Unidade territorial: ${sede?.nome ?? '— nenhuma Sede ativa'}`)

if (dryRun) {
  console.log('\n(--dry-run) nenhuma escrita.')
  await db.$disconnect()
  process.exit(0)
}

const agora = new Date()
const dadosBase = { nome: user.nome, tipo: 'TORCEDOR', status: 'APROVADO' }

const canonico = await db.saasMembro.create({
  data: {
    tenantId: unidade.id,
    userId: user.id,
    ...dadosBase,
    sedeId: sede?.id ?? null,
    aprovadoEm: agora,
    aprovadoPorNome: 'Reconciliação de convite',
  },
  select: { id: true },
})
await db.auditLog.create({
  data: {
    tenantId: unidade.id,
    atorId: user.id,
    acao: 'CADASTRO_SOLICITADO',
    entidade: 'SaasMembro',
    entidadeId: canonico.id,
    detalhes: { automatico: true, script: 'reconciliar-torcedor-convite', conviteSlug },
  },
})
console.log(`\n✅ vínculo TORCEDOR criado na unidade (${canonico.id})`)

// Perfil social público na unidade — o onboarding de torcedor faz o mesmo.
await db.perfilMembro.upsert({
  where: { userId_tenantId: { userId: user.id, tenantId: unidade.id } },
  create: { userId: user.id, tenantId: unidade.id, perfilPrivado: false },
  update: { perfilPrivado: false },
})

if (raizId !== unidade.id) {
  const espelho = await db.saasMembro.create({
    data: {
      tenantId: raizId,
      userId: user.id,
      ...dadosBase,
      espelhado: true,
      aprovadoNaUnidadeTenantId: unidade.id,
      membroOrigemId: canonico.id,
      aprovadoEm: agora,
      aprovadoPorNome: 'Reconciliação de convite',
    },
    select: { id: true },
  })

  const memberRole = await db.role.findFirst({
    where: { tenantId: raizId, nome: 'member', isSystem: true },
    select: { id: true },
  })
  if (memberRole) {
    await db.userRole.upsert({
      where: {
        userId_tenantId_roleId: { userId: user.id, tenantId: raizId, roleId: memberRole.id },
      },
      create: { userId: user.id, tenantId: raizId, roleId: memberRole.id },
      update: {},
    })
  }

  await db.auditLog.create({
    data: {
      tenantId: raizId,
      atorId: user.id,
      acao: 'MEMBRO_SOCIO_SINCRONIZADO_SEDE',
      entidade: 'SaasMembro',
      entidadeId: espelho.id,
      detalhes: {
        origemTenantId: unidade.id,
        membroOrigemId: canonico.id,
        automatico: true,
        script: 'reconciliar-torcedor-convite',
      },
    },
  })
  console.log(`✅ espelho criado na Sede (${espelho.id})`)
}

await db.$disconnect()
