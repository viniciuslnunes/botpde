/**
 * Backfill: membro canônico numa unidade Caso B sem o registro espelho na Sede
 * raiz. O espelho é criado em `sincronizarSocioNaSedeRaiz`, mas essa chamada é
 * best-effort (try/catch que só loga) — quando ela falha, a pessoa fica visível
 * só na unidade e some da contagem de /admin/torcedores e /admin/socios da Sede.
 *
 * Vale para os dois tipos: TORCEDOR entra APROVADO direto pela unidade e
 * também precisa contar na Sede.
 *
 * Uso:
 *   node scripts/repair-espelho-membros-sede.js --dry-run
 *   node scripts/repair-espelho-membros-sede.js
 *   node scripts/repair-espelho-membros-sede.js --tenant=<slug-da-unidade>
 */
import { db } from '../src/index.js'

const dryRun = process.argv.includes('--dry-run')
const filtroTenant = process.argv
  .find((a) => a.startsWith('--tenant='))
  ?.slice('--tenant='.length)

/** Sobe a árvore de `Sede` e devolve o tenant raiz (ou o próprio, se já é raiz). */
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
  // Teto defensivo idêntico ao de `lib/hierarquia.ts`: a árvore é rasa, e um
  // ciclo acidental não pode virar loop infinito.
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

/**
 * Mesmos campos de `dadosCadastraisEspelho` em `apps/web/src/lib/membros-sede.ts`.
 * NÃO copia `sedeId` nem `planoAssociacaoId` — são do outro tenant.
 */
const CAMPOS_ESPELHO = [
  'tipo', 'nome', 'idade', 'telefone', 'cidade', 'numeroAssociado', 'anosSocio',
  'dataExpedicaoCarteirinha', 'periodicidadePretendida', 'cep', 'numero', 'bloco',
  'complemento', 'imagemProva', 'rg', 'cpf', 'filiacao', 'escolaridade', 'profissao',
  'dataNascimento', 'sexo', 'estadoCivil', 'nacionalidade', 'logradouro', 'bairro',
  'uf', 'fotoDocumentoUrl', 'comprovanteResidenciaUrl', 'responsavelNome',
  'responsavelDocumento', 'autorizacaoMenorAceitaEm', 'termoResponsabilidadeAceitoEm',
]

const tenants = await db.tenant.findMany({
  where: { ativo: true, sintetico: false, ...(filtroTenant ? { slug: filtroTenant } : {}) },
  select: { id: true, slug: true },
})

/** @type {Map<string, string>} tenantId da unidade → tenantId da raiz */
const raizPorTenant = new Map()
for (const t of tenants) {
  const raiz = await resolverTenantRaizId(t.id)
  if (raiz !== t.id) raizPorTenant.set(t.id, raiz)
}

console.log(`Tenants ativos: ${tenants.length} · unidades sob uma Sede: ${raizPorTenant.size}`)

const faltando = []
let jaMembroDireto = 0

for (const [unidadeId, raizId] of raizPorTenant) {
  const canonicos = await db.saasMembro.findMany({
    where: { tenantId: unidadeId, espelhado: false, desligadoEm: null },
    select: Object.fromEntries([
      ['id', true], ['userId', true], ['status', true], ['departamentoSedeId', true],
      ...CAMPOS_ESPELHO.map((c) => [c, true]),
    ]),
  })
  if (canonicos.length === 0) continue

  const naRaiz = await db.saasMembro.findMany({
    where: { tenantId: raizId, userId: { in: canonicos.map((m) => m.userId) } },
    select: { userId: true, espelhado: true },
  })
  const porUser = new Map(naRaiz.map((m) => [m.userId, m]))

  for (const membro of canonicos) {
    const existente = porUser.get(membro.userId)
    if (existente) {
      // Membro direto da Sede não é sobrescrito — mesma regra de
      // `sincronizarSocioNaSedeRaiz` (MEMBRO_SINCRONIZACAO_IGNORADA_JA_MEMBRO_DIRETO).
      if (!existente.espelhado) jaMembroDireto++
      continue
    }
    faltando.push({ membro, unidadeId, raizId })
  }
}

const slugPorId = new Map(tenants.map((t) => [t.id, t.slug]))
console.log(
  `\nEspelhos faltando: ${faltando.length} · já membro direto da Sede (ignorados): ${jaMembroDireto}`,
)
for (const f of faltando) {
  console.log(
    ` - ${f.membro.nome} (${f.membro.tipo}/${f.membro.status}) · ${slugPorId.get(f.unidadeId)} → ${slugPorId.get(f.raizId) ?? f.raizId}`,
  )
}

if (dryRun) {
  console.log('\n(--dry-run) nenhuma escrita.')
  await db.$disconnect()
  process.exit(0)
}

let criados = 0
let conflitoCpf = 0

for (const { membro, unidadeId, raizId } of faltando) {
  // `SaasMembro` tem @@unique([tenantId, cpf]): outro userId com o mesmo CPF na
  // raiz derrubaria o upsert. Reportar é melhor que abortar o lote inteiro.
  if (membro.cpf) {
    const conflito = await db.saasMembro.findFirst({
      where: { tenantId: raizId, cpf: membro.cpf, userId: { not: membro.userId } },
      select: { id: true },
    })
    if (conflito) {
      console.warn(`  ⚠ CPF já usado por outra conta na Sede — pulando: ${membro.nome}`)
      conflitoCpf++
      continue
    }
  }

  const dados = Object.fromEntries(CAMPOS_ESPELHO.map((c) => [c, membro[c] ?? null]))
  // Espelho de TORCEDOR nasce APROVADO (ele não passa por fila); espelho de
  // SOCIO herda o status da origem para não pular a decisão da diretoria.
  const status = membro.tipo === 'TORCEDOR' ? 'APROVADO' : membro.status
  // Só semeia a área da Sede se o espelho está nascendo agora (nunca sobrescreve).
  if (membro.departamentoSedeId) dados.departamentoId = membro.departamentoSedeId

  const espelho = await db.saasMembro.create({
    data: {
      tenantId: raizId,
      userId: membro.userId,
      ...dados,
      status,
      espelhado: true,
      aprovadoNaUnidadeTenantId: unidadeId,
      membroOrigemId: membro.id,
      ...(status === 'APROVADO' ? { aprovadoEm: new Date(), aprovadoPorNome: 'Reparo automático' } : {}),
    },
    select: { id: true },
  })

  // Sem o cargo `member` na raiz o espelho não publica no feed "Minha torcida".
  const memberRole = await db.role.findFirst({
    where: { tenantId: raizId, nome: 'member', isSystem: true },
    select: { id: true },
  })
  if (memberRole && status === 'APROVADO') {
    await db.userRole.upsert({
      where: {
        userId_tenantId_roleId: {
          userId: membro.userId,
          tenantId: raizId,
          roleId: memberRole.id,
        },
      },
      create: { userId: membro.userId, tenantId: raizId, roleId: memberRole.id },
      update: {},
    })
  }

  await db.auditLog.create({
    data: {
      tenantId: raizId,
      atorId: membro.userId,
      acao: 'MEMBRO_SOCIO_SINCRONIZADO_SEDE',
      entidade: 'SaasMembro',
      entidadeId: espelho.id,
      detalhes: {
        origemTenantId: unidadeId,
        membroOrigemId: membro.id,
        automatico: true,
        script: 'repair-espelho-membros-sede',
      },
    },
  })
  criados++
}

console.log(`\n✅ espelhos criados=${criados} · pulados por conflito de CPF=${conflitoCpf}`)
await db.$disconnect()
