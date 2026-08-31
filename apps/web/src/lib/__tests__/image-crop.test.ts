import { describe, expect, it } from 'vitest'
import {
  clampCropOffset,
  clampCropZoom,
  coverScale,
  cropFrameSizeForAspect,
  DEFAULT_CROP_VIEWPORT,
  LOJA_CAPA_ASPECT,
  MAX_CROP_ZOOM,
  MIN_CROP_ZOOM,
} from '@/lib/image-crop'

describe('image-crop', () => {
  it('calcula cover scale para enquadrar a janela', () => {
    expect(coverScale(1600, 900, 320, 180)).toBeCloseTo(0.2)
    expect(coverScale(800, 1200, 320, 180)).toBeCloseTo(0.4)
  })

  it('limita pan para não furar o frame', () => {
    const clamped = clampCropOffset(500, -500, 400, 400, 320, 180)
    expect(clamped.offsetX).toBe(40)
    expect(clamped.offsetY).toBe(-110)
  })

  it('expõe viewport padrão no meio do range de zoom', () => {
    expect(DEFAULT_CROP_VIEWPORT).toEqual({ zoom: 1, offsetX: 0, offsetY: 0 })
    expect(DEFAULT_CROP_VIEWPORT.zoom).toBeCloseTo((MIN_CROP_ZOOM + MAX_CROP_ZOOM) / 2)
  })

  it('permite afastar e aproximar a partir do cover', () => {
    expect(clampCropZoom(0.25)).toBe(MIN_CROP_ZOOM)
    expect(clampCropZoom(0.75)).toBe(0.75)
    expect(clampCropZoom(1)).toBe(1)
    expect(clampCropZoom(3)).toBe(MAX_CROP_ZOOM)
  })

  it('inicia o frame do crop no mesmo aspecto da janela CSS', () => {
    expect(cropFrameSizeForAspect(16 / 9)).toEqual({ w: 320, h: 180 })
    expect(cropFrameSizeForAspect(1, 320)).toEqual({ w: 320, h: 320 })
    const banner = cropFrameSizeForAspect(3)
    expect(banner.w / banner.h).toBeCloseTo(3)
  })

  it('usa 16:9 na capa da loja (igual aos cards da vitrine)', () => {
    expect(LOJA_CAPA_ASPECT).toBeCloseTo(16 / 9)
  })
})
