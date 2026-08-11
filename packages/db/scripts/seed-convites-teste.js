/**
 * Links de convite (`/convite/<slug>`) para o fluxo de teste — em torcidas E
 * em unidades promovidas (Caso B), de clubes diferentes.
 *
 * Por que existir: o onboarding tem dois caminhos de entrada muito diferentes
 * e só um deles aparece nos seeds antigos.
 *   1. Vitrine pública (`/onboarding`) — o usuário escolhe clube → torcida →
 *      unidade.
 *   2. Convite direto (`/convite/<slug>`) — pula clube/torcida/unidade e cai
 *      no passo de vínculo. Para uma unidade com canal restrito (R5) é o
 *      **único** caminho de entrada.
 * Sem link gerado, o caminho 2 nunca é exercitado — nem manualmente nem pelo
 * `seed:jornadas`, que consome exatamente estes slugs.
 *
 * A matriz de destinos (`DESTINOS`) cobre de propósito eixos diferentes:
 * Sede raiz com muitas unidades, torcida irmã do mesmo clube, unidade Caso B
 * promovida a tenant próprio e torcidas de outros clubes (o vínculo cross-clube
 * é o que aciona rivalidade e segregação de DM).
 *
 * Espelha `gerarConviteTenant` (admin/configuracoes/actions.ts): mesmo formato
 * de slug (`randomBytes(6).base64url`), mesma herança de `afiliacaoId` do
 * ancestral e o mesmo `AuditLog` — o link daqui é indistinguível de um gerado
 * pela tela.
 *
 * Idempotente: tenant que já tem `conviteSlug` só é reativado (o link antigo
 * continua valendo). Rotacione de propósito com `--rotacionar`.
 *
 * Uso:
 *   pnpm --filter @torcida/db seed:convites-teste
 *   pnpm --filter @torcida/db seed:convites-teste -- --rotacionar
 *   pnpm --filter @torcida/db seed:convites-teste -- --listar
 */
import crypto from 'node:crypto'
import { db } from '../src/index.js'
import { assertNotProductionSeed } from './lib/seed-env.js'

assertNotProductionSeed('seed:convites-teste')

const ROTACIONAR = process.argv.includes('--rotacionar')
const SO_LISTAR = process.argv.includes('--listar')
const BASE_URL = process.env.CONVITE_BASE_URL ?? 'http://localhost:3000'

/**
 * Eixo = o que este destino cobre que nenhum outro cobre. Serve de checklist:
 * se um eixo some da lista, o `seed:jornadas` deixa de exercitar aquele caso.
 */
const DESTINOS = [
  {
    slug: 'pde-gavioes-fiel',
    eixo: 'Sede raiz com 14 unidades — convite da raiz cai direto no vínculo',
  },
  {
    slug: 'camisa-12-corinthians',
    eixo: 'torcida irmã do mesmo clube — coirmã na malha do Corinthians',
  },
  {
    slug: 'pavilhao-nove',
    eixo: 'terceira torcida do mesmo clube — contraste de isolamento entre pares',
  },
  {
    slug: 'subsede-rio-claro',
    eixo: 'unidade Caso B promovida (Corinthians) — área na unidade + área na Sede',
  },
  {
    slug: 'fiel-sao-vicente',
    eixo: 'unidade Caso B com canais próprios — espelho do sócio nos dois níveis',
  },
  {
    slug: 'pde-fiel-baixada-praia-grande-praia-grande',
    eixo: 'unidade Caso B sem canal provisionado — expõe buraco de canal oficial',
  },
  {
    slug: 'mancha-alviverde',
    eixo: 'outro clube (Palmeiras) — rivalidade e segregação cross-clube',
  },
  {
    slug: 'torcida-jovem-flamengo',
    eixo: 'outro clube (Flamengo) com 5 pelotões — CN de outro clube',
  },
  {
    slug: 'geral-do-gremio',
    eixo: 'outro clube (Grêmio) — quarto clube na malha nacional',
  },
]

function gerarSlugConvite() {
  return crypto.randomBytes(6).toString('base64url')
}

/**
 * Ancestrais do tenant, do mais próximo ao mais distante. Porta de
 * `getAncestorTenantIds` (`apps/web/src/lib/hierarquia.ts`) para Node puro:
 * mesmo nó de partida (`SEDE` mais antiga, com desempate por id — sem isso o
 * Postgres devolve nós diferentes entre execuções) e a mesma subida por
 * `Sede.sedeId`.
 */
const SEDE_NODE_SELECT = { id: true, tenantId: true, sedeId: true }
const ORDEM_SEDE = [{ criadoEm: 'asc' }, { id: 'asc' }]

async function ancestraisDoTenant(tenantId) {
  let atual =
    (await db.sede.findFirst({
      where: { tenantId, tipo: 'SEDE' },
      select: SEDE_NODE_SELECT,
      orderBy: ORDEM_SEDE,
    })) ??
    (await db.sede.findFirst({
      where: { tenantId },
      select: SEDE_NODE_SELECT,
      orderBy: ORDEM_SEDE,
    }))
  if (!atual) return []

  const ids = []
  for (let i = 0; i < 10 && atual?.sedeId; i++) {
    const pai = await db.sede.findUnique({
      where: { id: atual.sedeId },
      select: SEDE_NODE_SELECT,
    })
    if (!pai) break
    if (pai.tenantId && pai.tenantId !== tenantId) ids.push(pai.tenantId)
    atual = pai
  }
  return ids
}

/** Afiliação própria ou herdada do ancestral mais próximo (igual a `resolverAfiliacaoIdEfetiva`). */
async function afiliacaoEfetiva(tenant) {
  if (tenant.afiliacaoId) return tenant.afiliacaoId
  for (const id of await ancestraisDoTenant(tenant.id)) {
    const t = await db.tenant.findUnique({ where: { id }, select: { afiliacaoId: true } })
    if (t?.afiliacaoId) return t.afiliacaoId
  }
  return null
}

/** Ator do AuditLog: owner do tenant, senão qualquer cargo, senão null. */
async function atorInstitucional(tenantId) {
  const owner = await db.userRole.findFirst({
    where: { tenantId, role: { isSystem: true, nome: 'owner' } },
    select: { userId: true },
  })
  if (owner) return owner.userId
  const qualquer = await db.userRole.findFirst({ where: { tenantId }, select: { userId: true } })
  return qualquer?.userId ?? null
}

async function main() {
  console.log('🔗 Links de convite para o fluxo de teste\n')

  const linhas = []
  for (const destino of DESTINOS) {
    const tenant = await db.tenant.findFirst({
      where: { slug: destino.slug },
      select: {
        id: true,
        slug: true,
        nome: true,
        afiliacaoId: true,
        conviteSlug: true,
        conviteAtivo: true,
        ativo: true,
        canalRestrito: true,
        afiliacao: { select: { apelido: true, nome: true } },
      },
    })
    if (!tenant) {
      console.log(`  ⚠️  ${destino.slug}: tenant não encontrado — pulando`)
      continue
    }
    if (!tenant.ativo) {
      console.log(`  ⚠️  ${destino.slug}: tenant inativo — convite não resolveria`)
      continue
    }

    const afiliacaoId = await afiliacaoEfetiva(tenant)
    if (!afiliacaoId) {
      // Mesmo guard de `gerarConviteTenant`: sem clube o convite cai no passo
      // Clube do wizard e deixa de ser atalho.
      console.log(`  ⚠️  ${destino.slug}: sem clube resolvível (próprio nem ancestral) — pulando`)
      continue
    }

    const precisaSlug = SO_LISTAR ? false : ROTACIONAR || !tenant.conviteSlug
    let slugConvite = tenant.conviteSlug

    if (SO_LISTAR) {
      if (!slugConvite) {
        console.log(`  ↔  ${destino.slug}: sem link ainda`)
        continue
      }
    } else {
      if (precisaSlug) slugConvite = gerarSlugConvite()
      await db.tenant.update({
        where: { id: tenant.id },
        data: {
          conviteSlug: slugConvite,
          conviteAtivo: true,
          // Materializa a afiliação herdada — sem isso o convite da unidade
          // Caso B resolve `null` e o wizard volta ao passo Clube.
          ...(tenant.afiliacaoId ? {} : { afiliacaoId }),
        },
      })

      const atorId = await atorInstitucional(tenant.id)
      if (atorId) {
        await db.auditLog.create({
          data: {
            tenantId: tenant.id,
            atorId,
            acao: precisaSlug ? 'TENANT_CONVITE_GERADO' : 'TENANT_CONVITE_ATUALIZADO',
            entidade: 'Tenant',
            entidadeId: tenant.id,
            detalhes: {
              seed: 'convites-teste',
              rotacionado: precisaSlug,
              ativo: true,
              ...(tenant.afiliacaoId ? {} : { afiliacaoIdHerdada: afiliacaoId }),
            },
          },
        })
      }
      const marca = precisaSlug ? (tenant.conviteSlug ? '🔄 rotacionado' : '✅ criado') : '✅ reativado'
      console.log(`  ${marca}: ${destino.slug}`)
    }

    linhas.push({
      slug: destino.slug,
      nome: tenant.nome,
      clube: tenant.afiliacao?.apelido ?? tenant.afiliacao?.nome ?? '—',
      restrito: tenant.canalRestrito,
      link: `${BASE_URL}/convite/${slugConvite}`,
      eixo: destino.eixo,
    })
  }

  console.log('\n📋 Links ativos:\n')
  for (const l of linhas) {
    console.log(`   ${l.nome}${l.restrito ? ' [CANAL RESTRITO]' : ''}`)
    console.log(`      ${l.link}`)
    console.log(`      tenant=${l.slug} · clube=${l.clube}`)
    console.log(`      cobre: ${l.eixo}\n`)
  }
  console.log(`Total: ${linhas.length} link(s). Base: ${BASE_URL} (troque com CONVITE_BASE_URL).`)
}

main()
  .catch((err) => {
    console.error('❌ Erro:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
