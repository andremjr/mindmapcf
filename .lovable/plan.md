# Ajustes de layout — controle manual + regra de vídeo

Referência das práticas usadas (XMind, MindMeister, Miro, Whimsical): largura auto por padrão, alça de resize manual sobrescreve, seleção múltipla via marquee (arrasto do fundo) + Shift-click, grupo arrasta preservando deltas relativos. Vamos adotar o mesmo modelo.

## 1. Resize manual do nó

- Adicionar alça de resize na borda direita do card (`NodeCard.tsx`), visível apenas quando `selected && !presentation`.
- Ao arrastar: atualiza `node.width` no store; largura respeita `min=220`, `max=900`.
- Botão "Auto" no inspector lateral (`MindMapEditor.tsx` painel direito) que limpa `node.width` e volta ao `nodeEffectiveWidth` adaptativo.
- `nodeEffectiveWidth` já respeita `n.width` quando definido — nada a mudar lá.
- Após soltar a alça, dispara `reflowTree` (via `updateNode` — já reflowa quando `width` muda a altura intrínseca).

## 2. Seleção múltipla + arrasto em grupo

- Store: trocar `selectedId: string | null` por `selectedIds: string[]` (mantém helper `selectedId` = primeiro item para compatibilidade com inspector). Novas ações: `setSelection(ids)`, `toggleSelection(id)`, `moveNodes(projectId, deltas)`.
- `MindMapCanvas`: marquee de seleção com arrasto do fundo (retângulo tracejado). Ao soltar, seleciona todos os nós cujo centro cai dentro. Shift+clique num nó adiciona/remove da seleção. Clique simples num nó já selecionado no grupo mantém o grupo (para permitir arrasto conjunto); clique num nó fora zera e seleciona só ele.
- `NodeCard` drag: se o nó pertence à seleção múltipla, o `onDragStart` move todos os nós selecionados aplicando o mesmo delta (via nova ação `moveNodes`). Se não, comportamento atual.
- Reflow: arrasto manual em grupo **não** dispara reflow (comportamento de mapa manual — deltas do usuário são preservados). Reflow segue acionado só por criação/exclusão/mudança de pai/alteração de altura intrínseca.
- Delete/color/etc no toolbar operam sobre toda a seleção quando `selectedIds.length > 1`.

## 3. Regra 40% para vídeo horizontal em foco

- Em `NodeCard.tsx` (`NodeMedia` → `VideoPlayer`): medir aspect ratio no `onLoadedMetadata`. Considerar horizontal se `videoWidth / videoHeight >= 1.2`.
- Passar `videoAspect` do `NodeMedia` para o card via callback (`onVideoMeta`) armazenado em state local do `NodeCard`.
- Quando `presentation && active && videoHorizontal`:
  - Altura do vídeo renderizado = `w / aspect` (já é natural — o vídeo ocupa a largura do card).
  - Container do texto (`div.px-4.py-3`) ganha `maxHeight = videoHeight * 0.4`, `overflow: hidden`.
  - Fonte do texto usa uma versão "fit" do `autoFontSize`: começa no tamanho normal e reduz iterativamente até caber via medição do `scrollHeight` (loop simples com `useLayoutEffect` refletindo em state `fittedFontPx`, chão em 9px).
- Fora de `presentation && active`: comportamento atual (autoFontSize por tamanho de texto).
- `nodeIntrinsicHeight` no store **não muda** — o encolhimento só afeta o frame de apresentação; o layout do editor continua respirando o texto inteiro.

## Arquivos afetados

- `src/lib/store.ts` — `selectedIds`, `setSelection`, `toggleSelection`, `moveNodes`. Manter `nodeEffectiveWidth`.
- `src/components/mindmap/MindMapEditor.tsx` — consumir `selectedIds`; botão "Auto" de largura no painel direito; roteamento de delete/color em grupo; marquee handlers.
- `src/components/mindmap/MindMapCanvas.tsx` — retângulo de marquee + hit-test.
- `src/components/mindmap/NodeCard.tsx` — alça de resize (right edge), suporte a drag em grupo, medição de aspect do vídeo, fit-to-40% em presentation+active.

## Detalhes técnicos

- `moveNodes(projectId, [{id, dx, dy}])` aplica offsets sem reflow.
- Marquee: registrar em `onBackgroundPointerDown` só se o alvo é o fundo do canvas; converter pixels em coord de mundo com o viewport atual.
- Fit-font loop: no máximo 8 iterações binárias entre `[9, autoFontPx(text,isRoot)]`; roda quando `active/presentation/text/videoHeight` mudam.
- `.width` persistido no JSONB do Supabase igual às demais props do nó (nenhuma migração necessária).

Confirma que posso implementar os três pontos?
