import { describe, expect, it, vi, beforeEach } from 'vitest'
import { db } from '@torcida/db'
import { canFollowUser } from '../social'
import { podeConvidarParaGrupoChat } from '../mensageria'

vi.mock('@torcida/db', () => ({
  db: {
    saasMembro: { findFirst: vi.fn(), findMany: vi.fn() },
    userRole: { findFirst: vi.fn(), findMany: vi.fn() },
    bloqueioUsuario: { findFirst: vi.fn() },
    conversa: { findFirst: vi.fn() },
    perfilTorcedor: { findUnique: vi.fn() },
    seguimento: { findFirst: vi.fn() },
  },
}))

vi.mock('../social', () => ({
  canFollowUser: vi.fn(),
}))

const convidante = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const alvo = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const tenant = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.bloqueioUsuario.findFirst).mockResolvedValue(null)
  vi.mocked(db.seguimento.findFirst).mockResolvedValue(null)
  vi.mocked(canFollowUser).mockResolvedValue(false)
})

describe('podeConvidarParaGrupoChat', () => {
  it('bloqueia sócio/privado do mesmo clube sem rede na CN', async () => {
    const ok = await podeConvidarParaGrupoChat(convidante, alvo, null)
    expect(ok).toBe(false)
  })

  it('permite quem está na rede (seguimento aprovado)', async () => {
    vi.mocked(db.seguimento.findFirst).mockResolvedValue({ id: 'seg' })
    const ok = await podeConvidarParaGrupoChat(convidante, alvo, null)
    expect(ok).toBe(true)
  })

  it('permite associado da torcida (canMessage) fora da rede', async () => {
    vi.mocked(canFollowUser).mockResolvedValue(true)
    const ok = await podeConvidarParaGrupoChat(convidante, alvo, tenant)
    expect(ok).toBe(true)
  })

  it('bloqueio mútuo impede convite', async () => {
    vi.mocked(db.bloqueioUsuario.findFirst).mockResolvedValue({ id: 'blk' })
    vi.mocked(db.seguimento.findFirst).mockResolvedValue({ id: 'seg' })
    const ok = await podeConvidarParaGrupoChat(convidante, alvo, tenant)
    expect(ok).toBe(false)
  })
})
