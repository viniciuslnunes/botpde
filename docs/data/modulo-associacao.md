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

## Acesso da pessoa na aba do cadastro (2026-07-31)

Cargo, área e permissões adicionais são decididos **no card do membro**, aba
**Acessos** — o mesmo card que já traz Resumo, Cadastro, Documentos, Associação,
Operação e Histórico. Quem acabou de aprovar alguém não precisa mais sair para
`/admin/acessos`, procurar a pessoa numa lista da torcida inteira e torcer para
clicar no homônimo certo.

- **A pessoa vem do cadastro aberto**, nunca de escolha manual:
  `carregarAcessoMembro(membroId)`
  (`apps/web/src/app/admin/membros/acesso-actions.ts`) resolve `membroId →
  userId` e devolve cargos, áreas e vínculos atuais **daquele** usuário. Carrega
  sob demanda: abrir um card não paga essas consultas enquanto a aba não é
  aberta.
- **Painel reaproveitado, não reescrito**: `AccessUserPanel` ganhou
  `variant="embutido"` — sem cabeçalho/back-link (o card já identifica a
  pessoa) e com rodapé de ações **no fluxo**. A `StickyPersistBar` é um portal
  `fixed z-20`: dentro do modal (`z-50`) ela ficaria atrás do backdrop e o
  usuário ficaria sem botão de salvar.
- **Gate próprio**: a aba exige `roles:manage` (ver o cadastro é
  `members:view`). Esconder a aba é só affordance — `carregarAcessoMembro` e
  `salvarAcessoUsuario` barram no servidor.
- **Sócios herdam de graça**: `/admin/socios` já abre o mesmo
  `MembroDetalheModal`; só passa a flag de permissão.
- Salvar **não fecha** o card: recarrega o painel e a mudança já aparece na aba
  Histórico ao lado.

## Histórico do cadastro (aba Logs)

`listarHistoricoMembro` (`apps/web/src/app/admin/membros/historico-actions.ts`)
lê o `AuditLog` do membro **e do gêmeo espelho**, e classifica o ator em
`admin`, `solicitante` (o dono do cadastro) ou `sistema` (sem ator). Mutação
que altera dados grava `detalhes.alteracoes` com o diff campo a campo
(`diffCamposMembro`, `apps/web/src/lib/membro-audit-diff.ts`) — vale para a
edição LGE e a reatribuição de unidade pelo admin, e para o reenvio feito pelo
próprio solicitante. Registrar só a ação, sem o antes/depois, deixa a aba
inútil para conferência.

**Mudança de acesso também é histórico do cadastro (2026-07-31).** Cargo, área
e permissão são gravados contra o `User` (é o usuário que tem acesso, não a
ficha), então a aba lê uma segunda fatia: `entidade: 'User'` +
`entidadeId: membro.userId`, restrita a uma lista fechada de ações
(`ACOES_ACESSO`) — `entidade: 'User'` também guarda coisas de outra natureza,
que não são histórico do vínculo. As duas fatias são ordenadas juntas por data.

O log de acesso passou a gravar `detalhes.alteracoes` no mesmo formato do diff
de cadastro, via `diffAcessoUsuario` (`apps/web/src/lib/acesso-audit-diff.ts`):
`Cargos`, `Áreas`, `Permissões adicionais` e `Permissões revogadas do cargo`,
cada uma com **de → para**. Antes o log guardava só `perfilIds` e
`permissoesEfetivas` — ids crus, sem estado anterior: dava para saber que
alguém mexeu, nunca o que entrou ou saiu. Cargo de sistema sai com o rótulo da
unidade (Presidente/Liderança), não com o nome interno do papel; permissão sai
com o rótulo de `PERMISSION_GROUPS`. Invariantes em
`lib/__tests__/acesso-audit-diff.test.ts`.

Membros reprovados **antes** desta mudança não têm laudo: a aba continua
visível e explica a ausência em vez de sumir. Dados de teste ganham laudo e
histórico com
`pnpm --filter @torcida/db seed:corinthians-teste -- --so-historico`.

Cobertura ponta a ponta: `pnpm --filter @torcida/web audit:fluxos`
(§ "cadastro pendente → reprovação justificada") exercita justificativa curta
barrada, laudo persistido, histórico e reenvio bloqueado.

## Ciclo de vida do número de associado (2026-08-01)

O `numeroAssociado` é recurso escasso da torcida (carteirinha física), não
identidade. Quem ocupa o número na lineage (Sede + afiliadas):

| Situação do vínculo | Ocupa o número? |
|---|---|
| `PENDENTE` | sim — solicitação viva, número reservado |
| `APROVADO` | sim |
| `REPROVADO` | **não** — volta ao pool |
| desligado (`desligadoEm`) | não |

`encontrarConflitoNumeroAssociado` (`lib/membros-sede.ts`) filtra
`status: { not: 'REPROVADO' }`. O valor **continua gravado** na linha reprovada:
o laudo e o diff do histórico precisam mostrar o nº que a pessoa declarou. Ele
só deixa de bloquear outro torcedor — quem foi reprovado mantém "seu" número
enquanto ninguém o tomar, e é first-come-first-served daí em diante.

Reverter para `PENDENTE` **não** libera: a solicitação volta a ser viva.

CPF, RG e telefone seguem bloqueando mesmo em reprovados — identidade não é
vaga, e o mesmo CPF em duas pessoas é sinal de fraude, não de número livre.

`desligarMembro` revoga a carteirinha (origem **e** espelho) e grava
`SOCIO_CARTEIRINHA_REVOGADA`. Sem isso o `numeroSocio` — que é
`@@unique([tenantId, numeroSocio])` em `SaasSocio` — ficaria preso para sempre.

## Bloqueio de novas solicitações (2026-08-01)

`MembroBloqueio` (`saas_membro_bloqueios`, `@@unique([tenantId, userId])`) barra
o **usuário**, não a linha de `SaasMembro`: vale mesmo para quem nunca se
cadastrou e sobrevive ao registro ser apagado.

- **Escopo herdado para baixo, sem cópia por unidade.**
  `estaBloqueadoNoTenant(userId, tenantId)` consulta o próprio tenant + seus
  **ancestrais**. Bloqueio na Sede vale nas subsedes/PDEs; bloqueio numa unidade
  vale só naquele ramo e **não sobe**.
- **Barra o cadastro** em `solicitarVinculo` (onboarding) e `solicitarCadastro`
  (`/portal/cadastro`), antes de qualquer escrita, com mensagem distinta da de
  reprovação definitiva.
- **Gate**: `members:block` — que já existia no pacote de owner/admin/vice e
  estava sem uso até aqui. Motivo é obrigatório e vai para o `AuditLog`
  (`MEMBRO_BLOQUEADO` / `MEMBRO_DESBLOQUEADO`).
- **Desbloquear apaga a linha**; o histórico fica no `AuditLog`.
- **Reprovar com bloqueio**: `reprovarMembro` aceita `bloquear: true`, revalida
  `members:block` no servidor e grava o bloqueio no tenant da **unidade de
  origem** da solicitação — é lá que novas tentativas batem.
- **Associado ativo é recusado**: bloquear um `APROVADO` sem `desligadoEm`
  devolve "Desligue o associado antes de bloquear". Desligamento é
  `members:dismiss`, outra permissão; encadear as duas escondido apagaria o
  rastro de quem decidiu o quê.

`reprovadoPermiteReenvio` continua existindo e é outra coisa: "esta análise
acabou" (sobre a solicitação). O bloqueio é "esta pessoa não entra" (sobre o
usuário).

## Apagar cadastro definitivamente (2026-08-01)

Reprovado e desligado **continuam listados** em `/admin/membros` (tab
"Desligados" + badge) e no card de `/admin/socios` — some da operação, não do
registro. Para sumir de vez:

- **Permissão `members:purge`**, deliberadamente **fora** dos pacotes de admin e
  vice em `SYSTEM_ROLE_PERMISSIONS` — na prática Presidente (owner) e
  super-admin. `ALL_PERMISSIONS` é a base desses pacotes, então a exclusão
  precisa ser explícita; invariante travado em `lib/__tests__/rbac.test.ts`.
- **Só reprovado ou desligado**, nunca cadastro ativo, e nunca o espelho da Sede
  (apaga-se na unidade de origem). Regra em `motivoImpedeApagar`.
- Apaga `SaasMembro` + espelho + `SaasSocio` (o `numeroSocio` volta ao pool).
- **Preserva `AuditLog` e `MembroBloqueio`**: o rastro tem de sobreviver ao
  registro, e apagar não pode virar a porta dos fundos para quem está bloqueado
  voltar a se inscrever. O log `MEMBRO_APAGADO` guarda snapshot dos campos.
- Duas portas, uma semântica: a Server Action `apagarMembroDefinitivo` (gate por
  `members:purge`) e `DELETE /api/super-admin/membros/[id]` (gate por allowlist
  de e-mail) chamam ambas `executarPurgeMembro` de `lib/membros-purge.ts`.
  Super-admin não é atalho para pular a regra de negócio.

## Libs (`apps/web/src/lib/`)

- `cobrancas.ts` — listar, sincronizar vencidas, baixar como paga (+ lançamento financeiro)
- `membros-purge.ts` — regra e execução do hard delete (Server Action + super-admin)
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
- `MEMBERS_BLOCK` — bloquear novas solicitações (owner/admin/vice)
- `MEMBERS_PURGE` — apagar cadastro de vez (**só owner** + super-admin)

Ver `packages/types/src/associacao.js` para schemas Zod.
