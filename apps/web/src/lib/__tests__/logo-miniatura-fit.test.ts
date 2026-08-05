import { describe, expect, it } from 'vitest'
import { bboxConteudoOpaco, destinoContain } from '@/lib/logo-miniatura-fit'

function rgba(w: number, h: number, fill: [number, number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0]
    data[i + 1] = fill[1]
    data[i + 2] = fill[2]
    data[i + 3] = fill[3]
  }
  return data
}

function pintar(
  data: Uint8ClampedArray,
  w: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rgb: [number, number, number],
) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * w + x) * 4
      data[i] = rgb[0]
      data[i + 1] = rgb[1]
      data[i + 2] = rgb[2]
      data[i + 3] = 255
    }
  }
}

describe('bboxConteudoOpaco', () => {
  it('retorna null em canvas transparente', () => {
    expect(bboxConteudoOpaco(rgba(8, 8, [0, 0, 0, 0]), 8, 8)).toBeNull()
  })

  it('recorta padding transparente ao redor do conteúdo', () => {
    const data = rgba(20, 20, [0, 0, 0, 0])
    pintar(data, 20, 4, 6, 11, 15, [200, 0, 0])
    expect(bboxConteudoOpaco(data, 20, 20)).toEqual({ x: 4, y: 6, w: 8, h: 10 })
  })
})

describe('destinoContain', () => {
  it('centraliza arte quadrada no box com padding', () => {
    const d = destinoContain(100, 100, 32, 2)
    expect(d.dx).toBeCloseTo(2)
    expect(d.dy).toBeCloseTo(2)
    expect(d.dw).toBeCloseTo(28)
    expect(d.dh).toBeCloseTo(28)
  })

  it('mantém proporção de arte alta (escudo tipo Gaviões)', () => {
    const d = destinoContain(50, 100, 32, 2)
    expect(d.dh).toBeCloseTo(28)
    expect(d.dw).toBeCloseTo(14)
    expect(d.dx).toBeCloseTo(9)
    expect(d.dy).toBeCloseTo(2)
  })

  it('mantém proporção de arte larga', () => {
    const d = destinoContain(100, 50, 32, 2)
    expect(d.dw).toBeCloseTo(28)
    expect(d.dh).toBeCloseTo(14)
    expect(d.dx).toBeCloseTo(2)
    expect(d.dy).toBeCloseTo(9)
  })
})
