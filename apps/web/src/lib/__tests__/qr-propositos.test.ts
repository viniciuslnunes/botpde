import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  QR_PROPOSITOS,
  QR_PROPOSITOS_IDS,
  QR_CARTEIRINHA,
  ehPropositoQrConhecido,
  propositoQrCoerente,
} from '@torcida/types'

const LIB_DIR = join(process.cwd(), 'src', 'lib')

/** Módulos que emitem/leem QR: `*-qr.ts`, menos a primitiva e o parser cliente. */
function modulosQr(): string[] {
  if (!existsSync(LIB_DIR)) return []
  return readdirSync(LIB_DIR).filter(
    (f) => f.endsWith('-qr.ts') && f !== 'qr-token.ts' && f !== 'qr-payload.ts',
  )
}

describe('registro de propósitos de QR', () => {
  it('não tem id duplicado — colisão aqui é falha de segurança, não typo', () => {
    const ids = Object.values(QR_PROPOSITOS).map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('a chave do mapa é o próprio id', () => {
    for (const [chave, p] of Object.entries(QR_PROPOSITOS)) {
      expect(p.id, `propósito ${chave}`).toBe(chave)
    }
  })

  it('todo propósito declara identificação, rotação, verificação e módulo', () => {
    for (const p of Object.values(QR_PROPOSITOS)) {
      expect(['pessoa', 'conta', 'objeto', 'recurso-coletivo']).toContain(p.identifica)
      expect(['servidor', 'cliente']).toContain(p.verificacao)
      expect(typeof p.rotativo, p.id).toBe('boolean')
      expect(p.modulo.length, p.id).toBeGreaterThan(0)
    }
  })

  it('recurso coletivo é obrigatoriamente rotativo', () => {
    // Fixo, o QR de um recurso que serve a quem apontar vira print no grupo — e
    // a pergunta que ele existe para responder passa a ter resposta errada.
    for (const p of Object.values(QR_PROPOSITOS)) {
      expect(propositoQrCoerente(p), `propósito ${p.id}`).toBe(true)
    }
  })

  it('reconhece o que está registrado e recusa o que não está', () => {
    for (const id of QR_PROPOSITOS_IDS) expect(ehPropositoQrConhecido(id)).toBe(true)
    expect(ehPropositoQrConhecido('inventado')).toBe(false)
    // Não pode cair em herança de Object.prototype.
    expect(ehPropositoQrConhecido('toString')).toBe(false)
  })

  it('o id da carteirinha está congelado', () => {
    // Mudar isto invalida carteirinha já impressa e salva na galeria de quem
    // está na fila do portão. É incidente, não refactor.
    expect(QR_CARTEIRINHA).toBe('carteirinha')
  })
})

describe('consumidores usam o registro, não literais soltos', () => {
  it('encontra os módulos de QR', () => {
    // Guarda contra o teste abaixo passar por varrer zero arquivo.
    expect(modulosQr().length).toBeGreaterThanOrEqual(5)
  })

  it('nenhum módulo define o propósito como string crua', () => {
    const infratores = modulosQr().filter((arquivo) => {
      const fonte = readFileSync(join(LIB_DIR, arquivo), 'utf8')
      return /const PROPOSITO\s*=\s*['"`]/.test(fonte)
    })
    expect(infratores, `use a constante de @torcida/types em: ${infratores.join(', ')}`).toEqual([])
  })

  it('todo módulo de QR importa um propósito do registro', () => {
    const semRegistro = modulosQr().filter((arquivo) => {
      const fonte = readFileSync(join(LIB_DIR, arquivo), 'utf8')
      return !QR_PROPOSITOS_IDS.some(() => /QR_[A-Z_]+/.test(fonte))
    })
    expect(semRegistro).toEqual([])
  })
})
