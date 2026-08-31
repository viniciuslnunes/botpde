# Upload de imagem + localização — crop/preview

Padrão de **ajustar e redimensionar antes do upload** (crop/zoom) e de
**definir coordenadas** (link Maps / busca / pin / Street View), introduzido
nas sedes (2026-07-24) e estendido aos demais formulários de mutação.

## Já entregue

### Primitivos (`apps/web/src/components/media/`)

| Peça | Uso |
|------|-----|
| `ImageCropDialog` | Modal: pan + zoom + recorte de aspecto fixo → JPEG |
| `FileDropOverlay` / `useFileDragOver` | Overlay “Arraste arquivo aqui” (feed / DM) |
| `useCroppedImageUpload` | Abre o dialog a partir de `File` / data URL; sobe ao Cloudinary |
| `ImageUploadField` | Campo controlado (drop zone + crop + URL opcional) |
| `LocationPickerFields` | Link Maps, busca, lat/lng, pin arrastável, Street View opcional |
| `MapLocationPicker` | Mapa clicável / pin `gmpDraggable` |
| `lib/image-crop.ts` | Matemática do crop (cover, clamp, export canvas) |
| `lib/maps-actions.ts` | `resolverCoordsDeLinkMaps`, `obterStreetViewParaCrop` (server) |

Re-exports de compatibilidade: `components/admin/image-crop-dialog.tsx`,
`sede-map-picker.tsx`; sedes actions reexportam as maps-actions.

### Onde o fluxo já está ligado

| Superfície | Crop (aspecto) | Mapa / coords |
|---|---|---|
| Admin sedes | 16:9 (foto identidade) + Street View (localização, ângulos persistidos) | Completo — fluxos separados |
| Admin eventos | 16:9 + Street View → capa | Completo |
| Admin loja (produto) | 1:1 | — |
| Admin loja (vitrine) / portal capa | 16:9 (igual aos cards) | — |
| Admin bar (produto) | 1:1 | — |
| Admin mural (post) | 16:9 | — |
| Admin config — canal oficial | 1:1 | — |
| Portal canais (criar / config) | 1:1 + `ImageDropZone` | — |
| Portal grupos (foto) | 1:1 + `ImageDropZone` | — |
| Portal perfil (capa / avatar) | ~3:1 / 1:1 + `ImageDropZone` | — |
| Onboarding — comprovante | 4:3 (`purpose: cadastro`) | — |
| Onboarding — provas de unidade | 4:3 (`purpose: cadastro`, até 5) | — |
| Stories (imagem) | 9:16; vídeo sobe sem crop | — |

Convenções: `purpose` Cloudinary (`sede`, `comunidade`, `perfil-*`, `cadastro`, …);
URL externa continua opcional; sem chave Maps, localização degrada
(geocode/mapa/Street View somem, lat/lng manuais ficam).

### Sedes — Street View ≠ Foto da unidade

Dois fluxos distintos no formulário admin:

| Bloco | Campo(s) | Uso |
|-------|----------|-----|
| Street View | `lat`/`lng` + `streetViewHeading`/`Pitch`/`Fov` | Fachada nas listagens/portal de unidades (`resolveSedeLocationImage`) |
| Foto da unidade | `Sede.fotoUrl` (upload) | Identidade: topbar (`resolveTenantLogoUrl`) e fallback de canais oficiais |

Não há mais “Usar como foto” que copia Street View para `fotoUrl`. Eventos
mantêm Street View → capa (domínio diferente).

## Backlog — implementação futura

Não aplicar crop “à força” em mídia social livre ou documentos sem critério
de enquadramento. Itens abaixo são candidatos quando houver demanda de UX.

### Prioridade baixa / só sob pedido

1. **Feed composer / anexos de post** (`feed-composer.tsx`)  
   - Multi-imagem + vídeo; crop fixo atrapalha. Considerar só se houver
     modo “capa” ou thumb gerada, não no fluxo geral.

2. **DM / thread** (`mensagem-thread.tsx`)  
   - Anexos efêmeros — manter upload livre.

3. **Afiliação / super-admin intake**  
   - Endereço texto hoje. Quando criar `Sede` na aprovação, reutilizar o
     picker de localização das sedes (já existe).

### Fora de escopo (não agendar sem motivo novo)

- Maps só de **exibição** (portal sedes explorer, OSM de eventos).  
- Geolocalização do browser para “Perto de mim” (ordenação, não entidade).  
- `PatrimonioItem.localizacao` / endereço de checkout (texto, não geo).  
- Design admin (`logoUrl`/`escudoUrl` lidos, sem upload na UI atual).

## Como estender (checklist)

1. Preferir `ImageUploadField` / `ImageDropZone` + `useCroppedImageUpload` — não
   reabrir Cloudinary sem crop em formulários de mutação de capa/avatar/produto.
2. Escolher `aspect` pelo uso: capa/sede/evento `16/9`; produto/avatar `1`;
   banner perfil `~3`; documento onboarding `4/3`; stories `9/16` (só imagem).
3. Coordenadas de local (evento, sede, futura unidade): `LocationPickerFields`
   + `lib/maps-actions` (permissões: `SEDES_MANAGE` / `EVENTS_*` / membro ativo
   no Street View proxy).
4. Não adicionar dependência de cropper externa — o dialog zero-dep basta
   até prova em contrário.
5. Testes: `lib/__tests__/image-crop.test.ts`, `google-maps.test.ts`
   (parser de link).

## Referências

- Sedes: `components/admin/sede-forms.tsx`  
- Eventos: `components/admin/evento-forms.tsx`  
- Onboarding: `app/onboarding/wizard.tsx`  
- Stories: `components/portal/story-rings.tsx`  
- Maps helpers: `lib/google-maps.ts`  
- Upload sign: `app/api/upload/sign/route.ts` + `lib/cloudinary-upload.ts`
