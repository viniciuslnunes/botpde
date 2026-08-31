import { describe, expect, it } from 'vitest'
import {
  APP_MODAL_BACKDROP_CLASS,
  APP_MODAL_HEIGHT_CLASS,
  APP_MODAL_HEIGHTS,
  APP_MODAL_PANEL_CLASS,
  APP_MODAL_SIZE_CLASS,
  APP_MODAL_SIZES,
} from '@/lib/app-modal'

describe('AppModal — larguras', () => {
  it('declara sm < md < lg < xl', () => {
    expect(APP_MODAL_SIZES).toEqual(['sm', 'md', 'lg', 'xl'])
    expect(APP_MODAL_SIZE_CLASS.sm).toContain('max-w-md')
    expect(APP_MODAL_SIZE_CLASS.md).toContain('42rem')
    expect(APP_MODAL_SIZE_CLASS.lg).toContain('56rem')
    expect(APP_MODAL_SIZE_CLASS.xl).toContain('80rem')
  })

  it('lg e xl capam em 100vw para não estourar o mobile', () => {
    expect(APP_MODAL_SIZE_CLASS.lg).toContain('100vw')
    expect(APP_MODAL_SIZE_CLASS.xl).toContain('100vw')
  })
})

describe('AppModal — altura', () => {
  it('frame trava a altura; auto só impõe teto', () => {
    expect(APP_MODAL_HEIGHTS).toEqual(['auto', 'frame'])
    expect(APP_MODAL_HEIGHT_CLASS.auto).toMatch(/max-h-/)
    expect(APP_MODAL_HEIGHT_CLASS.auto).not.toMatch(/(?:^| )h-\[/)
    expect(APP_MODAL_HEIGHT_CLASS.frame).toMatch(/h-\[min\(92dvh/)
    expect(APP_MODAL_HEIGHT_CLASS.frame).toContain('100dvh-2rem')
  })
})

describe('AppModal — safe-area', () => {
  // No mobile o painel encosta na borda de baixo (`items-end` + `p-0`), então
  // sem o inset o rodapé de ações cai embaixo do home indicator do iPhone.
  it('backdrop encosta o painel na borda de baixo no mobile', () => {
    expect(APP_MODAL_BACKDROP_CLASS).toContain('items-end')
    expect(APP_MODAL_BACKDROP_CLASS).toContain('p-0')
    expect(APP_MODAL_BACKDROP_CLASS).toContain('sm:items-center')
  })

  it('painel reserva o inset inferior no mobile e zera no desktop', () => {
    expect(APP_MODAL_PANEL_CLASS).toContain('pb-[env(safe-area-inset-bottom)]')
    expect(APP_MODAL_PANEL_CLASS).toContain('sm:pb-0')
  })
})
