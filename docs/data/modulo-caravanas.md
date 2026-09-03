# Módulo — Caravanas (compor Eventos)

> Plugin do departamento Caravanas. **Não** duplica Eventos: usa `Evento.tipo = CARAVANA`.
> Agenda canônica: [modulo-eventos.md](./modulo-eventos.md).

## Escopo

| Inclui | Fora |
|--------|------|
| Modo Caravana no hub `/portal/eventos?tipo=CARAVANA` | Ônibus / assentos |
| Criar com `events:create\|manage` | Bilheteria multi-categoria |
| Lista de embarque (RSVP + check-in + QR) | App offline / PWA |
| **Embarque por trecho (ida/volta)** com QR rotativo do evento | Geofence (fase 2) |
| `valorVaga` + cobrança AVULSA | Hard-block **sempre** ligado |
| Lotação por pagamento (PAGA ocupa) | |
| Check-in: warn+allow **ou** hard-block opcional (`checkInExigePagamento`) | |
| Cruzamento pagamento × embarque no dia | |
| Painel em `/portal/departamentos/caravanas` | |

Rotas `/portal/caravanas*` redirecionam para o hub / detalhe unificado.
Admin ops: `/admin/caravanas` (thin wrapper sobre `Evento`; detalhe em
`/admin/eventos/[id]` via alias). Entrada: **semana operacional**
(`DepartamentoSemanaOps`) com cluster do dia do jogo + CTA vincular partida +
atalho “Evento na sede”. Filtro legado `/admin/eventos?tipo=CARAVANA` segue válido.
Programa: [`programa-cockpit-admin-departamentos.md`](./programa-cockpit-admin-departamentos.md).
Cluster: [`modulo-eventos.md`](./modulo-eventos.md) § Dia operacional.

## Modelo

Reusa `Evento` + `EventoRsvp` + `CobrancaAssociacao`:

- `Evento.tipo = CARAVANA`
- Embarque = `checkedInAt` (independente do RSVP)
- Vaga paga = `Evento.valorVaga` + cobrança `AVULSA` com `eventoId`
  (unique `(eventoId, userId)`). Join natural com RSVP por `userId`.
- `Evento.checkInExigePagamento` (default `false`): na porta, bloqueia
  check-in/QR se a vaga não estiver `PAGA`; gestor libera com override
  (“Embarcar mesmo assim”) + AuditLog `override: true`.
- **`EventoCheckin`** (2026-09-02): ledger de embarque, um registro por
  `(evento, pessoa, trecho)` com `metodo` e `registradoPorId`. `checkedInAt`
  segue materializado — ver § embarque por trecho.

## Embarque por trecho e QR do evento (2026-09-02)

O motorista precisa fechar a porta sabendo quem está dentro — **na ida e na
volta**. Um `checkedInAt` só não responde isso.

- **`EventoCheckin`** é o ledger (`IDA | VOLTA`, `metodo`, `registradoPorId`,
  `override`, `lat`/`lng`). `EventoRsvp.checkedInAt` continua materializado e é
  o que KPIs, CSV e Confiança leem: **IDA materializa, VOLTA não**. Sobrescrever
  na volta apagaria a hora do embarque real, e quem aparece na volta sem ter ido
  é buraco para o gestor **ver**, não para o sistema tapar. Confiança e
  notificação também só disparam na IDA — a volta é o mesmo comparecimento.
- **`Evento.embarqueTrechoAtivo`** (+ `embarqueAbertoEm`/`embarqueAbertoPorId`)
  é o estado da porta. Um trecho por vez; abrir um fecha o outro. Fechado, o QR
  não existe — é o que impede alguém de “embarcar” três dias antes.
- Evento que não é caravana nunca abre embarque, então tudo cai em IDA e o
  comportamento antigo fica idêntico (`resolverTrechoParaRegistro`).

### Os dois fluxos convivem

| | Gestor escaneia o sócio | Sócio escaneia o gestor |
|---|---|---|
| Token | carteirinha (`SaasSocio.qrToken`) | QR rotativo do evento |
| Método | `QR_CARTEIRINHA` / `MANUAL` | `QR_EVENTO` |
| Gate | `EVENTS_MANAGE` | sessão + `assertMembroAtivo` + RSVP `CONFIRMADO` |
| Override de pagamento | sim (gestor decide na hora) | **não** (não há quem decida) |
| Walk-in | sim, pelo check-in manual | não |
| Sem rede | fila offline (`checkin-offline.ts`) | **não funciona — nem pode** |
| iOS | `BarcodeDetector` ausente → cai no `jsQR` (fase 2) | câmera nativa lê |

Nenhum substitui o outro: o do sócio escala; o do gestor é o plano B quando o
celular do sócio está sem bateria ou sem sinal — cenário normal de ponto de
embarque de madrugada.

**Fila offline no auto-embarque não existe, e é impossível de propósito.** Se o
sócio pudesse enfileirar a leitura sem rede, o token sincronizaria dezenas de
janelas depois e o servidor recusaria por expirado — e se não recusasse, teria
virado exatamente o QR fixo que a rotação existe para impedir (bipar em casa e
sincronizar no estádio). A rotação e a fila offline são mutuamente exclusivas;
quem precisa embarcar sem rede vai pela carteirinha.

### Por que o QR é rotativo

QR fixo exibido na porta vira print no grupo do WhatsApp e trinta pessoas
marcam embarque de casa — a pergunta “posso ir embora?” passa a ter resposta
errada. O payload cobre `eventoId | trecho | janela de 30s` com HMAC
(`lib/embarque-qr.ts`); o servidor aceita a janela atual **e a anterior**, senão
quem escaneia no estouro leva “expirado” na frente do ônibus. Nada é gravado
para emitir: a janela sai do relógio, como no TOTP.

Regra pura e mensagens em `packages/types/src/evento-embarque.js`
(`podeAutoEmbarcar`, `resumirTrecho`), testada em
`apps/web/src/lib/__tests__/evento-embarque.test.ts`.

### Leitura de QR nos dois motores (fase 2, 2026-09-02)

`lib/use-qr-scanner.ts` prefere o `BarcodeDetector` nativo e cai no **`jsQR`**
(carregado por `import()` dinâmico — quem tem motor nativo não baixa os bytes)
quando ele não existe, que é o caso de todo Safari/iOS. Antes disso o gestor de
iPhone só conseguia **colar o código na mão** na porta do ônibus. O fallback
roda em canvas reduzido a 480px e a cada 2 frames: decodificar 1080p a 60fps
esquenta o telefone sem ler melhor. O mesmo hook serve o balcão da loja.

### Geofence é sinal, nunca trava (fase 2, 2026-09-02)

O auto-embarque manda a coordenada do aparelho quando consegue
(`lib/geolocalizacao.ts`, best effort: permissão negada, GPS frio, navegador
sem suporte e estouro de 4s devolvem `null` igual) e ela é gravada em
`EventoCheckin.lat/lng`. A lista do gestor marca com 📍 quem registrou fora de
`RAIO_EMBARQUE_ESPERADO_METROS` (300m).

**Não bloqueia**, e a decisão é deliberada: GPS é falsificável por qualquer app
de mock location, então recusar daria sensação de segurança sem segurança —
enquanto o falso positivo é caro (negar embarque de quem está na sua frente
porque o sinal ricocheteou no prédio ou a permissão foi negada). Quem impede o
print compartilhado é a rotação do QR. O raio é folgado porque o ponto de
encontro quase nunca é a coordenada cadastrada: a sede fica na esquina, o ônibus
para do outro lado da praça.

## Lotação e cobrança (2026-08-03+)

Com `valorVaga` preenchido:

1. **Lotação** conta cobranças `PAGA` (`contarOcupacaoEvento`), não RSVP
   `CONFIRMADO`. Confirmar sem pagar = intenção; não enche o ônibus.
2. Ao confirmar (portal RSVP, waitlist ou promover na admin), cria-se a
   cobrança AVULSA automaticamente (`garantirCobrancaVagaCaravana`).
3. Baixar pagamento com lotação já cheia de PAGAs é rejeitado.
4. Baixa da vaga gera lançamento com categoria `CARAVANA`.

Sem `valorVaga`, lotação continua por `CONFIRMADO` (capacidade efetiva =
evento ou sede).

## Embarque × pagamento

- Contrato puro `resolverStatusVaga` / `resumirEmbarqueComPagamento` /
  `deveBloquearCheckInSemPagamento` (`packages/types/src/caravana-embarque.js`).
- Lista (portal/admin): badge, KPIs, filtro, CSV com coluna `pagamento` e, em
  caravana, `ida`/`volta`/`fora_do_local` (a planilha vai impressa na viagem —
  sem a volta ela não responde "quem ficou no estádio?"). O sinal de distância
  fica só no admin: exibir localização de terceiros para toda a caravana é
  outro assunto.
- Check-in manual: default **avisa e permite**; com flag, **bloqueia** até
  override. QR: mesma regra, sem override na câmera — use check-in manual.

## RBAC

- **Ver**: membro do depto `caravanas` **ou** `events:create|manage` (painel)
- **Criar / check-in**: `events:create|manage`
- **Abrir/encerrar embarque + exibir QR**: `events:manage`
- **Auto-embarque** (`/embarque?t=`): gate **próprio**, nunca `events:manage` —
  quem age é a pessoa sobre si mesma. Exigir a permissão do admin travaria o
  fluxo; reusar a action do admin daria a qualquer sócio o poder de embarcar
  terceiros. Ver `apps/web/src/app/embarque/actions.ts`.
- Operação admin: `/admin/caravanas` (`DEPARTAMENTO_MODULO_ADMIN_ROTA`)

## Frota e manifesto (2026-09-02)

A caravana sai em mais de um ônibus e de mais de um ponto — antes havia uma
lotação só, a do evento, o que escondia três coisas que decidem o dia: se a
frota comporta os confirmados, quem ainda não tem lugar e quem responde por
cada veículo.

- `CaravanaVeiculo`: identificação, placa, empresa de fretamento, capacidade,
  responsável, ponto e horário de embarque próprios.
- `EventoRsvp.veiculoId`: a alocação mora na inscrição — **uma pessoa, um
  ônibus** já é garantido pelo unique `(evento, pessoa)`, e uma tabela de
  passageiros criaria uma segunda verdade sobre quem está confirmado.
- Capacidade é do **veículo**, não do evento. `podeAlocarNoVeiculo` barra o
  assento que não existe, e reduzir a capacidade abaixo dos já alocados exige
  realocar antes.
- Excluir veículo **desaloca** os passageiros (voltam para "sem ônibus"), nunca
  os remove da caravana.
- Pendências no hub: sem veículo, faltam assentos, veículo sem responsável e —
  a ≤72h da viagem — confirmados ainda sem ônibus.
- **Manifesto** `/admin/eventos/[id]/manifesto`: lista nominal por veículo,
  sem JS, pronta para imprimir. É o documento que a empresa de fretamento pede
  e a prova de organização sob a LGE art. 178 §§ 5º e 6º (a torcida responde
  pelo trajeto de ida e volta). Traz só nome, contato e caixa de embarque —
  minimização de dado, nunca a ficha do associado.

Regras puras: `packages/types/src/caravana-veiculo.js`. Leitura:
`apps/web/src/lib/caravana-frota.ts`. UI: aba **Frota** no cockpit da caravana
(só `tipo = CARAVANA`).
