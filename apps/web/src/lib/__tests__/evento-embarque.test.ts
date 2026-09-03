import { describe, expect, it } from 'vitest'
import {
  JANELA_QR_EMBARQUE_SEGUNDOS,
  MOTIVO_AUTO_EMBARQUE,
  RAIO_EMBARQUE_ESPERADO_METROS,
  TRECHOS,
  avaliarDistanciaEmbarque,
  distanciaMetros,
  expiraEmQrEmbarque,
  janelaQrEmbarque,
  janelasAceitasQrEmbarque,
  podeAutoEmbarcar,
  resumirTrecho,
  trechoSugerido,
} from '@torcida/types'

/** Base de um auto-embarque que dá certo; cada teste estraga um campo. */
const base = {
  trechoAtivo: 'IDA' as const,
  trechoDoToken: 'IDA' as const,
  janelaValida: true,
  rsvpStatus: 'CONFIRMADO',
  jaEmbarcado: false,
  valorVaga: null,
  cobrancaStatus: null,
  checkInExigePagamento: false,
}

describe('janela do QR rotativo', () => {
  it('avança de janela a cada JANELA_QR_EMBARQUE_SEGUNDOS', () => {
    const passo = JANELA_QR_EMBARQUE_SEGUNDOS * 1000
    // Ancorado no início de uma janela: no meio dela o "+passo-1" cairia na
    // seguinte e o teste mediria o alinhamento do relógio, não o passo.
    const t0 = janelaQrEmbarque(1_000_000_000_000) * passo

    expect(janelaQrEmbarque(t0 + passo)).toBe(janelaQrEmbarque(t0) + 1)
    expect(janelaQrEmbarque(t0 + passo - 1)).toBe(janelaQrEmbarque(t0))
    expect(janelaQrEmbarque(t0)).toBe(janelaQrEmbarque(1_000_000_000_000))
  })

  it('aceita a janela atual e a anterior — e só essas duas', () => {
    const agora = 1_000_000_000_000
    const atual = janelaQrEmbarque(agora)
    const aceitas = janelasAceitasQrEmbarque(agora)

    expect(aceitas).toContain(atual)
    expect(aceitas).toContain(atual - 1)
    expect(aceitas).toHaveLength(2)
    expect(aceitas).not.toContain(atual + 1)
    expect(aceitas).not.toContain(atual - 2)
  })

  it('um print de duas janelas atrás não vale mais', () => {
    const agora = 1_000_000_000_000
    const printAntigo = janelaQrEmbarque(agora - 2 * JANELA_QR_EMBARQUE_SEGUNDOS * 1000)
    expect(janelasAceitasQrEmbarque(agora)).not.toContain(printAntigo)
  })

  it('expiraEm cai no fim da janela corrente', () => {
    const agora = 1_000_000_000_000
    const expira = expiraEmQrEmbarque(agora)
    expect(expira).toBeGreaterThan(agora)
    expect(expira - agora).toBeLessThanOrEqual(JANELA_QR_EMBARQUE_SEGUNDOS * 1000)
    expect(janelaQrEmbarque(expira)).toBe(janelaQrEmbarque(agora) + 1)
  })
})

describe('podeAutoEmbarcar', () => {
  it('deixa passar quem está confirmado com o trecho aberto', () => {
    const r = podeAutoEmbarcar(base)
    expect(r.ok).toBe(true)
    expect(r.codigo).toBe('OK')
  })

  it('recusa quando não há embarque aberto', () => {
    const r = podeAutoEmbarcar({ ...base, trechoAtivo: null })
    expect(r.ok).toBe(false)
    expect(r.codigo).toBe('EMBARQUE_FECHADO')
  })

  it('recusa QR da ida quando quem está aberto é a volta', () => {
    const r = podeAutoEmbarcar({ ...base, trechoAtivo: 'VOLTA' })
    expect(r.ok).toBe(false)
    expect(r.codigo).toBe('TRECHO_DIVERGENTE')
  })

  it('recusa QR fora da janela', () => {
    const r = podeAutoEmbarcar({ ...base, janelaValida: false })
    expect(r.ok).toBe(false)
    expect(r.codigo).toBe('QR_EXPIRADO')
  })

  it('walk-in não se auto-embarca — sem RSVP confirmado, só o gestor libera', () => {
    expect(podeAutoEmbarcar({ ...base, rsvpStatus: null }).codigo).toBe('SEM_RSVP')
    expect(podeAutoEmbarcar({ ...base, rsvpStatus: 'LISTA_ESPERA' }).codigo).toBe('SEM_RSVP')
    expect(podeAutoEmbarcar({ ...base, rsvpStatus: 'RECUSADO' }).codigo).toBe('SEM_RSVP')
  })

  it('não registra duas vezes o mesmo trecho', () => {
    const r = podeAutoEmbarcar({ ...base, jaEmbarcado: true })
    expect(r.ok).toBe(false)
    expect(r.codigo).toBe('JA_EMBARCADO')
  })

  it('bloqueia vaga não paga quando o evento exige pagamento — sem override', () => {
    const r = podeAutoEmbarcar({
      ...base,
      valorVaga: 50,
      cobrancaStatus: 'PENDENTE',
      checkInExigePagamento: true,
    })
    expect(r.ok).toBe(false)
    expect(r.codigo).toBe('VAGA_NAO_PAGA')
  })

  it('sem hard-block, vaga pendente passa mas volta com alerta', () => {
    const r = podeAutoEmbarcar({
      ...base,
      valorVaga: 50,
      cobrancaStatus: 'PENDENTE',
      checkInExigePagamento: false,
    })
    expect(r.ok).toBe(true)
    expect(r.alerta).toBe(true)
  })

  it('vaga paga não levanta alerta', () => {
    const r = podeAutoEmbarcar({
      ...base,
      valorVaga: 50,
      cobrancaStatus: 'PAGA',
      checkInExigePagamento: true,
    })
    expect(r.ok).toBe(true)
    expect(r.alerta).toBe(false)
  })

  it('todo código de recusa tem mensagem para a tela', () => {
    for (const chave of Object.keys(MOTIVO_AUTO_EMBARQUE)) {
      expect(MOTIVO_AUTO_EMBARQUE[chave as keyof typeof MOTIVO_AUTO_EMBARQUE]).toBeTruthy()
    }
  })
})

describe('resumirTrecho', () => {
  it('conta embarcados e faltantes só entre confirmados', () => {
    const r = resumirTrecho([
      { confirmado: true, embarcado: true },
      { confirmado: true, embarcado: true, alerta: true },
      { confirmado: true, embarcado: false },
      { confirmado: false, embarcado: false },
    ])
    expect(r.confirmados).toBe(3)
    expect(r.embarcados).toBe(2)
    expect(r.faltando).toBe(1)
    expect(r.embarcadosComAlerta).toBe(1)
  })

  it('lista vazia não quebra a conta', () => {
    expect(resumirTrecho([])).toEqual({
      confirmados: 0,
      embarcados: 0,
      faltando: 0,
      embarcadosComAlerta: 0,
    })
  })
})

describe('distância e geofence (sinal, não trava)', () => {
  // Sé (SP) e um ponto ~1,1 km ao norte.
  const se = { lat: -23.5505, lng: -46.6333 }

  it('mede distância conhecida com folga de 5%', () => {
    const norte = { lat: -23.5405, lng: -46.6333 }
    const m = distanciaMetros(se, norte)
    expect(m).toBeGreaterThan(1050)
    expect(m).toBeLessThan(1160)
  })

  it('distância de um ponto a ele mesmo é zero', () => {
    expect(distanciaMetros(se, se)).toBeCloseTo(0, 5)
  })

  it('marca longe acima do raio e perto abaixo dele', () => {
    const perto = avaliarDistanciaEmbarque({ evento: se, device: { lat: -23.5515, lng: -46.6333 } })
    expect(perto.avaliou).toBe(true)
    expect(perto.longe).toBe(false)

    const longe = avaliarDistanciaEmbarque({ evento: se, device: { lat: -23.5405, lng: -46.6333 } })
    expect(longe.longe).toBe(true)
    expect(longe.metros).toBeGreaterThan(RAIO_EMBARQUE_ESPERADO_METROS)
  })

  it('não avalia sem coordenada dos dois lados — e nunca marca longe por isso', () => {
    for (const caso of [
      { evento: se, device: null },
      { evento: null, device: se },
      { evento: { lat: null, lng: null }, device: se },
      { evento: se, device: { lat: -23.5, lng: null } },
    ]) {
      const r = avaliarDistanciaEmbarque(caso)
      expect(r.avaliou).toBe(false)
      expect(r.longe).toBe(false)
      expect(r.metros).toBeNull()
    }
  })

  it('raio customizado manda sobre o padrão', () => {
    const device = { lat: -23.5495, lng: -46.6333 }
    expect(avaliarDistanciaEmbarque({ evento: se, device }).longe).toBe(false)
    expect(avaliarDistanciaEmbarque({ evento: se, device, raioMetros: 50 }).longe).toBe(true)
  })
})

describe('trechoSugerido', () => {
  it('sugere ida antes de qualquer embarque e volta depois dela', () => {
    expect(trechoSugerido({ temCheckinIda: false, temCheckinVolta: false })).toBe('IDA')
    expect(trechoSugerido({ temCheckinIda: true, temCheckinVolta: false })).toBe('VOLTA')
    expect(trechoSugerido({ temCheckinIda: true, temCheckinVolta: true })).toBe('VOLTA')
  })

  it('a caravana tem exatamente duas pernas', () => {
    expect([...TRECHOS]).toEqual(['IDA', 'VOLTA'])
  })
})
