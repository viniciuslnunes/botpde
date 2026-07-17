# Módulo Associação (planos, cobranças, Pix, QR, home)

Escopo da **Fase A/B** de paridade comercial — gestão de contribuições dos associados
(distinto do plano SaaS em `Tenant.plano` e do livro-caixa em `FinanceiroLancamento`).

## Entidades

| Modelo | Uso |
|---|---|
| `PlanoAssociacao` | Contribuição periódica da torcida (nome, valor, periodicidade, ativo) |
| `CobrancaAssociacao` | Cobrança por membro (mensalidade, adesão, avulsa) |
| `SaasMembro.adimplente` | Espelho operacional — recalculado via cobranças abertas |
| `SaasMembro` campos LGE | RG, CPF, filiação, escolaridade, profissão, nascimento — **admin only** |
| `SaasSocio.qrToken` | Segredo opaco para QR verificável |

## Libs (`apps/web/src/lib/`)

- `cobrancas.ts` — listar, sincronizar vencidas, baixar como paga (+ lançamento financeiro)
- `pix-gateway.ts` — `mock` default; Mercado Pago com `PIX_GATEWAY_MODE=mercadopago` + `MERCADOPAGO_ACCESS_TOKEN`
- `carteirinha-qr.ts` — payload HMAC, validação pública
- `associacao-home.ts` — snapshot único para `/portal`

## Rotas

| Rota | Permissão / auth |
|---|---|
| `/admin/planos-associacao` | `FINANCE_MANAGE` |
| `/admin/cobrancas` | `FINANCE_MANAGE` |
| `/admin/membros/[id]` | `MEMBERS_VIEW` ou `MEMBERS_APPROVE` (LGE); `MEMBERS_DISMISS` (desligar) |
| `/portal` | Membro logado + tenant ativo |
| `/portal/cobrancas`, `/portal/cobrancas/[id]` | Dono da cobrança |
| `/portal/cobrancas/[id]/recibo` | Cobrança `PAGA` |
| `/carteirinha/validar?t=…` | **Público** (sem auth) |
| `POST /api/webhooks/pix` | Mock: `{ cobrancaId, signature }`; MP: `payment.updated` |

## Pix mock (dev/demo)

1. Admin gera Pix na cobrança → salva `pixCopiaCola`
2. Associado paga via botão **Já paguei (mock)** ou webhook com HMAC(`pix-mock:{cobrancaId}`)
3. `baixarCobrancaComoPaga` marca `PAGA`, cria `FinanceiroLancamento` se necessário, recalcula adimplência

## QR carteirinha

- Emitir carteirinha (`emitirCarteirinha`) grava `qrToken`
- Portal garante token (`garantirQrTokenSocio`) e exibe QR
- Validação: adimplência, validade, desligamento, status membro

## Check-in de eventos

Gestores usam **Check-in pela carteirinha (QR)** na lista de embarque/presença
(`ListaEmbarque` em caravanas/bateria/eventos): cole o payload ou a URL de
`/carteirinha/validar?t=…`. A action `registrarCheckInPorQr` valida adimplência
e registra `EVENTO_CHECKIN_QR`.

A carteirinha no portal **não** envia o token a APIs externas de QR (LGPD):
mostra link de validação + cópia. Câmeras do celular abrem o link público.

## Caravana paga (paridade C1)

- Admin define `Evento.valorVaga` em caravanas
- Associado com RSVP `CONFIRMADO` gera cobrança `AVULSA` ligada a `eventoId`
  (`solicitarCobrancaVagaCaravana` → `/portal/cobrancas/[id]`)
- Home Caravanas mostra vagas pagas / confirmados quando há valor

## Notificações

- `COBRANCA_PENDENTE` → associado
- `COBRANCA_VENCIDA` → associado + admins `FINANCE_MANAGE` (badge menu `cobrancas`)

## Permissões

- `FINANCE_MANAGE` — planos, cobranças, export financeiro
- `MEMBERS_EXPORT_LGE` — CSV cadastro LGE
- `MEMBERS_DISMISS` — desligamento estatutário

Ver `packages/types/src/associacao.js` para schemas Zod.
