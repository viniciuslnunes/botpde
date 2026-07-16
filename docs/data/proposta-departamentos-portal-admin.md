# Proposta — Departamentos: Portal (membros) × Admin (gestores / presidência)

> Status: **Fases 0–4** (shell) + **Fase 3 plugins** Financeiro, Patrimônio,
> Caravanas e Bateria (2026-07-16) — hub Abrir área / Gestão / Operação;
> home `/portal/departamentos/[slug]`; equipe com `canManageDepartamento`;
> pacotes **membro** apertados; menu admin Eventos/Financeiro/Patrimônio exige `*:manage`;
> Diretoria (gestor): fila de pendentes **no portal** (aprovar/reprovar reusa actions admin).
> Complementa `modulo-departamentos.md`.

## 1. Respostas diretas

### A segregação do menu admin vale para todos os departamentos?

**Sim.** A regra é única: o sidebar de `/admin` mostra só o que a **permissão efetiva**
libera (pacote do depto ∪ extras ∪ overrides). Não filtra por nome/id do departamento.

| Quem | O que vê no admin (exemplo) |
|------|------------------------------|
| Membro · Financeiro | Dashboard + Financeiro |
| Membro · Comunicação | Só o que o pacote der (ex. Notícias se tiver `news:curate`) |
| Gestor · Loja | Catálogo / Pedidos conforme `store:*` |
| Owner / Diretoria | Quase tudo |

**Gap vs a visão de produto:** vários módulos ainda mandam **membros** para `/admin/*`
via “Abrir módulo” no hub (Diretoria → `/admin/membros`, Financeiro/Patrimônio → stubs
admin). Isso precisa ser corrigido: membro opera no **portal**.

### Admin só para gestor; membro só no portal?

**Sim — regra-alvo de produto.**

- **Membro da área** → dia a dia em `/portal/departamentos` (+ módulos portal).
- **Gestor da área** → mesmo hub + painel de gestão da área; atalho para **operação**
  admin só quando o domínio exige (Loja, Moderação, Sedes…).
- **Presidência** (`roles:manage` / `settings:manage`) → pacotes, cargos, pessoas,
  hierarquia, configs da torcida no admin.

### Precisamos de um componente com regra de negócio por departamento?

**Sim, mas não 10 apps isolados.** O desenho certo é:

1. **Shell compartilhado** (`/portal/departamentos/[slug]`)
2. **Registry de capacidades** por slug / `moduloPortal`
3. **Plugins de domínio** (Financeiro, Bateria, Caravanas…) sob demanda
4. Admin = configuração institucional + operação pesada já existente

O RBAC continua sendo a fonte de *autorização*; o registry descreve *o que a área faz*.

---

## 2. Estado atual (resumo)

Hub portal: `apps/web/src/app/portal/departamentos/` — lista cards, “Abrir módulo” /
“Administrar”. Sem home por slug, sem equipe, sem fluxos.

| Botão | Quem vê | Destino hoje |
|-------|---------|--------------|
| Abrir módulo | Membro e gestor | `DEPARTAMENTO_MODULO_ROTA` (às vezes `/admin/*`) |
| Administrar | Só `DepartamentoGestor` | `DEPARTAMENTO_MODULO_ADMIN_ROTA` ou `/admin` |

`canManageDepartamento` + actions `adicionarMembroDepartamento` /
`removerMembroDepartamento` existem no servidor, **sem UI** — gestor de área não
consegue staffar sem `ROLES_MANAGE`.

Bateria, Caravanas, Feminino, Carnaval colapsam em `eventos` ou `comunidade` genéricos
— sem UX de área.

---

## 3. Visão-alvo

```
Portal                          Admin
──────                          ─────
/departamentos (hub)            /acessos (pacotes, cargos, pessoas)  ← Presidência
  └─ /[slug] home da área       /hierarquia, /configuracoes, …
       ├─ membro: equipe (r),   Operação de domínio (Loja, Moderação…)
       │   módulo, avisos         ← só quem tem perm (+ tipicamente gestor)
       └─ gestor: + staffar
            área, atalho Operação
```

| Papel | Portal Departamentos | Admin |
|-------|----------------------|-------|
| Membro | Home, colegas, módulo portal | Não entra por causa do depto |
| Gestor | Tudo do membro + gestão da equipe + Operação | Só páginas de domínio necessárias |
| Presidência | Opcional | Pacotes, cargos, tenant, mural |

---

## 4. Arquitetura

### Camada A — Shell (`/portal/departamentos/[slug]`)

Comum a todas as áreas:

- Cabeçalho (nome, cor, papel)
- Equipe (`UserDepartamento` + badge gestor)
- CTA do módulo principal (**sempre portal** quando existir)
- Se gestor: bloco Gestão da área

Gate: membership no `departamentoId` (ou super-admin).

### Camada B — Registry de capacidades

Ex.: `packages/types/src/departamento-capabilities.js` (ou espelho em `apps/web/src/lib/`):

```js
{
  slug: 'bateria',
  moduloPortal: 'eventos',
  features: ['equipe', 'agenda', 'ensaios'],
  memberModuleHref: '/portal/eventos',      // nunca /admin/*
  gestorOperacaoHref: '/admin/eventos',     // opcional
  portalPanel: 'bateria',                   // plugin UI
}
```

Permissões **não** são duplicadas aqui — só produto/navegação.

### Camada C — Plugins (sob demanda)

| Área | Plugin | Motivo |
|------|--------|--------|
| Financeiro | Caixa, inadimplência | Domínio próprio |
| Patrimônio | Inventário | Domínio próprio |
| Bateria | Ensaios / presença | Eventos genéricos insuficientes |
| Caravanas | Embarque / custo | Idem |
| Carnaval | Barracão / cronograma | Idem |
| Comunicação / Loja / Social | Thin wrapper | Já têm produto |
| Diretoria | KPIs leves + fila membros (gestor) | Hoje joga membro no admin |

Componentes:

- `DepartamentoHomeShell`
- `DepartamentoGestorPanel` (usa `canManageDepartamento`)
- `panels/FinanceiroPanel`, `panels/BateriaPanel`, …

### Camada D — Admin permanece com

1. Institucional: `/admin/acessos`, hierarquia, configs (`ROLES_MANAGE` / `SETTINGS_MANAGE`)
2. Operação pesada de domínio já construída (catálogo, moderação, sedes…)

### Hub (UX do card)

1. **Abrir área** → `/portal/departamentos/[slug]`
2. Gestor: **Gestão** (âncora no painel)
3. Gestor + operação admin: **Operação** → `/admin/...` (rótulo claro; não “Administrar” genérico)

Membro **nunca** vê botão para admin.

---

## 5. RBAC — princípio membro vs gestor

**Membro = participar/consumir no portal. Gestor = operar a área (+ staffar).**

Revisar matriz canônica (`departamentos-canonicos.js`) para que colaborador quase nunca
receba perms que só abrem itens admin. Financeiro já foi apertado; demais áreas na
mesma linha (Fase 2).

Delegação: `canManageDepartamento` sem `ROLES_MANAGE` — UI no portal (Fase 1).

**Não** filtrar menu admin por `departamentoId` (quebra multi-área e permissão extra).

---

## 6. Fases

### Fase 0 — Rotas e hub (desbloqueia a visão)
- `DEPARTAMENTO_MODULO_ROTA` nunca aponta para `/admin`
- Hub: Abrir área / Gestão / Operação
- Atualizar este doc + `modulo-departamentos.md`

### Fase 1 — Shell + equipe do gestor
- `/portal/departamentos/[slug]`
- Add/remove membros via actions existentes + `canManageDepartamento`
- Registry mínimo (`equipe` + módulo)

### Fase 2 — Pacotes membro em todas as áreas
- Auditoria da matriz canônica
- Testes: “Membro · X não vê itens admin indevidos”

### Fase 3 — Plugins de domínio (um por vez)
1. Financeiro ✓ → 2. Patrimônio ✓ → 3. Caravanas / Bateria ✓ (compor `Evento.tipo`) → 4. thin wrappers (Feminino/Carnaval)

### Fase 4 — Diretoria
- Home com KPIs leves
- Fila de aprovação de membros no portal (gestor) ou deep-link admin só-gestor

---

## 7. Fora de escopo / anti-padrões

- Um `DepartamentoGodComponent` com switch de 10 cases gigantes
- Duplicar Loja/Comunidade/Eventos dentro do depto — **compor** e deep-link
- Dar `ROLES_MANAGE` a gestor de área “para conseguir gerir gente”
- Contagens de domínio no menu admin misturadas com badges de notificação (já
  separados por desenho atual)

---

## 8. Decisão fechada (proposta)

**Sim:** cada departamento tem regras de negócio — como **capability registry + plugins**,
sobre um shell portal único, com RBAC existente.

**Admin** = configuração institucional + operação pesada de domínio.  
**Portal Departamentos** = casa do membro e do gestor no dia a dia da área.

Próximo passo de implementação sugerido: **Fase 0 + Fase 1**.
