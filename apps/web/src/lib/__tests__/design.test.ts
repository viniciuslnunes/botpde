import { describe, expect, it } from 'vitest'
import {
  CLUBE_PALETAS,
  CONTRASTE_AA,
  CONTRASTE_AA_GRANDE,
  DEFAULT_TENANT_DESIGN,
  aplicarPaletaAoDesign,
  ajustarParaContraste,
  contrasteRatio,
  designFromPrimary,
  gerarPaletasSugeridas,
  paletaDoClube,
  paletaTemContrasteOk,
  resolveActionTextColors,
  resolverFillDaMarca,
  resolverSuperficies,
  sanearContrasteDoDesign,
  textoSobreFill,
} from '@torcida/types'

function assertPapelAa(
  design: Parameters<typeof resolverSuperficies>[0],
  mode: 'light' | 'dark',
) {
  const s = resolverSuperficies(design, mode)
  expect(contrasteRatio(s.foreground, s.background)).toBeGreaterThanOrEqual(CONTRASTE_AA)
  expect(contrasteRatio(s.foreground, s.surface)).toBeGreaterThanOrEqual(CONTRASTE_AA)
  expect(contrasteRatio(s.foregroundMuted, s.background)).toBeGreaterThanOrEqual(CONTRASTE_AA)
  expect(contrasteRatio(s.foregroundMuted, s.surface)).toBeGreaterThanOrEqual(CONTRASTE_AA)
}

describe('paletaDoClube — matching', () => {
  it('casa nome oficial do Corinthians, não o Sport', () => {
    const hit = paletaDoClube('Sport Club Corinthians Paulista', 'Timão')
    expect(hit?.primary).toBe('#1a1a1a')
    expect(hit?.fonte).toBe('clube')
  })

  it('casa Sport Recife sem colidir com Corinthians', () => {
    const hit = paletaDoClube('Sport Club do Recife', null)
    expect(hit?.primary).toBe('#e30613')
    expect(hit?.secondary).toBe('#000000')
  })

  it('casa Atlético Mineiro pelo nome longo', () => {
    const hit = paletaDoClube('Clube Atlético Mineiro', 'Galo')
    expect(hit?.primary).toBe('#000000')
  })

  it('casa Vasco da Gama e Flamengo oficiais', () => {
    expect(paletaDoClube('Club de Regatas Vasco da Gama', null)?.primary).toBe('#000000')
    expect(paletaDoClube('Clube de Regatas do Flamengo', null)?.primary).toBe('#c8102e')
  })
})

describe('contraste iterativo', () => {
  it('ajustarParaContraste fecha 4.5:1 ou cai no extremo', () => {
    const fg = ajustarParaContraste('#c8102e', '#ffffff', CONTRASTE_AA)
    expect(contrasteRatio(fg, '#ffffff')).toBeGreaterThanOrEqual(CONTRASTE_AA)
  })

  it('âmbar e vermelho de ação fecham 4.5:1 como texto no papel claro', () => {
    const s = resolverSuperficies(DEFAULT_TENANT_DESIGN, 'light')
    for (const hex of ['#d97706', '#dc2626'] as const) {
      const text = resolveActionTextColors(hex, null, s.surface)
      expect(contrasteRatio(text.fg, s.surface)).toBeGreaterThanOrEqual(CONTRASTE_AA)
      expect(contrasteRatio(text.fg, '#ffffff')).toBeGreaterThanOrEqual(CONTRASTE_AA)
    }
  })

  it('textoSobreFill escolhe preto no âmbar (não branco)', () => {
    expect(textoSobreFill('#d97706')).toBe('#0a0a0a')
    expect(contrasteRatio(textoSobreFill('#d97706'), '#d97706')).toBeGreaterThanOrEqual(
      CONTRASTE_AA_GRANDE,
    )
  })

  it('override pálido no papel claro é descartado', () => {
    const text = resolveActionTextColors('#d97706', '#fde68a', '#ffffff')
    expect(contrasteRatio(text.fg, '#ffffff')).toBeGreaterThanOrEqual(CONTRASTE_AA)
    expect(text.fg.toLowerCase()).not.toBe('#fde68a')
  })

  it('branco sobre papel claro ganha fill visível', () => {
    const fill = resolverFillDaMarca('#ffffff', '#ffffff')
    expect(fill.toLowerCase()).not.toBe('#ffffff')
    expect(contrasteRatio(fill, '#ffffff')).toBeGreaterThan(1)
  })
})

describe('superfícies derivado da marca', () => {
  it('Gaviões P&B: papel branco no claro (sem cinza sujo) e AA nos dois temas', () => {
    const paletas = gerarPaletasSugeridas('#7c3aed', {
      slug: 'pde-gavioes-fiel',
      clube: paletaDoClube('Corinthians', 'Timão'),
    })
    const marca = paletas[0]!
    expect(marca.primary.toLowerCase()).toBe('#1a1a1a')
    const d = aplicarPaletaAoDesign(DEFAULT_TENANT_DESIGN, marca)
    const light = resolverSuperficies(d, 'light')
    expect(light.background.toLowerCase()).toBe('#ffffff')
    assertPapelAa(d, 'light')
    assertPapelAa(d, 'dark')
    expect(paletaTemContrasteOk(marca)).toBe(true)
  })

  it('Flamengo: primária vermelha fecha texto no claro e no escuro', () => {
    const clube = paletaDoClube('Clube de Regatas do Flamengo', null)
    const paletas = gerarPaletasSugeridas('#c8102e', { clube })
    const d = aplicarPaletaAoDesign(DEFAULT_TENANT_DESIGN, paletas[2]!)
    for (const mode of ['light', 'dark'] as const) {
      const s = resolverSuperficies(d, mode)
      const text = resolveActionTextColors('#c8102e', null, s.surface)
      expect(contrasteRatio(text.on, text.fill)).toBeGreaterThanOrEqual(CONTRASTE_AA)
      expect(contrasteRatio(text.fg, s.surface)).toBeGreaterThanOrEqual(CONTRASTE_AA)
    }
    assertPapelAa(d, 'light')
    assertPapelAa(d, 'dark')
  })

  it('Palmeiras: sucesso continua verde (identidade)', () => {
    const clube = paletaDoClube('Sociedade Esportiva Palmeiras', null)
    const paletas = gerarPaletasSugeridas('#006437', { clube })
    expect(paletas[2]!.actions.success).not.toBe('#1d4ed8')
  })

  it('primária branca (Santos jovem) não some no claro', () => {
    const d = designFromPrimary('#ffffff', '#000000')
    const light = resolverSuperficies(d, 'light')
    const text = resolveActionTextColors('#ffffff', null, light.surface)
    expect(contrasteRatio(text.on, text.fill)).toBeGreaterThanOrEqual(CONTRASTE_AA)
    assertPapelAa(d, 'light')
    assertPapelAa(d, 'dark')
  })

  it('gerarPaletasSugeridas devolve exatamente 3 cards na ordem torcida → escudo → clube', () => {
    const clube = paletaDoClube('Sport Club Corinthians Paulista', null)
    const paletas = gerarPaletasSugeridas('#7c3aed', {
      slug: 'pde-gavioes-fiel',
      clube,
    })
    expect(paletas).toHaveLength(3)
    expect(paletas.map((p) => p.id)).toEqual(['marca-torcida', 'escudo', 'clube'])
    expect(paletas[2]!.fonte).toBe('clube')
    expect(paletas[2]!.primary).toBe('#1a1a1a')
  })

  it('designFromPrimary já traz superfícies AA', () => {
    const d = designFromPrimary('#e4002b', '#000000')
    expect(d.light.foreground).toBeTruthy()
    assertPapelAa(d, 'light')
    assertPapelAa(d, 'dark')
  })

  it('sanearContrasteDoDesign recupera muted fraco no claro', () => {
    const quebrado = {
      ...DEFAULT_TENANT_DESIGN,
      brand: { primary: '#1a1a1a', secondary: '#ffffff' },
      light: { background: '#e8e8e8', foregroundMuted: '#9ca3af' },
    }
    const saneado = sanearContrasteDoDesign(quebrado)
    const s = resolverSuperficies(saneado, 'light')
    expect(contrasteRatio(s.foregroundMuted, s.background)).toBeGreaterThanOrEqual(CONTRASTE_AA)
  })

  it('todas as paletas de clube fecham AA ao aplicar', () => {
    const seen = new Set<string>()
    for (const [key, spec] of Object.entries(CLUBE_PALETAS)) {
      const fingerprint = `${spec.primary}${spec.secondary}`
      if (seen.has(fingerprint)) continue
      seen.add(fingerprint)
      const paletas = gerarPaletasSugeridas(spec.primary, {
        clube: {
          primary: spec.primary,
          secondary: spec.secondary,
          accents: spec.accents,
        },
      })
      const clube = paletas.find((p) => p.id === 'clube')
      expect(clube, key).toBeTruthy()
      expect(paletaTemContrasteOk(clube!), `${key} contraste`).toBe(true)
    }
  })
})
