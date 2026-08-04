# Piloto Pós-Onda 5 — resultado

Gerado em: `2026-08-04T14:12:39.082Z`  
**P.5 fechado em:** `2026-08-04` (formalização HOLD + revisão §7)

Reexecutar smoke: `pnpm --filter @torcida/web piloto:cockpit`

---

## P.1 — Contas congeladas

| Papel | Tenant | E-mail | Role | Gestor depto |
|-------|--------|--------|------|--------------|
| financeiro | `camisa-12-corinthians` (Camisa 12) | `aline.andrade.23@teste.corinthians.torcida.app` | admin | sim |
| caravanas | `camisa-12-corinthians` (Camisa 12) | `aline.costa.14@teste.corinthians.torcida.app` | admin | sim |
| financeiro | `pde-gavioes-fiel` (Gaviões da Fiel) | `adriana.cardoso.727@teste.corinthians.torcida.app` | admin | sim |
| caravanas | `pde-gavioes-fiel` (Gaviões da Fiel) | `ana.correia.637@teste.corinthians.torcida.app` | admin | sim |

Senha dos e-mails `*@teste.corinthians.torcida.app`: ver `SENHA_TESTE` em `packages/db/scripts/lib/senha-teste.js` (repair: `db:senha-teste`).

---

## P.2 — seed:departamentos

✓ 2026-08-04 — **569** tenants ativos, **0** falhas (~491s).

---

## P.3 — Baseline payload das homes (ms, cold / cache bypass do next)

| Rota | Tenant | samples | p95≈ | pendências | com SLA |
|------|--------|---------|------|------------|---------|
| /admin/financeiro | `pde-gavioes-fiel` | 1461, 1165, 922 | **1461** | 1 | 0 |
| /admin/caravanas | `pde-gavioes-fiel` | 1092, 548, 549 | **1092** | 2 | 2 |
| /admin/financeiro | `camisa-12-corinthians` | 1029, 1039, 781 | **1039** | 1 | 0 |
| /admin/caravanas | `camisa-12-corinthians` | 565, 565, 565 | **565** | 2 | 2 |

> Medição via `carregarDirecao*` com `unstable_cache` mockado (cada hit = cold DB).
> Valida custo do loader S3; hit de TTL 45s só aparece com Next real + `PERF_METRICS=1`.

**Leitura Perf:** baseline utilizável para demos locais; não é SLO HTML.
Segunda medição com Next + `PERF_METRICS=1` fica como acompanhamento (não bloqueia P.5).

---

## P.4 — Smoke demo (ações inline)

- OK: Baixa inline ok (cobrança piloto)
- OK: Embarque/check-in inline ok (evento)

Aceite piloto (“≥1 ação sem sair da home”): **cumprido**.

---

## P.5 — Fecho oficial (revisão §7 + go/hold)

### Decisão de produto

| Residual Onda 4 | Decisão | Critério de reabertura |
|-----------------|---------|------------------------|
| **PWA check-in** | **HOLD** | ≥30% das demos/uso real pedirem offline ou home-screen no check-in Agenda |
| **Canal por área** | **HOLD** | Gestores Social/Carnaval pedirem isolamento operacional além do cockpit atual |

**Motivo (2026-08-04):** smoke Fin/Caravanas concluiu decisão na fila sem exigir offline,
home-screen ou segregação por área. Abrir esses epics agora seria escopo sem evidência
(anti-escopo do programa: sem segundo domínio / PWA “por se”).

### Revisão critérios §7 (amostra do piloto técnico — D0)

| Métrica (§7) | Alvo 90d | Status no fecho P.5 | Nota |
|--------------|----------|---------------------|------|
| Gestores Fin/Pat/Caravanas ≥1×/semana | ≥70% ativos | **Acompanhar** | Contas P.1 congeladas; uso humano ainda não medido em 14d |
| Movimentos Instrumentos/Bandeirões c/ 2 fotos | ≥80% | Fora do escopo P.1–P.5 | Patrimônio Onda 1 — não gateia P.5 |
| Achar ops caravana ≤2 cliques | ≤2 | **OK (smoke)** | Menu → `/admin/caravanas` → ação |
| Cobranças D+7 via inbox (30d) | ≥50% | **Acompanhar** | Baixa exercitada no smoke; taxa D+7 exige janela 30d |
| Colaborador mutando admin indevido | 0 | **OK (automatizado)** | Suíte RBAC / audits existentes |

### Guardrails do programa (snapshot)

| Guardrail | No fecho P.5 |
|-----------|--------------|
| AuditLog em ações de régua / check-in / baixa | ✓ exercitado pelas actions do smoke |
| `tenantId` nas queries de direção | ✓ loaders `*-direcao` |
| Sem regressão e2e Agenda / create CARAVANA | Acompanhar CI — não regressamos rota Agenda neste piloto |
| Docs `modulo-*` / programa na mesma entrega | ✓ este relatório + § Onda 5 do programa |

### Encerramento do piloto técnico

| Item | Estado |
|------|--------|
| P.1 Contas | ✓ |
| P.2 Seed departamentos | ✓ |
| P.3 Baseline payload | ✓ |
| P.4 Smoke inbox | ✓ |
| P.5 Go/hold + §7 | ✓ **fechado** |

**Próximo (não-código):** janela 14d de uso nas contas P.1; medir adoção §7;
só reabrir epics HOLD com evidência. Código novo só se (a) regressão p95 HTML,
(b) bug de demo, ou (c) reabertura afirmativa de P.5.
