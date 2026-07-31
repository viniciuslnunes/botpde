# Plano de merge — torcidas duplicadas (mesmo clube)

Gerado em: 2026-07-31 · atualizado com Mancha Alviverde (hífen) e confirmação Flamengo  
Mapa: `docs/ops/mapa-torcidas-duplicadas.md`  
Script: `packages/db/scripts/merge-torcidas-duplicadas.js`

**Nenhuma deleção foi feita.** Validar e só então `--apply`.

---

## Princípios

1. **Escopo:** mesmo clube + mesma chave (strip `Torcida`/`Movimento` + colapsar hífen: `Alvi-verde` ≈ `Alviverde`).
2. **Keeper:** dados operacionais (membros, alianças, rivalidades, unidades).
3. **Da candidata/catálogo:** logo + `torcidaConhecidaId` + localização do catálogo (só se keeper SEDE estiver vazia).
4. **Sede scaffolding da candidata:** apagar (não transferir). Até 5 membros na candidata → remanejar para a SEDE do keeper.
5. **Nome formal:** definido no script por par (não “o mais longo” cego — `Mancha Alviverde` vence `Mancha Alvi-verde`).
6. **Não sobrescrever** endereço do keeper se já preenchido.

---

## Os 7 pares

### 1. Fogão — Fúria Jovem
MANTER `furia-jovem-do-botafogo-rj` ← apaga `furia-jovem-botafogo`  
Catálogo + aliança ATIVA Gaviões + soft refs.

### 2. Mengão — Torcida Jovem do Flamengo ← print
| | Slug | Nome | Logo | Membros |
|---|---|---|:---:|---:|
| **MANTER** | `torcida-jovem-flamengo` | Torcida Jovem do Flamengo | não | 61 |
| **DUPE** | `torcida-jovem-do-flamengo-rj` | Jovem do Flamengo | **sim** | 0 |

**Ação:** copiar **logo + catálogo** da Jovem → Torcida Jovem. Apagar scaffolding.  
Resultado: um card `TORCIDA JOVEM DO FLAMENGO` **com** a imagem correta.

### 3. Peixe — Torcida Jovem do Santos
Igual Flamengo: logo/catálogo da curta → keeper com dados.

### 4. Verdão — Mancha Alviverde ← print (novo)
| | Slug | Nome | Logo | Membros | Localização SEDE |
|---|---|---|:---:|---:|---|
| **MANTER** | `mancha-alviverde` | Mancha Alviverde | não | **61** | Rua Turiassú, 1777 — Perdizes (= catálogo) + 3 SUBSEDES |
| **DUPE** | `mancha-alvi-verde-sp` | Mancha Alvi-verde | **sim** | 1 PENDENTE | Rua Palestra Itália, 203 (**descartar**) |

**Ação:**
- Copiar **logo + catálogo** → keeper
- Remanejar 1 membro PENDENTE → SEDE do keeper
- Manter Turiassú (não sobrescrever com Palestra Itália)
- Apagar SEDE errada + tenant dupe

### 5. Colorado — Camisa 12
Só apagar scaffolding vazio.

### 6. Tricolor SP — Independente
Rename keeper → `Torcida Tricolor Independente`; apagar `tti-sao-paulo`.

### 7. Tricolor RS — Jovem do Grêmio
Rename keeper → `Torcida Jovem do Grêmio`; apagar dupe.

---

## Como rodar

```bash
pnpm --filter @torcida/db exec node scripts/merge-torcidas-duplicadas.js
pnpm --filter @torcida/db exec node scripts/merge-torcidas-duplicadas.js --apply
```

Pós-apply: reexecutar `mapa-torcidas-duplicadas.js` (esperado: 0 grupos) e conferir onboarding Flamengo + Palmeiras.
