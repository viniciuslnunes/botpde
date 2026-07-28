import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks de banco e auth ───────────────────────────────────────────────────────
const perfilFindUnique = vi.hoisted(() => vi.fn())
const membroFindFirst = vi.hoisted(() => vi.fn())
const membroFindUnique = vi.hoisted(() => vi.fn())
const membroCreate = vi.hoisted(() => vi.fn())
const membroUpdate = vi.hoisted(() => vi.fn())
const afiliacaoFindUnique = vi.hoisted(() => vi.fn())
const perfilUpsert = vi.hoisted(() => vi.fn())
const tenantFindFirst = vi.hoisted(() => vi.fn())
const tenantFindMany = vi.hoisted(() => vi.fn())
const sedeFindMany = vi.hoisted(() => vi.fn())
const sedeFindUnique = vi.hoisted(() => vi.fn())
const departamentoFindFirst = vi.hoisted(() => vi.fn())
const userDepartamentoUpsert = vi.hoisted(() => vi.fn())
const auditLogCreate = vi.hoisted(() => vi.fn())
const perfilMembroUpsert = vi.hoisted(() => vi.fn())
// `tx` simula o Prisma.TransactionClient reusando os mesmos mocks de `db` —
// as queries dentro de `$transaction` usam o mesmo shape de `saasMembro`/`auditLog`.
const transactionFn = vi.hoisted(() =>
  vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      saasMembro: {
        findFirst: membroFindFirst,
        findUnique: membroFindUnique,
        create: membroCreate,
        update: membroUpdate,
      },
      auditLog: { create: auditLogCreate },
      $executeRaw: vi.fn(async () => 0),
    }),
  ),
)
const authFn = vi.hoisted(() => vi.fn())
const getDescendantTenantIdsFn = vi.hoisted(() => vi.fn(async () => [] as string[]))
const getAncestorTenantIdsFn = vi.hoisted(() => vi.fn(async () => [] as string[]))
const criarPendenciaEspelhoFn = vi.hoisted(() =>
  vi.fn(async () => ({ raizTenantId: null, espelhoId: null, ignoradoJaMembroDireto: false })),
)
const notificarNovoMembroPendenteFn = vi.hoisted(() => vi.fn(async () => undefined))
const userFindFirst = vi.hoisted(() => vi.fn(async () => null))
const userUpdate = vi.hoisted(() => vi.fn(async () => ({})))

const PrismaClientKnownRequestErrorMock = vi.hoisted(() => {
  return class PrismaClientKnownRequestErrorMock extends Error {
    code: string
    meta?: Record<string, unknown>
    constructor(message: string, opts: { code: string; meta?: Record<string, unknown> }) {
      super(message)
      this.code = opts.code
      this.meta = opts.meta
    }
  }
})
vi.mock('@torcida/db', () => ({
  db: {
    perfilTorcedor: { findUnique: perfilFindUnique, upsert: perfilUpsert },
    perfilMembro: { upsert: perfilMembroUpsert },
    saasMembro: { findFirst: membroFindFirst, findUnique: membroFindUnique, create: membroCreate, update: membroUpdate },
    afiliacao: { findUnique: afiliacaoFindUnique },
    user: { findFirst: userFindFirst, update: userUpdate },
    tenant: { findFirst: tenantFindFirst, findMany: tenantFindMany },
    sede: { findMany: sedeFindMany, findUnique: sedeFindUnique },
    departamento: { findFirst: departamentoFindFirst },
    userDepartamento: { upsert: userDepartamentoUpsert },
    auditLog: { create: auditLogCreate },
    $transaction: transactionFn,
  },
  Prisma: {
    PrismaClientKnownRequestError: PrismaClientKnownRequestErrorMock,
  },
}))
vi.mock('@/lib/auth', () => ({ auth: authFn }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/tenant', () => ({
  buildPortalUrl: (slug: string) => `/portal/comunidade?torcida=${slug}`,
}))
// `setTenantContextSlug`/`clearTenantContextSlug` usam cookies() do Next — indisponível fora de request.
vi.mock('@/lib/tenant-context', () => ({ setTenantContextSlug: vi.fn(), clearTenantContextSlug: vi.fn() }))
// `notificacoes.ts` valida env vars no import (fora do escopo deste teste).
const notificarSafeFn = vi.hoisted(() => vi.fn())
vi.mock('@/lib/notificacoes', () => ({ notificarSafe: notificarSafeFn }))
vi.mock('@/lib/notificacoes-routing', () => ({
  notificarNovoMembroPendente: notificarNovoMembroPendenteFn,
}))
vi.mock('@/lib/hierarquia', () => ({
  getDescendantTenantIds: getDescendantTenantIdsFn,
  getAncestorTenantIds: getAncestorTenantIdsFn,
}))
vi.mock('@/lib/membros-sede', () => ({
  criarOuAtualizarPendenciaEspelhoNaSede: criarPendenciaEspelhoFn,
  lockNumeroAssociadoDaTorcida: vi.fn(async () => undefined),
  encontrarConflitoNumeroAssociado: vi.fn(async () => null),
  encontrarConflitoCpf: vi.fn(async () => null),
  encontrarConflitoRg: vi.fn(async () => null),
  encontrarConflitoTelefone: vi.fn(async () => null),
}))
// Validação de cidade contra o IBGE — mockada para não bater na rede.
const cidadePertenceUfFn = vi.hoisted(() => vi.fn())
vi.mock('@/lib/municipios-ibge', () => ({
  cidadePertenceUf: cidadePertenceUfFn,
  listarMunicipiosPorUf: vi.fn(),
}))

import { getEstadoOnboarding } from '@/lib/onboarding'
import { salvarClubeRegiao, solicitarVinculo, concluirComoTorcedor } from '@/app/onboarding/actions'

const UUID = '11111111-1111-4111-8111-111111111111'
const UUID2 = '22222222-2222-4222-8222-222222222222'
const PROVA_URL = 'https://res.cloudinary.com/demo/image/upload/sample.jpg'

const vinculoBase = {
  tenantId: UUID,
  nome: 'Fulano da Silva',
  imagemProva: PROVA_URL,
}

beforeEach(() => {
  vi.clearAllMocks()
  authFn.mockResolvedValue({ user: { id: 'u1', name: 'Fulano' } })
})

describe('getEstadoOnboarding', () => {
  it('reporta perfil e ausência de vínculo', async () => {
    perfilFindUnique.mockResolvedValue({ afiliacaoId: null, regiao: null, onboardingConcluidoEm: null })
    membroFindFirst.mockResolvedValue(null)
    const r = await getEstadoOnboarding('u1')
    expect(r.perfil).not.toBeNull()
    expect(r.temMembro).toBe(false)
  })

  it('temMembro=true quando existe SaasMembro', async () => {
    perfilFindUnique.mockResolvedValue(null)
    membroFindFirst.mockResolvedValue({ id: 'm1' })
    const r = await getEstadoOnboarding('u1')
    expect(r.temMembro).toBe(true)
    expect(r.perfil).toBeNull()
  })
})

describe('salvarClubeRegiao', () => {
  const inputBase = { afiliacaoId: UUID, uf: 'SP', cidade: 'São Paulo' }

  it('rejeita afiliacaoId não-uuid', async () => {
    const r = await salvarClubeRegiao({ ...inputBase, afiliacaoId: 'nope' })
    expect(r.errors?.afiliacaoId).toBeTruthy()
    expect(afiliacaoFindUnique).not.toHaveBeenCalled()
  })

  it('rejeita UF inválida', async () => {
    const r = await salvarClubeRegiao({ ...inputBase, uf: 'XX' })
    expect(r.errors?.uf).toBeTruthy()
    expect(afiliacaoFindUnique).not.toHaveBeenCalled()
  })

  it('rejeita cidade vazia', async () => {
    const r = await salvarClubeRegiao({ ...inputBase, cidade: '' })
    expect(r.errors?.cidade).toBeTruthy()
    expect(afiliacaoFindUnique).not.toHaveBeenCalled()
  })

  it('erra quando afiliacao não existe', async () => {
    afiliacaoFindUnique.mockResolvedValue(null)
    const r = await salvarClubeRegiao(inputBase)
    expect(r.errors?.afiliacaoId).toContain('Clube não encontrado')
  })

  it('rejeita cidade que não pertence à UF (IBGE)', async () => {
    afiliacaoFindUnique.mockResolvedValue({ id: UUID })
    cidadePertenceUfFn.mockResolvedValue(null)
    const r = await salvarClubeRegiao({ ...inputBase, cidade: 'Curitiba' })
    expect(r.errors?.cidade?.[0]).toContain('Selecione uma cidade válida')
    expect(perfilUpsert).not.toHaveBeenCalled()
  })

  it('faz upsert com o nome canônico do IBGE', async () => {
    afiliacaoFindUnique.mockResolvedValue({ id: UUID })
    cidadePertenceUfFn.mockResolvedValue('São Paulo')
    perfilUpsert.mockResolvedValue({})
    const r = await salvarClubeRegiao({ ...inputBase, cidade: 'sao paulo' })
    expect(r.ok).toBe(true)
    expect(perfilUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ regiao: 'São Paulo - SP' }),
      }),
    )
  })

  it('exige login', async () => {
    authFn.mockResolvedValue(null)
    const r = await salvarClubeRegiao(inputBase)
    expect(r.message).toBeTruthy()
  })
})

describe('solicitarVinculo — validação', () => {
  it('rejeita tipo inválido', async () => {
    // @ts-expect-error tipo inválido de propósito
    const r = await solicitarVinculo({ tenantId: UUID, tipo: 'INVALIDO', nome: 'Fulano da Silva' })
    expect(r.errors?.tipo).toBeTruthy()
  })

  it('rejeita nome curto', async () => {
    const r = await solicitarVinculo({ tenantId: UUID, tipo: 'TORCEDOR', nome: 'ab', imagemProva: PROVA_URL })
    expect(r.errors?.nome).toBeTruthy()
  })

  it('erra quando tenant não existe', async () => {
    tenantFindFirst.mockResolvedValue(null)
    const r = await solicitarVinculo({ ...vinculoBase, tipo: 'TORCEDOR' })
    expect(r.message).toBeTruthy()
  })

  it('rejeita SOCIO sem imagemProva (comprovante obrigatório só para sócio)', async () => {
    const r = await solicitarVinculo({ tenantId: UUID, tipo: 'SOCIO', nome: 'Fulano da Silva' })
    expect(r.errors?.imagemProva).toBeTruthy()
    expect(membroCreate).not.toHaveBeenCalled()
  })

  it('rejeita SOCIO sem numeroAssociado', async () => {
    const r = await solicitarVinculo({ ...vinculoBase, tipo: 'SOCIO', anosSocio: 3, cep: '01310-100' })
    expect(r.errors?.numeroAssociado).toBeTruthy()
    expect(membroCreate).not.toHaveBeenCalled()
  })

  it('rejeita SOCIO sem anosSocio', async () => {
    const r = await solicitarVinculo({
      ...vinculoBase,
      tipo: 'SOCIO',
      numeroAssociado: '123456',
      cep: '01310-100',
    })
    expect(r.errors?.anosSocio).toBeTruthy()
    expect(membroCreate).not.toHaveBeenCalled()
  })

  it('rejeita SOCIO sem cep', async () => {
    const r = await solicitarVinculo({
      ...vinculoBase,
      tipo: 'SOCIO',
      numeroAssociado: '123456',
      anosSocio: 3,
    })
    expect(r.errors?.cep).toBeTruthy()
    expect(membroCreate).not.toHaveBeenCalled()
  })

  it('rejeita SOCIO sem termo de responsabilidade aceito', async () => {
    const r = await solicitarVinculo({
      ...vinculoBase,
      tipo: 'SOCIO',
      numeroAssociado: '123456',
      anosSocio: 3,
      cep: '01310-100',
      logradouro: 'Rua das Torcidas',
      bairro: 'Centro',
      uf: 'SP',
      rg: '12.345.678-9',
      cpf: '111.444.777-35',
      dataNascimento: '1990-01-01',
      termoResponsabilidadeAceito: false,
    })
    expect(r.errors?.termoResponsabilidadeAceito).toBeTruthy()
    expect(membroCreate).not.toHaveBeenCalled()
  })

  it('rejeita CPF inválido', async () => {
    const r = await solicitarVinculo({
      ...vinculoBase,
      tipo: 'SOCIO',
      numeroAssociado: '123456',
      anosSocio: 3,
      cep: '01310-100',
      logradouro: 'Rua das Torcidas',
      bairro: 'Centro',
      uf: 'SP',
      rg: '12.345.678-9',
      cpf: '111.111.111-11',
      dataNascimento: '1990-01-01',
      termoResponsabilidadeAceito: true,
    })
    expect(r.errors?.cpf).toBeTruthy()
    expect(membroCreate).not.toHaveBeenCalled()
  })

  it('rejeita RG inválido', async () => {
    const r = await solicitarVinculo({
      ...vinculoBase,
      tipo: 'SOCIO',
      numeroAssociado: '123456',
      anosSocio: 3,
      cep: '01310-100',
      logradouro: 'Rua das Torcidas',
      bairro: 'Centro',
      uf: 'SP',
      rg: '111111111',
      cpf: '111.444.777-35',
      dataNascimento: '1990-01-01',
      termoResponsabilidadeAceito: true,
    })
    expect(r.errors?.rg).toBeTruthy()
    expect(membroCreate).not.toHaveBeenCalled()
  })

  it('exige responsável legal quando SOCIO é menor de idade', async () => {
    const anoAtual = new Date().getFullYear()
    const r = await solicitarVinculo({
      ...vinculoBase,
      tipo: 'SOCIO',
      numeroAssociado: '123456',
      anosSocio: 1,
      cep: '01310-100',
      logradouro: 'Rua das Torcidas',
      bairro: 'Centro',
      uf: 'SP',
      rg: '12.345.678-9',
      cpf: '111.444.777-35',
      dataNascimento: `${anoAtual - 15}-01-01`,
      termoResponsabilidadeAceito: true,
    })
    expect(r.errors?.responsavelNome).toBeTruthy()
    expect(r.errors?.responsavelDocumento).toBeTruthy()
    expect(membroCreate).not.toHaveBeenCalled()
  })

  it('rejeita numeroAssociado com mais de 7 dígitos ou não numérico', async () => {
    const r = await solicitarVinculo({
      ...vinculoBase,
      tipo: 'SOCIO',
      anosSocio: 3,
      cep: '01310-100',
      numeroAssociado: '12345678',
    })
    expect(r.errors?.numeroAssociado).toBeTruthy()
    expect(membroCreate).not.toHaveBeenCalled()
  })

  it('rejeita SOCIO sem foto do RG quando documentos são obrigatórios', async () => {
    tenantFindFirst.mockResolvedValue({
      id: UUID,
      slug: 'torcida-teste',
      nome: 'Torcida Teste',
      exigirDocumentosCadastro: true,
    })
    const r = await solicitarVinculo({
      ...vinculoBase,
      tipo: 'SOCIO',
      numeroAssociado: '123456',
      anosSocio: 3,
      cep: '01310-100',
      logradouro: 'Rua das Torcidas',
      bairro: 'Centro',
      uf: 'SP',
      rg: '12.345.678-9',
      cpf: '111.444.777-35',
      dataNascimento: '1990-01-01',
      termoResponsabilidadeAceito: true,
      comprovanteResidenciaUrl: PROVA_URL,
      telefone: '(11) 98888-7777',
      email: 'fulano@example.com',
    })
    expect(r.errors?.fotoDocumentoUrl).toBeTruthy()
    expect(membroCreate).not.toHaveBeenCalled()
  })

  it('cria SaasMembro + AuditLog e conclui onboarding (torcedor, sem comprovante)', async () => {
    tenantFindFirst.mockResolvedValue({
      id: UUID,
      slug: 'torcida-teste',
      nome: 'Torcida Teste',
      exigirDocumentosCadastro: true,
    })
    sedeFindMany.mockResolvedValue([])
    membroFindUnique.mockResolvedValue(null)
    membroCreate.mockResolvedValue({ id: 'novo' })
    const r = await solicitarVinculo({ tenantId: UUID, tipo: 'TORCEDOR', nome: 'Fulano da Silva' })
    expect(r.redirectTo).toContain('/onboarding/solicitado')
    expect(r.ok).toBe(true)
    expect(membroCreate).toHaveBeenCalled()
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ acao: 'CADASTRO_SOLICITADO' }) }),
    )
    expect(perfilUpsert).toHaveBeenCalled()
  })

  it('sócio com departamento grava preferência sem UserDepartamento', async () => {
    tenantFindFirst.mockResolvedValue({
      id: UUID,
      slug: 'torcida-teste',
      nome: 'Torcida Teste',
      exigirDocumentosCadastro: true,
    })
    sedeFindMany.mockResolvedValue([])
    departamentoFindFirst.mockResolvedValue({ id: UUID2, slug: 'caravanas', nome: 'Caravanas' })
    membroFindUnique.mockResolvedValue(null)
    membroCreate.mockResolvedValue({ id: 'novo' })
    // Após create, fan-out busca o membro origem.
    membroFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'novo',
        userId: 'u1',
        tipo: 'SOCIO',
        nome: 'Fulano da Silva',
        idade: null,
        telefone: null,
        cidade: null,
        numeroAssociado: '123456',
        anosSocio: 3,
        cep: '01310100',
        numero: null,
        bloco: null,
        complemento: null,
        imagemProva: PROVA_URL,
        rg: '123456789',
        cpf: '11144477735',
        filiacao: null,
        escolaridade: null,
        profissao: null,
        dataNascimento: new Date('1990-01-01'),
        sexo: null,
        estadoCivil: null,
        nacionalidade: null,
        logradouro: 'Rua das Torcidas',
        bairro: 'Centro',
        uf: 'SP',
        fotoDocumentoUrl: PROVA_URL,
        comprovanteResidenciaUrl: PROVA_URL,
        responsavelNome: null,
        responsavelDocumento: null,
        autorizacaoMenorAceitaEm: null,
        termoResponsabilidadeAceitoEm: new Date(),
      })
    const r = await solicitarVinculo({
      tenantId: UUID,
      tipo: 'SOCIO',
      nome: 'Fulano da Silva',
      departamentoId: UUID2,
      imagemProva: PROVA_URL,
      numeroAssociado: '123456',
      anosSocio: 3,
      cep: '01310-100',
      logradouro: 'Rua das Torcidas',
      bairro: 'Centro',
      uf: 'SP',
      rg: '12.345.678-9',
      cpf: '111.444.777-35',
      dataNascimento: '1990-01-01',
      termoResponsabilidadeAceito: true,
      fotoDocumentoUrl: PROVA_URL,
      comprovanteResidenciaUrl: PROVA_URL,
      telefone: '(11) 98888-7777',
      email: 'fulano@example.com',
    })
    expect(r.redirectTo).toContain('/onboarding/solicitado')
    expect(membroCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          departamentoId: UUID2,
          status: 'PENDENTE',
        }),
      }),
    )
    expect(userDepartamentoUpsert).not.toHaveBeenCalled()
  })

  it('bloqueia quando já APROVADO', async () => {
    tenantFindFirst.mockResolvedValue({
      id: UUID,
      slug: 'torcida-teste',
      nome: 'Torcida Teste',
      exigirDocumentosCadastro: true,
    })
    sedeFindMany.mockResolvedValue([])
    membroFindUnique.mockResolvedValue({ id: 'm1', status: 'APROVADO' })
    const r = await solicitarVinculo({ ...vinculoBase, tipo: 'TORCEDOR' })
    expect(r.message).toContain('já é membro aprovado')
  })
})

describe('concluirComoTorcedor', () => {
  it('faz upsert e devolve redirectTo', async () => {
    perfilUpsert.mockResolvedValue({})
    const r = await concluirComoTorcedor()
    expect(r.redirectTo).toBe('/portal/comunidade')
    expect(r.ok).toBe(true)
    expect(perfilUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ onboardingConcluidoEm: expect.any(Date) }),
      }),
    )
  })
})
