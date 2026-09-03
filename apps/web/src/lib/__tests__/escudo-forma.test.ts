import { afterEach, describe, expect, it } from 'vitest'
import {
  analisarEscudoCircularDeImageData,
  aplicarMascaraCircularEmImageData,
  gravarCacheEscudoCircular,
  lerCacheEscudoCircular,
  limparCacheEscudoCircular,
  subscribeEscudoCircular,
} from '@/lib/escudo-forma'

const SAMPLE = 64

function canvasVazio(): Uint8ClampedArray {
  return new Uint8ClampedArray(SAMPLE * SAMPLE * 4)
}

function pintarCirculoOpaco(
  data: Uint8ClampedArray,
  cx: number,
  cy: number,
  r: number,
) {
  const r2 = r * r
  for (let y = 0; y < SAMPLE; y++) {
    for (let x = 0; x < SAMPLE; x++) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= r2) {
        const i = (y * SAMPLE + x) * 4
        data[i] = 20
        data[i + 1] = 20
        data[i + 2] = 20
        data[i + 3] = 255
      }
    }
  }
}

function pintarFundo(data: Uint8ClampedArray, r: number, g: number, b: number) {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = 255
  }
}

function pintarFundoBranco(data: Uint8ClampedArray) {
  pintarFundo(data, 255, 255, 255)
}

function pintarFundoPreto(data: Uint8ClampedArray) {
  pintarFundo(data, 0, 0, 0)
}

/** Disco colorido (não-preto) — conteúdo visível sobre fundo preto. */
function pintarCirculoColorido(
  data: Uint8ClampedArray,
  cx: number,
  cy: number,
  r: number,
) {
  const r2 = r * r
  for (let y = 0; y < SAMPLE; y++) {
    for (let x = 0; x < SAMPLE; x++) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= r2) {
        const i = (y * SAMPLE + x) * 4
        data[i] = 200
        data[i + 1] = 40
        data[i + 2] = 40
        data[i + 3] = 255
      }
    }
  }
}

function pintarSilhuetaIrregular(data: Uint8ClampedArray) {
  for (let y = 18; y < 50; y++) {
    for (let x = 22; x < 42; x++) {
      const i = (y * SAMPLE + x) * 4
      data[i] = 240
      data[i + 1] = 240
      data[i + 2] = 240
      data[i + 3] = 255
    }
  }
  for (let y = 20; y < 36; y++) {
    for (let x = 8; x < 22; x++) {
      const i = (y * SAMPLE + x) * 4
      data[i] = 240
      data[i + 1] = 240
      data[i + 2] = 240
      data[i + 3] = 255
    }
  }
}

/** Escudo heráldico centrado em fundo branco (Corinthians, São Paulo…). */
function pintarEscudoHeraldicoEmBranco(data: Uint8ClampedArray) {
  pintarFundoBranco(data)
  const cx = (SAMPLE - 1) / 2
  for (let y = 8; y < 56; y++) {
    const t = (y - 8) / 48
    const halfWidth = 22 * (1 - t * 0.88)
    for (let x = Math.floor(cx - halfWidth); x <= Math.ceil(cx + halfWidth); x++) {
      if (x < 0 || x >= SAMPLE) continue
      const i = (y * SAMPLE + x) * 4
      data[i] = 180
      data[i + 1] = 20
      data[i + 2] = 20
      data[i + 3] = 255
    }
  }
}

describe('escudo-forma', () => {
  it('não mascara disco com fundo transparente', () => {
    const data = canvasVazio()
    pintarCirculoOpaco(data, 31.5, 31.5, 28)
    expect(analisarEscudoCircularDeImageData(data)).toBe(false)
  })

  it('mascara disco em fundo branco (cantos brancos)', () => {
    const data = canvasVazio()
    pintarFundoBranco(data)
    pintarCirculoOpaco(data, 31.5, 31.5, 28)
    expect(analisarEscudoCircularDeImageData(data)).toBe(true)
  })

  it('mascara disco em fundo preto (cantos pretos)', () => {
    const data = canvasVazio()
    pintarFundoPreto(data)
    pintarCirculoColorido(data, 31.5, 31.5, 28)
    expect(analisarEscudoCircularDeImageData(data)).toBe(true)
  })

  it('mascara disco em fundo #0a0a0a (JPEG do crop sem alpha)', () => {
    const data = canvasVazio()
    pintarFundo(data, 10, 10, 10)
    pintarCirculoColorido(data, 31.5, 31.5, 28)
    expect(analisarEscudoCircularDeImageData(data)).toBe(true)
  })

  it('mascara badge quase full-bleed em fundo branco (Camisa 12)', () => {
    const data = canvasVazio()
    pintarFundoBranco(data)
    // Disco quase na borda — meios das bordas têm tinta (borda preta do badge).
    pintarCirculoOpaco(data, 31.5, 31.5, 30.5)
    expect(analisarEscudoCircularDeImageData(data)).toBe(true)
  })

  it('não mascara silhueta irregular com alpha (Gaviões)', () => {
    const data = canvasVazio()
    pintarSilhuetaIrregular(data)
    expect(analisarEscudoCircularDeImageData(data)).toBe(false)
  })

  it('não marca retângulo cheio sobre branco como circular', () => {
    const data = canvasVazio()
    pintarFundoBranco(data)
    for (let y = 1; y < SAMPLE - 1; y++) {
      for (let x = 1; x < SAMPLE - 1; x++) {
        const i = (y * SAMPLE + x) * 4
        data[i] = 30
        data[i + 1] = 30
        data[i + 2] = 30
        data[i + 3] = 255
      }
    }
    expect(analisarEscudoCircularDeImageData(data)).toBe(false)
  })

  it('não mascara escudo heráldico em fundo branco', () => {
    const data = canvasVazio()
    pintarEscudoHeraldicoEmBranco(data)
    expect(analisarEscudoCircularDeImageData(data)).toBe(false)
  })
})

describe('máscara circular no upload', () => {
  it('fura os cantos opacos e preserva o disco', () => {
    const data = canvasVazio()
    pintarFundoBranco(data)
    pintarCirculoOpaco(data, 31.5, 31.5, 28)
    expect(analisarEscudoCircularDeImageData(data)).toBe(true)
    aplicarMascaraCircularEmImageData(data, SAMPLE, SAMPLE)
    // Canto: transparente
    expect(data[3]).toBe(0)
    expect(data[((SAMPLE - 1) * SAMPLE + (SAMPLE - 1)) * 4 + 3]).toBe(0)
    // Centro do disco: opaco
    const meio = (Math.floor(SAMPLE / 2) * SAMPLE + Math.floor(SAMPLE / 2)) * 4
    expect(data[meio + 3]).toBe(255)
    expect(data[meio]).toBe(20)
  })
})

describe('cache escudo circular', () => {
  afterEach(() => {
    limparCacheEscudoCircular()
  })

  it('retorna null sem entrada', () => {
    expect(lerCacheEscudoCircular('https://cdn.example/escudo.png')).toBeNull()
  })

  it('grava e relê o resultado', () => {
    gravarCacheEscudoCircular('https://cdn.example/a.png', true)
    gravarCacheEscudoCircular('https://cdn.example/b.png', false)
    expect(lerCacheEscudoCircular('https://cdn.example/a.png')).toBe(true)
    expect(lerCacheEscudoCircular('https://cdn.example/b.png')).toBe(false)
  })

  it('limpa memória e storage', () => {
    gravarCacheEscudoCircular('https://cdn.example/a.png', true)
    limparCacheEscudoCircular()
    expect(lerCacheEscudoCircular('https://cdn.example/a.png')).toBeNull()
  })

  it('notifica assinantes quando o cache é gravado', () => {
    const seen: Array<{ url: string; valor: boolean }> = []
    const unsub = subscribeEscudoCircular((url, valor) => {
      seen.push({ url, valor })
    })
    gravarCacheEscudoCircular('https://cdn.example/a.png', true)
    gravarCacheEscudoCircular('https://cdn.example/b.png', false)
    unsub()
    gravarCacheEscudoCircular('https://cdn.example/c.png', true)
    expect(seen).toEqual([
      { url: 'https://cdn.example/a.png', valor: true },
      { url: 'https://cdn.example/b.png', valor: false },
    ])
  })
})
