# Vídeo nos nós + gravação da apresentação

## Resumo

Duas features independentes, ambas 100% client-side. Nada novo vai para o Supabase — o JSON do mapa continua leve, guardando só o `mediaRef` (id local). O vídeo real fica no computador do usuário (File System Access API, igual às imagens de hoje). A gravação da apresentação usa `getDisplayMedia` + `MediaRecorder` e devolve um `.webm` (ou `.mp4` no Safari) baixável na hora.

## Parte 1 — Vídeo no nó

### É possível? Sim, e o encanamento já existe

O `src/lib/imageStorage.ts` já persiste referência para arquivos locais via File System Access API com fallback em IndexedDB. Vídeo funciona igual: o `<video>` do HTML aceita o mesmo `URL.createObjectURL(file)` que hoje usamos para imagem. A única mudança é o tipo do arquivo aceito e o componente que renderiza.

### Mudanças de dados

- Renomear `imageRef` → `mediaRef` no `MindNode` (com um campo `kind: "image" | "video"`), ou adicionar um `videoRef` paralelo. Prefiro **unificar em `mediaRef`** para não duplicar lógica de reflow, permissão, "reconectar" etc. Migração simples: ao hidratar, se existir `imageRef` antigo, tratamos como `mediaRef` com `kind: "image"`.
- Manter o campo legacy `image` (base64) só para leitura retroativa — já sabemos que nada novo vai para lá.

### Player dentro do nó

- Componente `NodeMedia` substitui `NodeImage`. Se `kind === "video"`, renderiza `<video controls playsInline preload="metadata" />` com poster gerado do primeiro frame (capturado com `<canvas>` uma vez, cacheado em memória).
- Controles nativos (`controls`) já dão play/pause/scrub. Ideal para o cenário "estou apresentando, chego no nó, aperto play, pauso, falo por cima, dou play de novo" — o áudio do vídeo continua tocando pelos alto-falantes e é capturado junto com a narração pela gravação (ver Parte 2).
- Reflow: vídeo ocupa a mesma altura da imagem hoje (`IMAGE_NODE_H = 190`). Se quisermos aspect ratio 16:9 fiel, lemos `videoWidth/videoHeight` no `loadedmetadata` e ajustamos a altura do card.

### Modo apresentação

- Quando a câmera "chega" no nó com vídeo, dá `video.currentTime = 0` e opcionalmente auto-play (config por nó: `autoPlayOnFocus?: boolean`). Ao sair do nó, `pause()`.
- Se o usuário parar no nó e pausar para falar por cima, nada acontece — a câmera só se move quando ele avança com a seta, então o vídeo pausado fica lá esperando.

### Limitações honestas

- File System Access API só funciona em Chromium (Chrome/Edge/Brave/Arc). No Firefox e Safari cai no fallback IndexedDB — aí o arquivo do vídeo **fica gravado dentro do navegador** (não é upload, mas ocupa espaço no disco do usuário). Para vídeos de 200MB+ isso incomoda. Vou avisar na UI qual modo está ativo.
- Sem thumbnails no cartão do projeto para vídeo por enquanto (dá para adicionar depois capturando o primeiro frame e cacheando em IndexedDB).

## Parte 2 — Gravação da apresentação (tela + áudio)

### É possível? Sim, nativo do navegador

Duas APIs bastam, sem lib externa:

- `navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })` — captura a tela (a aba, a janela ou o monitor inteiro, o usuário escolhe no diálogo do navegador). O `audio: true` captura o **áudio do sistema/aba** (o som do vídeo do nó toca e é gravado junto).
- `navigator.mediaDevices.getUserMedia({ audio: true })` — captura o microfone (narração).
- Junta as duas trilhas de áudio num `AudioContext` (dois `MediaStreamAudioSourceNode` → `MediaStreamAudioDestinationNode`), pega a trilha de vídeo do displayStream, monta um `MediaStream` final e passa para `MediaRecorder`.
- `MediaRecorder` produz um Blob que vira download `.webm` (VP9+Opus) direto.

### Fluxo de UX

1. Botão "Gravar apresentação" na tela do editor (ao lado de "Apresentar").
2. Ao clicar: pede permissão de tela (o próprio navegador mostra o seletor), depois pede o microfone. Se qualquer um for negado, aborta com toast explicando.
3. Entra em fullscreen e no modo apresentação normal. Um indicador discreto no canto (bolinha vermelha + tempo) mostra que está gravando. Tecla **R** para parar (ou botão flutuante).
4. Ao parar: gera Blob, cria `URL.createObjectURL`, dispara download `apresentacao-<titulo>-<data>.webm`. Também abre um mini-modal: "Baixar" / "Pré-visualizar" (`<video>` inline) / "Descartar".

### Qualidade e formato

- Codec padrão do Chrome/Edge: `video/webm;codecs=vp9,opus`. Ótima qualidade, arquivo compacto. **Não sai MP4 direto** — Chrome não gera MP4 no `MediaRecorder` (ainda). Duas alternativas:
  - **Recomendado:** entregar `.webm` e explicar que roda em qualquer player moderno (VLC, navegador). É o que o Loom/Vimeo Record fazem.
  - **Opcional (custo alto):** conversão para MP4 no cliente via `ffmpeg.wasm`. Funciona, mas: baixa ~30MB de wasm, é lento (RT ~0.3× a 0.5× num Mac decente, ou seja, 10min de vídeo levam ~20-30min para converter), e trava a aba se não for feito com Web Worker. **Não recomendo no v1** — deixamos como botão "Converter para MP4" opcional depois.
  - Safari (macOS 14+) suporta `video/mp4;codecs=avc1,mp4a` no `MediaRecorder`, então detectamos com `MediaRecorder.isTypeSupported` e escolhemos o melhor formato disponível.
- Bitrate configurável (default 5 Mbps para 1080p). Framerate deixa o browser decidir (30fps típico).
- Sem limite de duração além da memória disponível. Para segurança, o `MediaRecorder` recebe `timeslice` de 1s — os chunks vão sendo acumulados num array de Blobs, então mesmo 1h de vídeo cabe (fica em disco via Blob, não em RAM contínua).

### Detalhe importante sobre áudio

- O usuário **precisa marcar "Compartilhar áudio da guia"** no diálogo do Chrome quando escolhe uma aba/tela. Se ele esquecer, só grava o mic. Vou colocar um lembrete visível antes do prompt.
- No Safari, captura de áudio do sistema via `getDisplayMedia` é limitada. Se detectarmos Safari, avisamos que só o mic será gravado com garantia.
- Se o usuário pausar o vídeo do nó e falar por cima, o mic capta a voz e o áudio do vídeo fica em silêncio nesse trecho — comportamento esperado.

### Limitações honestas

- Só funciona em desktop. Mobile browsers não expõem `getDisplayMedia`.
- Requer HTTPS (o preview e a produção já são).
- O usuário vê o próprio prompt de compartilhamento de tela do navegador — não dá para pular isso, é uma exigência de segurança da web.

## Arquivos afetados

- `src/lib/types.ts` — `MindNode.mediaRef: { id, name, size, lastModified, kind }` (unifica image/video).
- `src/lib/imageStorage.ts` → renomear para `mediaStorage.ts`, aceitar `video/*` no picker, expor `resolveMedia` (devolve `{ url, kind }`).
- `src/components/mindmap/NodeCard.tsx` — `NodeMedia` no lugar de `NodeImage`, com `<video>` quando `kind === "video"`.
- `src/lib/store.ts` — `nodeIntrinsicHeight` continua igual (imagem e vídeo ocupam o mesmo espaço).
- `src/components/mindmap/Presentation.tsx` — auto-play/pause do vídeo do nó focado.
- `src/lib/screenRecorder.ts` **(novo)** — orquestra `getDisplayMedia` + `getUserMedia` + `AudioContext` mix + `MediaRecorder`, expõe `start()`, `stop(): Promise<Blob>`, evento de tempo decorrido.
- `src/components/mindmap/RecordingControls.tsx` **(novo)** — indicador flutuante durante gravação, modal de download ao parar.
- `src/components/mindmap/MindMapEditor.tsx` — botão "Gravar apresentação".
- `src/routes/projects.$id.present.tsx` — hook `useScreenRecording` opcional quando entrou via botão de gravar.

## Ordem sugerida de implementação

1. Renomear `imageRef` → `mediaRef` com `kind` e migrar leitura retroativa (baixo risco, 1 passo).
2. Aceitar vídeo no picker + `<video>` no card + auto play/pause no modo apresentação.
3. `screenRecorder.ts` isolado (testável sozinho) + botão + modal de download.
4. Polimentos: poster do primeiro frame do vídeo, detecção de codec, avisos de compat.

## O que fica para depois (não faz parte deste plano)

- Conversão automática para MP4 (`ffmpeg.wasm`).
- Thumbnails de vídeo no card do projeto na página `/projects`.
- Configuração de bitrate/resolução na UI de gravação.
- Marcadores/capítulos no vídeo gerado (baseados nos nós visitados).
