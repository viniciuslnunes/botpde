import { describe, expect, it, vi, beforeEach } from 'vitest'
import { db } from '@torcida/db'
import { canFollowUser } from '../social'
import { avaliarAcessoDm } from '../mensageria'

vi.mock('@torcida/db', () => ({
  db: {
    saasMembro: { findFirst: vi.fn(), findMany: vi.fn() },
    userRole: { findFirst: vi.fn(), findMany: vi.fn() },
    bloqueioUsuario: { findFirst: vi.fn() },
    conversa: { findFirst: vi.fn() },
    perfilTorcedor: { findUnique: vi.fn() },
  },
}))

vi.mock('../hierarquia', () => ({
  getTenantRelation: vi.fn(),
}))

vi.mock('@torcida/types', () => ({
  saoRivais: (rel: string) => rel === 'rival',
}))

vi.mock('../social', () => ({
  canFollowUser: vi.fn(),
}))

const remetente = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const destinatario = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const tenant = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const clube = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.bloqueioUsuario.findFirst).mockResolvedValue(null)
  vi.mocked(db.conversa.findFirst).mockResolvedValue(null)
  vi.mocked(canFollowUser).mockResolvedValue(false)
  vi.mocked(db.saasMembro.findMany).mockResolvedValue([])
  vi.mocked(db.userRole.findMany).mockResolvedValue([])
  vi.mocked(db.userRole.findFirst).mockResolvedValue(null)

  vi.mocked(db.saasMembro.findFirst).mockImplementation(async (args: { where?: { userId?: string } }) => {
    const userId = args?.where?.userId
    if (userId === destinatario) return { id: 'socio' }
    return null
  })

  vi.mocked(db.perfilTorcedor.findUnique).mockImplementation(
    async (args: { where: { userId: string } }) => {
      const userId = args.where.userId
      if (userId === remetente || userId === destinatario) {
        return { afiliacaoId: clube }
      }
      return null
    },
  )
})

describe('avaliarAcessoDm', () => {
  it('torcedor → sócio mesmo clube exige solicitação na CN', async () => {
    const acesso = await avaliarAcessoDm(remetente, destinatario, null)
    expect(acesso).toBe('solicitacao')
  })

  it('torcedor → sócio mesmo clube exige solicitação com tenant (sem aliança)', async () => {
    const acesso = await avaliarAcessoDm(remetente, destinatario, tenant)
    expect(acesso).toBe('solicitacao')
  })

  it('bloqueio mútuo impede qualquer acesso', async () => {
    vi.mocked(db.bloqueioUsuario.findFirst).mockResolvedValue({ id: 'blk' })
    const acesso = await avaliarAcessoDm(remetente, destinatario, null)
    expect(acesso).toBe('bloqueado')
  })

  it('mesmo tenant/aliado permite DM direta', async () => {
    vi.mocked(canFollowUser).mockResolvedValue(true)
    vi.mocked(db.saasMembro.findFirst).mockResolvedValue({ id: 'socio' })
    const acesso = await avaliarAcessoDm(remetente, destinatario, tenant)
    expect(acesso).toBe('direto')
  })

  it('torcedor → torcedor mesmo clube na CN permite DM direta', async () => {
    vi.mocked(db.saasMembro.findFirst).mockResolvedValue(null)
    const acesso = await avaliarAcessoDm(remetente, destinatario, null)
    expect(acesso).toBe('direto')
  })

  it('torcedor → torcedor mesmo clube permanece direto mesmo com tenant de contexto', async () => {
    vi.mocked(db.saasMembro.findFirst).mockResolvedValue(null)
    const acesso = await avaliarAcessoDm(remetente, destinatario, tenant)
    expect(acesso).toBe('direto')
  })

  it('sócio → sócio mesmo clube sem aliança exige solicitação', async () => {
    vi.mocked(db.saasMembro.findFirst).mockResolvedValue({ id: 'socio' })
    const acesso = await avaliarAcessoDm(remetente, destinatario, tenant)
    expect(acesso).toBe('solicitacao')
  })

  it('DM rejeitada não impede nova avaliação quando findDm não a retorna', async () => {
    vi.mocked(db.conversa.findFirst).mockResolvedValue(null)
    vi.mocked(db.bloqueioUsuario.findFirst).mockResolvedValue(null)
    const acesso = await avaliarAcessoDm(remetente, destinatario, null)
    expect(acesso).toBe('solicitacao')
  })

  it('presidente só com cargo (sem SaasMembro) exige solicitação do torcedor', async () => {
    vi.mocked(db.saasMembro.findFirst).mockResolvedValue(null)
    vi.mocked(db.userRole.findFirst).mockResolvedValue({
      id: 'cargo',
      tenant: { afiliacaoId: clube },
    })
    const acesso = await avaliarAcessoDm(remetente, destinatario, null)
    expect(acesso).toBe('solicitacao')
  })

  it('presidente com cargo no mesmo tenant conversa direto', async () => {
    vi.mocked(canFollowUser).mockResolvedValue(true)
    vi.mocked(db.saasMembro.findFirst).mockResolvedValue(null)
    vi.mocked(db.userRole.findFirst).mockResolvedValue({ id: 'cargo' })
    const acesso = await avaliarAcessoDm(remetente, destinatario, tenant)
    expect(acesso).toBe('direto')
  })
})
