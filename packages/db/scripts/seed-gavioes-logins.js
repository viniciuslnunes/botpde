/**
 * Logins nomeados para testar cada visão nos Gaviões da Fiel.
 *
 * Um usuário por degrau da escada (torcedor → sócio → membro/gestor de cada
 * área → admin → vice → presidente) no tenant `pde-gavioes-fiel`. Senha de
 * todos: `m1k43l3n` (a mesma dos demais seeds). E-mails no domínio
 * `@teste.corinthians.torcida.app` para o `db:senha-teste` reconhecê-los.
 *
 * Recusa gravar fora de Postgres localhost. Idempotente (reexecutar atualiza
 * senha, papéis e projeções de área).
 *
 *   TORCIDA_ENV=local pnpm --filter @torcida/db seed:gavioes-logins
 */
import { PrismaClient } from '@prisma/client'
import { SENHA_TESTE, senhaHashTeste } from './lib/senha-teste.js'
import { assertNotProductionSeed, prepareSeedEnv } from './lib/seed-env.js'
import {
  DEPARTAMENTOS_CANONICOS,
  syncMembershipFromRoles,
} from '../src/departamentos-canonicos.js'
import { ensureCanaisDepartamentosTenant } from '../src/departamento-canais.js'
import { slugifyDepartamento } from '../../types/src/permissions.js'

if (!process.env.TORCIDA_ENV) process.env.TORCIDA_ENV = 'local'

assertNotProductionSeed('seed:gavioes-logins')
const { alvo, dbKind } = prepareSeedEnv({ scriptLabel: 'seed:gavioes-logins' })

if (dbKind !== 'local') {
  throw new Error(
    `seed:gavioes-logins só grava em Postgres localhost (agora: ${dbKind}, TORCIDA_ENV=${alvo}).\n` +
      'Confira DATABASE_URL em apps/web/.env.local — deve apontar para 127.0.0.1/localhost.',
  )
}

const TENANT_SLUG = process.env.TENANT_SLUG || 'pde-gavioes-fiel'
const DOMINIO = 'teste.corinthians.torcida.app'
const NICK_PREFIX = 'gavioes_'
const NUMERO_SOCIO_BASE = 990_001
const CPF_INDICE_BASE = 711_000

/** Placeholders para pular o modal de ficha incompleta (documentos LGE). */
const PROVA_TESTE = 'https://placehold.co/640x400/png?text=prova-vinculo-teste'
const DOC_TESTE = 'https://placehold.co/640x400/png?text=documento-teste'
const RESIDENCIA_TESTE = 'https://placehold.co/640x400/png?text=residencia-teste'

const db = new PrismaClient()

/** CPF sintético com dígitos verificadores válidos. */
function cpfSinteticoValido(indice) {
  const base = String(100000000 + (indice % 800000000)).padStart(9, '0')
  const calc = (digitos, fator) => {
    let soma = 0
    for (let i = 0; i < digitos.length; i++) soma += Number(digitos[i]) * (fator - i)
    const mod = (soma * 10) % 11
    return mod === 10 ? 0 : mod
  }
  const d1 = calc(base, 10)
  const d2 = calc(`${base}${d1}`, 11)
  return `${base}${d1}${d2}`
}

function emailDe(local) {
  return `${local}@${DOMINIO}`
}

/**
 * Contas nomeadas. `roles` é a lista de nomes de Role neste tenant
 * (`owner` / `admin` / `vice` / `member` / `Gestor · X` / `Membro · X`).
 *
 * @typedef {{
 *   chave: string,
 *   email: string,
 *   nome: string,
 *   nickname: string,
 *   visao: string,
 *   tipo: 'SOCIO' | 'TORCEDOR',
 *   roles: string[],
 *   departamentoSlug: string | null,
 * }} SpecLogin
 */

/** @returns {SpecLogin[]} */
function montarSpecs() {
  /** @type {SpecLogin[]} */
  const specs = [
    {
      chave: 'presidente',
      email: emailDe('presidente.gavioes'),
      nome: 'Presidente Gaviões (teste)',
      nickname: `${NICK_PREFIX}presidente`,
      visao: 'Presidente (owner) — todas as permissões',
      tipo: 'SOCIO',
      roles: ['owner'],
      departamentoSlug: 'diretoria',
    },
    {
      chave: 'admin',
      email: emailDe('admin.gavioes'),
      nome: 'Administrador Gaviões (teste)',
      nickname: `${NICK_PREFIX}admin`,
      visao: 'Administrador — operação da torcida, sem presidência plena',
      tipo: 'SOCIO',
      roles: ['admin'],
      departamentoSlug: 'diretoria',
    },
    {
      chave: 'vice',
      email: emailDe('vice.gavioes'),
      nome: 'Vice-presidente Gaviões (teste)',
      nickname: `${NICK_PREFIX}vice`,
      visao: 'Vice-presidente',
      tipo: 'SOCIO',
      roles: ['vice'],
      departamentoSlug: 'diretoria',
    },
    {
      chave: 'socio',
      email: emailDe('socio.gavioes'),
      nome: 'Sócio Gaviões (teste)',
      nickname: `${NICK_PREFIX}socio`,
      visao: 'Sócio sem área — portal básico, sem equipe de departamento',
      tipo: 'SOCIO',
      roles: ['member'],
      departamentoSlug: null,
    },
    {
      chave: 'torcedor',
      email: emailDe('torcedor.gavioes'),
      nome: 'Torcedor Gaviões (teste)',
      nickname: `${NICK_PREFIX}torcedor`,
      visao: 'Torcedor — comunidade, sem modo sócio /admin',
      tipo: 'TORCEDOR',
      roles: [],
      departamentoSlug: null,
    },
  ]

  for (const depto of DEPARTAMENTOS_CANONICOS) {
    const slug = slugifyDepartamento(depto.nome)
    specs.push({
      chave: `gestor-${slug}`,
      email: emailDe(`gestor.${slug}`),
      nome: `Gestor ${depto.nome} (teste)`,
      nickname: `${NICK_PREFIX}gestor_${slug}`.slice(0, 40),
      visao: `Gestor · ${depto.nome} — opera a área no admin/portal`,
      tipo: 'SOCIO',
      roles: ['member', `Gestor · ${depto.nome}`],
      departamentoSlug: slug,
    })
    specs.push({
      chave: `membro-${slug}`,
      email: emailDe(`membro.${slug}`),
      nome: `Membro ${depto.nome} (teste)`,
      nickname: `${NICK_PREFIX}membro_${slug}`.slice(0, 40),
      visao: `Membro · ${depto.nome} — colaborador da área`,
      tipo: 'SOCIO',
      roles: ['member', `Membro · ${depto.nome}`],
      departamentoSlug: slug,
    })
  }

  return specs
}

/**
 * @param {import('@prisma/client').PrismaClient} client
 * @param {string} userId
 * @param {string} tenantId
 * @param {string | null} sedeId
 * @param {'SOCIO' | 'TORCEDOR'} tipo
 */
async function vincularCanaisOficiais(client, userId, tenantId, sedeId, tipo) {
  const sedes = await client.sede.findMany({
    where: { tenantId, canalConversaId: { not: null } },
    select: { id: true, tipo: true, canalConversaId: true },
  })
  const canalIds = new Set()
  const canalUnidade = sedeId ? sedes.find((s) => s.id === sedeId)?.canalConversaId : null
  if (canalUnidade) canalIds.add(canalUnidade)
  const canalSede = sedes.find((s) => s.tipo === 'SEDE')?.canalConversaId
  if (canalSede && !(tipo === 'TORCEDOR' && canalUnidade)) canalIds.add(canalSede)

  for (const conversaId of canalIds) {
    await client.membroConversa.upsert({
      where: { conversaId_userId: { conversaId, userId } },
      create: { conversaId, userId, papel: 'MEMBRO', status: 'ATIVO' },
      update: { saiuEm: null, status: 'ATIVO' },
    })
  }
}

async function main() {
  const specs = montarSpecs()
  console.log(`\nLogins nomeados · ${TENANT_SLUG} · ${specs.length} contas · senha ${SENHA_TESTE}\n`)

  const tenant = await db.tenant.findUnique({
    where: { slug: TENANT_SLUG },
    select: { id: true, nome: true, slug: true, afiliacaoId: true },
  })
  if (!tenant) throw new Error(`Tenant '${TENANT_SLUG}' não encontrado.`)

  const sede = await db.sede.findFirst({
    where: { tenantId: tenant.id, tipo: 'SEDE', ativa: true },
    select: { id: true, cidade: true, estado: true, nome: true },
    orderBy: { criadoEm: 'asc' },
  })
  if (!sede) throw new Error(`Tenant '${TENANT_SLUG}' sem Sede principal.`)

  const roles = await db.role.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, nome: true, departamentoId: true },
  })
  const rolePorNome = new Map(roles.map((r) => [r.nome, r]))
  for (const spec of specs) {
    for (const nome of spec.roles) {
      if (!rolePorNome.has(nome)) {
        throw new Error(
          `Perfil '${nome}' não existe em ${TENANT_SLUG}. Rode seed:departamentos primeiro.`,
        )
      }
    }
  }

  const deptos = await db.departamento.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, slug: true, nome: true },
  })
  const deptoPorSlug = new Map(deptos.map((d) => [d.slug, d]))

  const ownerAtual = await db.userRole.findFirst({
    where: { tenantId: tenant.id, role: { isSystem: true, nome: 'owner' } },
    select: { user: { select: { email: true, nome: true } } },
  })
  if (ownerAtual?.user) {
    console.log(
      `Owner já existente: ${ownerAtual.user.nome ?? '—'} <${ownerAtual.user.email ?? 'sem e-mail'}>\n` +
        `  (presidente.gavioes NÃO entra como segundo owner — a torcida admite só um)\n`,
    )
  }

  await ensureCanaisDepartamentosTenant(db, tenant.id)

  const agora = new Date()
  const validade = new Date(agora)
  validade.setFullYear(validade.getFullYear() + 1)
  const senhaHash = senhaHashTeste()
  const credenciais = []

  let indice = 0
  for (const spec of specs) {
    indice += 1
    const depto = spec.departamentoSlug ? deptoPorSlug.get(spec.departamentoSlug) : null
    if (spec.departamentoSlug && !depto) {
      throw new Error(`Departamento '${spec.departamentoSlug}' não encontrado.`)
    }

    const existente = await db.user.findUnique({
      where: { email: spec.email },
      select: { id: true, nickname: true },
    })

    let nickname = spec.nickname
    if (!existente) {
      const nickTomado = await db.user.findUnique({
        where: { nickname },
        select: { id: true },
      })
      if (nickTomado) nickname = `${spec.nickname}_${indice}`
    } else if (existente.nickname) {
      nickname = existente.nickname
    }

    const user = existente
      ? await db.user.update({
          where: { id: existente.id },
          data: { nome: spec.nome, senhaHash, consentidoEm: agora },
          select: { id: true },
        })
      : await db.user.create({
          data: {
            email: spec.email,
            nome: spec.nome,
            nickname,
            senhaHash,
            consentidoEm: agora,
          },
          select: { id: true },
        })

    const cpf = cpfSinteticoValido(CPF_INDICE_BASE + indice)
    const nasc = new Date(Date.UTC(1988, 2, 15 + (indice % 20)))
    const isSocio = spec.tipo === 'SOCIO'

    await db.saasMembro.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      create: {
        tenantId: tenant.id,
        userId: user.id,
        tipo: spec.tipo,
        nome: spec.nome,
        status: 'APROVADO',
        sedeId: sede.id,
        departamentoId: isSocio ? (depto?.id ?? null) : null,
        cidade: sede.cidade ?? 'São Paulo',
        uf: sede.estado ?? 'SP',
        telefone: `1199${String(1000000 + indice).slice(0, 7)}`,
        idade: 30 + (indice % 20),
        dataNascimento: nasc,
        sexo: indice % 2 === 0 ? 'Masculino' : 'Feminino',
        estadoCivil: 'Solteiro(a)',
        nacionalidade: 'Brasileira',
        rg: String(20_000_000 + indice).padStart(9, '0'),
        cpf,
        logradouro: 'Rua da Independência',
        numero: String(100 + indice),
        bairro: 'Pari',
        cep: '03032-000',
        numeroAssociado: isSocio ? String(NUMERO_SOCIO_BASE + indice) : null,
        anosSocio: isSocio ? 3 : null,
        adimplente: true,
        pendenciasCadastroDispensadas: [],
        termoResponsabilidadeAceitoEm: agora,
        dataExpedicaoCarteirinha: isSocio ? agora : null,
        periodicidadePretendida: isSocio ? 'ANUAL' : null,
        imagemProva: isSocio ? PROVA_TESTE : null,
        fotoDocumentoUrl: isSocio ? DOC_TESTE : null,
        comprovanteResidenciaUrl: isSocio ? RESIDENCIA_TESTE : null,
        aprovadoPorNome: 'Seed logins Gaviões (local)',
        aprovadoEm: agora,
      },
      update: {
        tipo: spec.tipo,
        nome: spec.nome,
        status: 'APROVADO',
        sedeId: sede.id,
        departamentoId: isSocio ? (depto?.id ?? null) : null,
        desligadoEm: null,
        desligadoMotivo: null,
        adimplente: true,
        aprovadoEm: agora,
        aprovadoPorNome: 'Seed logins Gaviões (local)',
        termoResponsabilidadeAceitoEm: agora,
        dataExpedicaoCarteirinha: isSocio ? agora : null,
        periodicidadePretendida: isSocio ? 'ANUAL' : null,
        imagemProva: isSocio ? PROVA_TESTE : null,
        fotoDocumentoUrl: isSocio ? DOC_TESTE : null,
        comprovanteResidenciaUrl: isSocio ? RESIDENCIA_TESTE : null,
      },
    })

    const roleIdsDesejados = await (async () => {
      let nomes = spec.roles
      if (nomes.includes('owner')) {
        const outrosOwners = await db.userRole.count({
          where: {
            tenantId: tenant.id,
            role: { isSystem: true, nome: 'owner' },
            userId: { not: user.id },
          },
        })
        if (outrosOwners > 0) {
          nomes = nomes.filter((r) => r !== 'owner')
          if (!nomes.includes('admin')) nomes = [...nomes, 'admin']
          console.log(
            `  !  Presidência já ocupada. ${spec.email} entra como admin, não como segundo owner.`,
          )
        }
      }
      return nomes.map((nome) => rolePorNome.get(nome).id)
    })()
    const rolesAtuais = await db.userRole.findMany({
      where: { userId: user.id, tenantId: tenant.id },
      select: { id: true, roleId: true },
    })
    const desejados = new Set(roleIdsDesejados)
    for (const ur of rolesAtuais) {
      if (!desejados.has(ur.roleId)) {
        await db.userRole.delete({ where: { id: ur.id } })
      }
    }
    const atuaisSet = new Set(rolesAtuais.map((r) => r.roleId))
    for (const roleId of roleIdsDesejados) {
      if (atuaisSet.has(roleId)) continue
      await db.userRole.create({
        data: { userId: user.id, tenantId: tenant.id, roleId },
      })
    }

    await syncMembershipFromRoles(db, { userId: user.id, tenantId: tenant.id })

    if (tenant.afiliacaoId) {
      await db.perfilTorcedor.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          afiliacaoId: tenant.afiliacaoId,
          regiao: `${sede.cidade ?? 'São Paulo'}/${sede.estado ?? 'SP'}`,
          onboardingConcluidoEm: agora,
        },
        update: {
          afiliacaoId: tenant.afiliacaoId,
          onboardingConcluidoEm: agora,
        },
      })
    }

    if (isSocio) {
      const jaSocio = await db.saasSocio.findUnique({
        where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
        select: { id: true },
      })
      if (!jaSocio) {
        let numeroSocio = NUMERO_SOCIO_BASE + indice
        for (let tentativa = 0; tentativa < 20; tentativa += 1) {
          try {
            await db.saasSocio.create({
              data: {
                tenantId: tenant.id,
                userId: user.id,
                numeroSocio,
                nome: spec.nome,
                validade,
                expedidoEm: agora,
              },
            })
            break
          } catch (err) {
            const code = err && typeof err === 'object' && 'code' in err ? err.code : ''
            if (code !== 'P2002') throw err
            numeroSocio += 100
          }
        }
      } else {
        await db.saasSocio.update({
          where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
          data: { nome: spec.nome, validade },
        })
      }
    }

    await vincularCanaisOficiais(db, user.id, tenant.id, sede.id, spec.tipo)

    credenciais.push({
      visao: spec.visao,
      email: spec.email,
      nickname,
      criado: !existente,
    })
    const marca = existente ? '↔' : '+'
    console.log(`  ${marca}  ${spec.email.padEnd(52)} ${spec.visao}`)
  }

  const ownersFinais = await db.userRole.findMany({
    where: { tenantId: tenant.id, role: { isSystem: true, nome: 'owner' } },
    select: { user: { select: { id: true, nome: true, email: true } } },
  })
  if (ownersFinais.length === 1) {
    const o = ownersFinais[0].user
    await db.sede.update({
      where: { id: sede.id },
      data: { responsavelUserId: o.id, responsavel: o.nome },
    })
    console.log(`\nSede principal alinhada à presidência: ${o.nome ?? o.email}`)
  } else if (ownersFinais.length > 1) {
    console.warn(
      `\nAVISO: ${ownersFinais.length} owners em ${TENANT_SLUG} — a torcida admite 1. Consolide em Estrutura › Presidência.`,
    )
  }

  console.log('\n────────────────────────────────────────────────────────────────')
  console.log(`Tenant: ${tenant.nome} (${tenant.slug})`)
  console.log(`Entrar em: http://localhost:3000/entrar`)
  console.log(`Senha de TODOS: ${SENHA_TESTE}`)
  console.log('────────────────────────────────────────────────────────────────\n')
  console.log('E-mail'.padEnd(52), 'Visão')
  console.log('─'.repeat(52), '─'.repeat(48))
  for (const c of credenciais) {
    console.log(c.email.padEnd(52), c.visao)
  }
  console.log('')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
