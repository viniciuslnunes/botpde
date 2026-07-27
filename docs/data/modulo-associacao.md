# Módulo Associação (planos, cobranças, Pix, QR, home)

Escopo da **Fase A/B** de paridade comercial — gestão de contribuições dos associados
(distinto do plano SaaS em `Tenant.plano` e do livro-caixa em `FinanceiroLancamento`).

## Entidades

| Modelo | Uso |
|---|---|
| `PlanoAssociacao` | Contribuição periódica da torcida (nome, valor, periodicidade, ativo) |
| `CobrancaAssociacao` | Cobrança por membro (mensalidade, adesão, avulsa) |
| `SaasMembro.adimplente` | Espelho operacional — recalculado via cobranças abertas |
| `SaasMembro` campos LGE | RG, CPF, filiação, escolaridade, profissão, nascimento |
| `SaasSocio.qrToken` | Segredo opaco para QR verificável |

## Cadastro completo no onboarding (2026-07)

Antes, os campos LGE (`rg`, `cpf`, `filiacao`, `escolaridade`, `profissao`,
`dataNascimento`) só eram preenchidos manualmente por um admin depois da
aprovação, em `/admin/membros/[id]`. Agora o próprio sócio informa a maior
parte deles direto no onboarding (`/onboarding`, passo Vínculo → tipo
`SOCIO`), seguindo o formato de ficha física de admissão do nicho (RG, CPF,
filiação, endereço completo, menor de idade/responsável, termo).

Campos novos em `SaasMembro` (todos opcionais no schema — obrigatórios só
para `tipo: SOCIO` via `.superRefine` em `solicitarVinculoSchema`,
`apps/web/src/app/onboarding/actions.ts`):

| Campo | Uso |
|---|---|
| `sexo`, `estadoCivil`, `nacionalidade` | Identificação — nunca obrigatórios (evitar fricção) |
| `logradouro`, `bairro`, `uf` | Endereço completo — obrigatórios para SOCIO (junto de `cep`, `numero`, `bloco`, `complemento` já existentes) |
| `fotoDocumentoUrl`, `comprovanteResidenciaUrl` | Documentos — obrigatórios para SOCIO quando `Tenant.exigirDocumentosCadastro` (default `true`); desligável em `/admin/configuracoes?tab=cadastro` |
| `responsavelNome`, `responsavelDocumento`, `autorizacaoMenorAceitaEm` | Responsável legal — obrigatórios só quando o SOCIO tem menos de 18 anos (calculado a partir de `dataNascimento`) |
| `termoResponsabilidadeAceitoEm` | Timestamp do aceite do termo de responsabilidade — obrigatório para SOCIO |

## Fila compartilhada de admissão (Caso B, 2026-07-27)

Quando o sócio solicita vínculo numa **Subsede/PDE com tenant próprio** (Caso B):

1. `solicitarVinculo` cria `SaasMembro` `PENDENTE` na unidade (origem canônica).
2. `criarOuAtualizarPendenciaEspelhoNaSede` cria/atualiza gêmeo `PENDENTE` +
   `espelhado: true` na Sede raiz (`membroOrigemId`, `aprovadoNaUnidadeTenantId`).
3. Admins com `MEMBERS_APPROVE`/`MEMBERS_REJECT` são notificados **nos dois** tenants.
4. **First-wins:** unidade ou Sede decide; advisory lock
   `admissao-socio-torcida:{raiz}` + checagem de status; a outra fila passa a
   APROVADO/REPROVADO com o mesmo `aprovadoPorId`/`Nome`/`Em`.
5. Efeitos (Role `member`, canais, departamento preferido) sempre no tenant da
   **origem**. AuditLog nos dois tenants. Reverter para pendente só na origem
   (reabre o espelho como `PENDENTE`).

Exceção pontual à R1 da governança hierárquica — ver
`docs/data/proposta-governanca-hierarquica.md` §1. Caso A (unidade leve no
mesmo tenant) não muda: fila única da Sede.

`rg`/`cpf`/`dataNascimento`/`logradouro`/`bairro`/`uf` passam a ser
obrigatórios para SOCIO no próprio onboarding (antes só eram exigidos depois,
pelo admin). `nomePai`/`nomeMae` coletados no formulário **não** viram coluna
— são concatenados em `filiacao` (`Pai: {nome} · Mãe: {nome}`). CPF valida
dígito verificador via `normalizarCpf`/`validarCpfDigitos`
(`packages/types/src/associacao.js`). O CEP dispara autocomplete de
logradouro/bairro/UF via ViaCEP no client (`onBlur`), editável pelo usuário.

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
