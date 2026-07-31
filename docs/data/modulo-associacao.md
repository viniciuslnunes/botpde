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

### Fluxo guiado das 4 abas (2026-07-30)

O formulário de sócio (`PassoVinculo` em `apps/web/src/app/onboarding/wizard.tsx`)
avança aba por aba — Identificação → Endereço → **Associação** → Documentos:

- `validarCamposSocio()` é **pura** (só lê estado) e roda no render *e* no submit,
  com as mesmas regras do `.superRefine` da action. `filtrarErrosDaAba()` recorta o
  resultado por aba via `CAMPO_TAB`.
- Cada aba tem no rodapé "Próximo: {aba}", **habilitado só quando a aba não tem
  pendência**; a última troca por "Enviar solicitação", habilitado só com o
  formulário inteiro válido. Rodapé também tem o secundário para voltar uma aba.
- A tab bar marca aba concluída com check; erro (inclusive erro da action, tipo
  CPF duplicado) tem prioridade sobre o check.
- O termo de responsabilidade fica na aba Documentos e o bloco de responsável
  legal na aba Identificação — nada de campo obrigatório fora das abas, senão a
  liberação do "Próximo" mentiria.
- **Associação** (aba própria desde 2026-07-30): `numeroAssociado`, `anosSocio` e
  o(s) departamento(s) pretendido(s). Antes moravam no rodapé da aba Endereço —
  dado de vínculo com a torcida não é endereço, e a aba Endereço ficava com dois
  assuntos. Com 4 abas a tab bar rola horizontalmente no mobile (`overflow-x-auto`)
  em vez de espremer os rótulos.

### Endereço pela localização (2026-07-30)

Se o usuário confirmou a localização por GPS no passo **Região**, a aba Endereço
oferece **"Preencher pela minha localização"**, que reaproveita aquelas
coordenadas (sem pedir permissão de novo) e completa CEP, logradouro, número,
bairro, cidade e UF via `reverseGeocodeEndereco`.

- Só o GPS conta: o geocode de cidade+UF devolve o **centróide do município** e
  preencheria uma rua aleatória. `PassoRegiao.onLocalizacao` informa a origem
  (`'gps' | 'cidade'`) e só a primeira alimenta `coordsDispositivo`.
- Sem GPS prévio o botão continua aparecendo e pede geolocalização na hora;
  negada a permissão, cai no CEP com aviso — nunca bloqueia o passo.
- Gate por `isGoogleMapsConfigured()`: sem `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` o
  bloco não é renderizado (degradação graciosa).
- `reverseGeocodeEndereco` passou a devolver `logradouro`/`numero` separados e
  `bairro` (`sublocality_level_1` → `neighborhood` → `sublocality`, que o Google
  alterna no Brasil). O campo `endereco` concatenado segue existindo para
  sedes/eventos.

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

## Reprovação com laudo (2026-07-29)

Recusar uma solicitação exige **justificativa escrita** — não existe mais
reprovar em um clique. `reprovarMembro(membroId, input)` valida por
`ReprovarMembroSchema` (`packages/types/src/schemas/membro.js`) e grava o laudo
no próprio `SaasMembro`:

| Campo | Uso |
|---|---|
| `reprovadoCategoria` | Id de `CATEGORIAS_REPROVACAO` (tipo do problema) |
| `reprovadoMotivo` | Texto livre, 15–1000 caracteres — vai na notificação |
| `reprovadoPontos` | Ids de `PONTOS_REPROVACAO` — as etapas erradas |
| `reprovadoPorId` / `reprovadoPorNome` / `reprovadoEm` | Autoria da decisão |
| `reprovadoPermiteReenvio` | `false` = definitiva; só um admin revertendo reabre |

`CATEGORIAS_REPROVACAO` e `PONTOS_REPROVACAO` são a **fonte única** do
vocabulário: o diálogo do admin, o destaque vermelho do card, o histórico e a
tela de reenvio do portal leem o mesmo catálogo. Cada ponto declara a `tab` do
card de detalhes, e é isso que faz a aba certa ganhar o badge vermelho.
Categoria com `exigePontos: true` (dados incorretos, documentação, vínculo)
obriga apontar ao menos uma etapa — recusa sobre o que foi preenchido tem de
dizer onde.

O laudo é limpo (`REPROVACAO_LIMPA`, `apps/web/src/lib/membros-sede.ts`) ao
aprovar, ao reverter para pendente e no reenvio aceito. Na fila compartilhada
(Caso B) ele é propagado ao gêmeo por `sincronizarStatusEspelhoDaOrigem`, com
`AuditLog` nos dois tenants.

No portal, `/portal/cadastro` mostra o motivo, as etapas a corrigir e bloqueia
o reenvio quando `reprovadoPermiteReenvio` é `false` — a barreira é servidor
(`solicitarCadastro` e o wizard de onboarding), não só a tela.

## Histórico do cadastro (aba Logs)

`listarHistoricoMembro` (`apps/web/src/app/admin/membros/historico-actions.ts`)
lê o `AuditLog` do membro **e do gêmeo espelho**, e classifica o ator em
`admin`, `solicitante` (o dono do cadastro) ou `sistema` (sem ator). Mutação
que altera dados grava `detalhes.alteracoes` com o diff campo a campo
(`diffCamposMembro`, `apps/web/src/lib/membro-audit-diff.ts`) — vale para a
edição LGE e a reatribuição de unidade pelo admin, e para o reenvio feito pelo
próprio solicitante. Registrar só a ação, sem o antes/depois, deixa a aba
inútil para conferência.

Membros reprovados **antes** desta mudança não têm laudo: a aba continua
visível e explica a ausência em vez de sumir. Dados de teste ganham laudo e
histórico com
`pnpm --filter @torcida/db seed:corinthians-teste -- --so-historico`.

Cobertura ponta a ponta: `pnpm --filter @torcida/web audit:fluxos`
(§ "cadastro pendente → reprovação justificada") exercita justificativa curta
barrada, laudo persistido, histórico e reenvio bloqueado.

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
