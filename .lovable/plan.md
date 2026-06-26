## Canvas Narrativo — Plano de Implementação (Prompts 1–3)

Plataforma para transformar áudios em vídeos no estilo "quadro infinito textual cinematográfico". MVP sem IA generativa, sem imagens, focado em texto + canvas + câmera + som.

### Stack e arquitetura
- TanStack Start (já configurado) + Tailwind v4 + shadcn/ui.
- Zustand para estado global do projeto atual (leve, sem boilerplate).
- LocalStorage para persistir projetos (mock de backend — Lovable Cloud fica para depois).
- Sem backend agora; `assemblyService` preparado para edge function futura.

### Estrutura de arquivos
```text
src/
  routes/
    index.tsx                 → redireciona para /projects
    projects.tsx              → Dashboard de projetos
    projects.$id.tsx          → Editor (layout principal)
  components/
    editor/
      EditorLayout.tsx        → sidebar + canvas + properties + timeline
      LeftSidebar.tsx         → navegação entre etapas (Audio, Transcript, Blocks, Canvas, Render)
      CanvasPreview.tsx       → placeholder do quadro infinito (Prompt 4+)
      PropertiesPanel.tsx     → propriedades contextuais
      Timeline.tsx            → timeline inferior com playhead
    audio/
      AudioUploader.tsx       → drop/upload + player + meta
      AssemblyConfig.tsx      → API key (sessionStorage), idioma, opções
      TranscriptView.tsx      → texto + palavras com timestamps
    blocks/
      BlocksReview.tsx        → lista editável de blocos
      BlockEditor.tsx         → editar texto/shortText/tipo, split/merge/delete
    projects/
      ProjectsDashboard.tsx
      ProjectCard.tsx
  lib/
    types.ts                  → todos os tipos TS
    store.ts                  → Zustand store (currentProject, projects)
    mockProject.ts            → projeto exemplo completo
    assemblyService.ts        → transcribeAudioMock + stub real
    blockGenerator.ts         → algoritmo de blocos + shortText + classificação
    triggers.ts               → mapas de palavras-gatilho
  styles.css                  → tema escuro cinematográfico
```

### Tipos (lib/types.ts)
`Project, AudioFile, Transcript, TranscriptWord, TranscriptBlock, TextNode, CameraKeyframe, SfxEvent, VisualPreset, SoundPreset, RenderConfig` + enum `ProjectStatus` com os 7 status (draft → exported).

### Design System
- Tema escuro: bg `oklch(0.14 0.01 270)`, surface elevada, accent ciano/violeta sutil.
- Tipografia: Inter (UI) + JetBrains Mono (timestamps/dados).
- Cards com borda sutil, sombra ambiente, hover com glow leve.
- Botões: primary (accent), ghost, destructive — todos via shadcn variants.
- Fontes carregadas via `<link>` em `__root.tsx`.

### Prompt 1 — Fundação
1. Criar `lib/types.ts`, `lib/store.ts`, `lib/mockProject.ts` (1 projeto com 15 blocos, keyframes, sfx).
2. Tema escuro em `styles.css` com tokens semânticos.
3. Rotas: dashboard `/projects` + editor `/projects/$id`.
4. `EditorLayout` com 4 zonas (sidebar | canvas placeholder | properties | timeline).
5. Navegação por etapas via `LeftSidebar` (controla qual painel central exibe).

### Prompt 2 — Áudio + AssemblyAI (mock)
1. `AudioUploader`: drag/drop, `<audio>` player, mostra nome/tamanho/duração, botão trocar/remover. Arquivo via `URL.createObjectURL`.
2. `AssemblyConfig`: API key (sessionStorage + aviso de segurança), idioma (default pt-BR), toggles word-timestamps e punctuation, botão "Transcrever".
3. `assemblyService.ts`:
   - `transcribeAudioMock(audio, opts)` → Promise com delay simulado, retorna `Transcript` rico (texto, ~80 palavras com start/end, parágrafos, duração, idioma).
   - `transcribeAudioReal()` stub com comentários TODO indicando endpoint AssemblyAI e necessidade de edge function.
   - Estados loading/error/success expostos via store.
4. `TranscriptView`: texto completo, lista de palavras destacáveis, botão "Gerar blocos de fala".

### Prompt 3 — Algoritmo de blocos
1. `lib/triggers.ts`: mapas de palavras-gatilho por tipo (intro, contrast, problem, solution, example, conclusion, warning).
2. `lib/blockGenerator.ts`:
   - `generateBlocks(transcript)`: segmenta por pausa (>0.6s), pontuação forte, e limite de duração (5–12s) / caracteres (≤120). Divide frases longas; junta micro-segmentos.
   - `classifyBlock(text)`: aplica triggers → tipo; primeiro bloco vira `intro`, último com gatilho de conclusão vira `conclusion`, default `main_idea` ou `detail`.
   - `generateShortText(text)`: remove stopwords PT-BR, mantém 6–10 palavras-chave preservando ordem.
   - `extractKeywords(text)`: top N substantivos/verbos por heurística simples.
   - `computeEmphasis(block)`: 0–1 baseado em pontuação/maiúsculas/triggers.
3. `BlocksReview`: lista ordenada com inline edit (texto, shortText, tipo via select), ações merge (juntar com próximo), split (no cursor), delete. Botão "Gerar canvas narrativo" muda status para `blocks_generated`.

### Persistência e estado
- Store Zustand: `projects[]`, `currentProjectId`, ações `createProject, updateProject, setAudio, setTranscript, setBlocks, updateBlock, mergeBlocks, splitBlock, deleteBlock, setStatus`.
- Persist middleware → localStorage (exceto API key, que vai em sessionStorage).

### Fora do escopo destes 3 prompts
- Render real do canvas infinito, câmera, SFX (Prompt 4+).
- Integração real AssemblyAI (stub pronto).
- Export MP4 / Remotion.
- Lovable Cloud / auth.

Posso seguir e implementar os 3 prompts nesta ordem?
