# Plano — Melhorias no formato Matriz (Graphs)

Objetivo: elevar o ritmo visual e o acabamento do formato Matriz (Quadrantes, Dispersão, Linha, Alvo) para vídeos de YouTube, tanto no editor quanto nos modos apresentação e gravação (automático e manual).

## 1. Editor (`MatrixEditor.tsx`)

**Fluxo de dados de entrada mais rápido**
- Botão "Adicionar item" único (remover a exigência de imagem+texto) e importação em lote de imagens, alinhado ao padrão de Ranking/Bracket.
- Seletor de proporção da imagem (Quadrado / Vertical / Horizontal) por projeto, reutilizando `tierlistConfig`. Reflete no editor e na apresentação.
- Painel inspetor lateral (aside) para editar o item selecionado: título, descrição (usada no spotlight), cor de acento, imagem.

**Posicionamento no gráfico com feedback preciso**
- Arraste dos itens direto sobre o gráfico do editor (hoje só existe pool → apresentação manual). Snap opcional a grid (5%/10%) e linhas-guia dos eixos centrais.
- Coordenadas numéricas visíveis ao passar o mouse (X%, Y%) e tooltip com nome do item.
- Botão "Auto-posicionar" para distribuir itens não posicionados em uma grade suave, útil como ponto de partida.

**Configuração dos eixos e temas do gráfico**
- Cor de acento global do gráfico (usada em eixos, glow dos cards ativos, spotlight) e alternância de "estilo visual": Studio (fundo neutro), Blueprint (linhas técnicas), Neon (glow forte para thumbnails).
- No Bullseye: reordenar anéis por drag e editor de nome/cor por anel diretamente na legenda.
- No Line: adicionar/editar milestones clicando na linha do tempo em vez de formulário separado.

## 2. Apresentação — modo automático (`MatrixPresentation.tsx`)

**Ritmo cinematográfico do reveal**
- Trocar o `activeIdx` estático por uma câmera virtual: zoom-in no card revelado (fit-to-view a ~55% do frame) e zoom-out contextual entre revelações, com transição 1.6s ease-in-out — mesmo padrão dos outros formatos.
- Sequência de intro por tipo:
  - Quadrantes: desenha eixo Y, eixo X, tinta as 4 zonas com legenda breve, então revela cards por quadrante (agrupar visualmente).
  - Dispersão: eixos + grid crescendo, depois "sweep" da esquerda pra direita revelando pontos.
  - Linha: linha desenha do início ao fim, milestones pulsam, cards passam pela câmera em sequência tipo timeline scroll.
  - Bullseye: anéis expandindo de fora pra dentro; câmera parte do anel externo e faz zoom até o centro à medida que os itens são revelados.
- Card ativo: leve parallax do fundo, glow com a cor de acento, contador "3/12" discreto no canto.

**Spotlight mais informativo**
- Substituir modal por painel lateral 1/3 do frame (não cobre o gráfico), com título grande, descrição, cor de acento e "posição na matriz" traduzida em texto ("Alto potencial · Baixo custo", "Anel 2 — Considerar", "Etapa 3 de 5").
- Auto-avanço opcional (timer configurável) para gravações sem cliques.

**Legibilidade em 1080p**
- Tipografia dos rótulos dos eixos maior e com backplate translúcido.
- Fundo com gradiente sutil por tipo (Quadrantes = radial suave; Bullseye = radial escuro no centro) em vez do `bg-muted` liso, mantendo suporte a tema claro/escuro.
- Vinheta leve durante o spotlight para focar a atenção.

## 3. Apresentação — modo manual

- Mesma câmera do modo automático: ao soltar um card no gráfico, faz zoom-in até ~55% e mantém 1.2s, depois zoom-out. Isso dá continuidade narrativa em vídeos ao vivo.
- Pool inferior com miniaturas na proporção escolhida e badge de restantes; ao pegar um card, aparecem linhas-guia dos eixos e a zona/anel destacada em tempo real.
- Clique num card já posicionado abre o mesmo painel de spotlight do modo automático (paridade com Bracket/Ranking).

## 4. Gravação

- Aplicar o mesmo padrão de "primeiro frame limpo" já usado nos outros formatos: `beginArmedRecording` + double `requestAnimationFrame` para descartar countdown e overlays.
- Garantir que a `AvatarLayer` permaneça visível durante toda a sequência (já ok; apenas revalidar após o novo layout do spotlight lateral).
- Testar as 4 variações (Quadrantes, Dispersão, Linha, Bullseye) em modo automático e manual, gravando um clipe curto de cada e verificando fit do frame.

## 5. Notas técnicas (para implementação)

- `MatrixEditor.tsx`: extrair `ChartCanvas` reutilizável entre editor e apresentação para evitar divergência de layout. Adicionar helpers `snapToGrid`, `readPointerPct`.
- `MatrixPresentation.tsx`: introduzir `useCamera({ target, zoom })` compartilhado (poderia viver em `components/shared/PanZoom.tsx`, já usado no Bracket). Steps continuam definidas por `buildSteps`, mas cada `reveal`/`focus` calcula alvo da câmera a partir de `pctX/pctY`.
- Reaproveitar `tierlistConfig` para `ItemAspect` e `NodeColorPicker` para cor de acento.
- Sem mudanças de schema Supabase: `pctX/pctY`, `color`, `body`, `imageRef` já cobrem o necessário.

## 6. Fora do escopo desta iteração

- Novos tipos de gráfico (barras, radar) — plano só refina os 4 existentes.
- Edição multi-usuário do gráfico em tempo real.
- Exportação estática (PNG/PDF) do gráfico fora do modo gravação.
