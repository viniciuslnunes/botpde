import { describe, expect, it } from 'vitest'
import {
  CLUBE_PALETAS,
  CONTRASTE_AA,
  CONTRASTE_AA_GRANDE,
  DEFAULT_ACTIONS,
  DEFAULT_TENANT_DESIGN,
  aplicarPaletaAoDesign,
  ajustarParaContraste,
  contrasteRatio,
  designFromPrimary,
  familiaHueCromatica,
  gerarPaletasSugeridas,
  isVerdeIdentidade,
  mixHex,
  paletaDoClube,
  paletaTemContrasteOk,
  resolveActionTextColors,
  resolveTenantDesign,
  resolverCorSemRivalidade,
  resolverFillDaMarca,
  resolverSuperficies,
  sanearAcoesContraRivalidade,
  sanearContrasteDoDesign,
  textoSobreFill,
  corArquirrivalCatalogo,
  proporCorArquirrival,
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

  it('badge de status (wash 16%) fecha 4.5:1 nos dois temas — marca branca (Santos)', () => {
    const d = designFromPrimary('#ffffff', '#d32924')
    for (const mode of ['light', 'dark'] as const) {
      const s = resolverSuperficies(d, mode)
      for (const hex of [d.actions.warning, d.actions.info, d.actions.danger] as const) {
        const text = resolveActionTextColors(hex, null, s.surface)
        const soft = mixHex(s.surface, text.fill, 0.16)
        expect(contrasteRatio(text.fg, s.surface)).toBeGreaterThanOrEqual(CONTRASTE_AA)
        expect(contrasteRatio(text.fg, soft), `${mode} ${hex}`).toBeGreaterThanOrEqual(
          CONTRASTE_AA,
        )
      }
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

describe('resolverCorSemRivalidade — identidade × arquirrival', () => {
  it('Gaviões: verde de financeiro/carnaval não pinta a casa', () => {
    for (const verde of ['#047857', '#4d7c0f'] as const) {
      const next = resolverCorSemRivalidade(verde, {
        slug: 'pde-gavioes-fiel',
        corPrimaria: '#1a1a1a',
      })
      expect(isVerdeIdentidade(next), verde).toBe(false)
      expect(familiaHueCromatica(next), verde).not.toBe('verde')
    }
  })

  it('Mancha/Palmeiras: verde de identidade permanece', () => {
    const next = resolverCorSemRivalidade('#047857', {
      slug: 'mancha-alviverde',
      corPrimaria: '#006437',
    })
    expect(isVerdeIdentidade(next)).toBe(true)
  })

  it('Grêmio: vermelho do Inter não pinta a casa; azul da marca fica', () => {
    expect(
      familiaHueCromatica(
        resolverCorSemRivalidade('#e30613', {
          slug: 'geral-do-gremio',
          corPrimaria: '#0080c8',
        }),
      ),
    ).not.toBe('vermelho')
    expect(
      resolverCorSemRivalidade('#0080c8', {
        slug: 'geral-do-gremio',
        corPrimaria: '#0080c8',
      }),
    ).toBe('#0080c8')
  })

  it('Internacional: azul do Grêmio não pinta a casa', () => {
    const next = resolverCorSemRivalidade('#0080c8', {
      slug: 'camisa-12-inter',
      corPrimaria: '#e30613',
    })
    expect(familiaHueCromatica(next)).not.toBe('azul')
  })

  it('Flamengo: verde do Flu sai; vermelho da marca fica', () => {
    expect(
      isVerdeIdentidade(
        resolverCorSemRivalidade('#006633', {
          slug: 'torcida-jovem-flamengo',
          corPrimaria: '#c8102e',
        }),
      ),
    ).toBe(false)
    expect(
      resolverCorSemRivalidade('#c8102e', {
        slug: 'torcida-jovem-flamengo',
        corPrimaria: '#c8102e',
      }),
    ).toBe('#c8102e')
  })

  it('Galoucura: verde da Mancha (aliada) pode pintar; azul do Cruzeiro não', () => {
    expect(
      familiaHueCromatica(
        resolverCorSemRivalidade('#047857', {
          slug: 'galoucura',
          corPrimaria: '#000000',
        }),
      ),
    ).toBe('verde')
    expect(
      familiaHueCromatica(
        resolverCorSemRivalidade('#003da5', {
          slug: 'galoucura',
          corPrimaria: '#000000',
        }),
      ),
    ).not.toBe('azul')
  })

  it('neutro P&B (Diretoria) permanece em qualquer identidade', () => {
    expect(
      resolverCorSemRivalidade('#1f2937', {
        slug: 'pde-gavioes-fiel',
        corPrimaria: '#1a1a1a',
      }),
    ).toBe('#1f2937')
  })

  it('Gaviões: tons Tailwind de verde (emerald/green) também são tabu', () => {
    for (const verde of ['#10b981', '#22c55e'] as const) {
      expect(
        familiaHueCromatica(
          resolverCorSemRivalidade(verde, {
            slug: 'pde-gavioes-fiel',
            corPrimaria: '#1a1a1a',
          }),
        ),
        verde,
      ).not.toBe('verde')
    }
  })

  it('Galoucura: tons Tailwind de azul/sky também são tabu', () => {
    for (const azul of ['#3b82f6', '#0ea5e9', '#2563eb'] as const) {
      const fam = familiaHueCromatica(
        resolverCorSemRivalidade(azul, {
          slug: 'galoucura',
          corPrimaria: '#000000',
          corArquirrival: '#003da5',
        }),
      )
      expect(fam, azul).not.toBe('azul')
      expect(fam, azul).not.toBe('teal')
    }
  })

  it('catalogo: Gaviões tem verde Palmeiras como dado; Mancha não tem tabu extra', () => {
    expect(
      corArquirrivalCatalogo({ slug: 'pde-gavioes-fiel' }),
    ).toBe('#006437')
    expect(corArquirrivalCatalogo({ slug: 'mancha-alviverde' })).toBeNull()
    expect(corArquirrivalCatalogo({ slug: 'geral-do-gremio' })).toBe('#e30613')
  })

  it('override da unidade vence o catalogo do clube', () => {
    expect(
      corArquirrivalCatalogo({
        slug: 'pde-gavioes-fiel',
        corArquirrival: '#c8102e',
      }),
    ).toBe('#c8102e')
  })

  it('Santos pula Corinthians alvinegro e propõe verde Palmeiras / Mancha', () => {
    const p = proporCorArquirrival({ slug: 'torcida-jovem-santos' })
    expect(p.hex).toBe('#006437')
    expect(p.rivalChave).toBe('palmeiras')
    expect(p.pulados.map((x) => x.chave)).toContain('corinthians')
    expect(p.mesmoAlvinegro).toBe(true)
    expect(corArquirrivalCatalogo({ slug: 'torcida-jovem-santos' })).toBe(
      '#006437',
    )
  })

  it('Gaviões: primeiro rival já é cromático (Palmeiras)', () => {
    const p = proporCorArquirrival({ slug: 'pde-gavioes-fiel' })
    expect(p.hex).toBe('#006437')
    expect(p.pulados).toEqual([])
    expect(p.mesmoAlvinegro).toBe(false)
  })

  it('Máfia Azul / Cruzeiro: clássico P&B não inventa verde América', () => {
    const p = proporCorArquirrival({ slug: 'mafia-azul' })
    expect(p.pulados.map((x) => x.chave)).toContain('atletico-mg')
    expect(p.hex).toBe(CLUBE_PALETAS['america-mg']?.primary.toLowerCase())
    expect(corArquirrivalCatalogo({ slug: 'mafia-azul' })).toBeNull()
  })
})

describe('sanearAcoesContraRivalidade — tokens de ação', () => {
  it('Galoucura: sucesso vira verde de aliada; info e success não ficam azul da Máfia', () => {
    const out = sanearAcoesContraRivalidade(
      { ...DEFAULT_ACTIONS },
      { slug: 'galoucura', corPrimaria: '#000000', corArquirrival: '#003da5' },
    )
    expect(familiaHueCromatica(out.success)).toBe('verde')
    expect(familiaHueCromatica(out.info)).not.toBe('azul')
    expect(familiaHueCromatica(out.info)).not.toBe('teal')
    expect(familiaHueCromatica(out.danger)).toBe('vermelho')
  })

  it('resolveTenantDesign remapeia actions.info pelo slug mesmo sem hex gravado', () => {
    const d = resolveTenantDesign(null, '#000000', { slug: 'galoucura' })
    expect(familiaHueCromatica(d.actions.info)).not.toBe('azul')
    expect(familiaHueCromatica(d.actions.info)).not.toBe('teal')
    expect(familiaHueCromatica(d.actions.success)).toBe('verde')
  })

  it('Palmeiras: info azul permanece (não é cor de rival)', () => {
    const out = sanearAcoesContraRivalidade(
      { ...DEFAULT_ACTIONS },
      { slug: 'mancha-alviverde', corPrimaria: '#006437' },
    )
    expect(familiaHueCromatica(out.info)).toBe('azul')
  })

  it('Gaviões: sucesso default azul permanece; verde de Palmeiras continua tabu', () => {
    const out = sanearAcoesContraRivalidade(
      { ...DEFAULT_ACTIONS },
      { slug: 'pde-gavioes-fiel', corPrimaria: '#1a1a1a' },
    )
    expect(familiaHueCromatica(out.success)).toBe('azul')
    expect(familiaHueCromatica(out.info)).toBe('azul')
  })

  it('tokens remapeados não colidem na mesma família', () => {
    const out = sanearAcoesContraRivalidade(
      { ...DEFAULT_ACTIONS },
      { slug: 'galoucura', corArquirrival: '#003da5', corPrimaria: '#000000' },
    )
    const fams = (['danger', 'warning', 'success', 'info'] as const)
      .map((k) => familiaHueCromatica(out[k]))
      .filter((f): f is NonNullable<typeof f> => Boolean(f))
    expect(new Set(fams).size).toBe(fams.length)
  })
})
