# Narração pré-gravada no modo Gravar (Pro)

## A ideia faz sentido?
Sim, tecnicamente é totalmente viável e encaixa bem no que o app já faz. Hoje o `screenRecorder` já mistura áudios via Web Audio (`MediaStreamDestination`) antes de mandar pro `MediaRecorder`. Basta trocar/adicionar uma fonte de áudio: em vez do microfone, plugamos um `<audio>` com o arquivo de narração. O vídeo final sai com a narração como trilha, e o usuário só opera os nós no tempo dele.

Também não estraga o resto: é uma opção **por projeto**, opt-in, só aparece quando o usuário anexa uma narração. Sem narração anexada, tudo funciona exatamente como hoje (mic + áudio do sistema).

## Como funciona pro usuário
1. No inspetor do mapa (ou num botão novo no header do editor), o usuário **anexa um arquivo de áudio** (mp3/wav/m4a/webm) — mesmo padrão do file picker de imagem/vídeo, salvo local (IndexedDB), sem subir pra Supabase.
2. Aparece um mini-player pra ouvir e conferir.
3. Ao entrar no modo **Gravar** com narração anexada:
   - Countdown de 3s (como já existe).
   - Ao gravar começa, a narração toca automaticamente.
   - O microfone é **ignorado** (a trilha é a narração).
   - O Sonic Avatar reage às ondas da narração (usa o analyser desse áudio em vez do mic).
   - Barra de progresso da narração fica no HUD, com botão de pausar/retomar.
   - Quando a narração acaba, aparece um aviso “Narração terminou — encerrar gravação?” (não para sozinho, pra dar folga pro usuário fechar bonito).
4. No modo **Apresentar** (sem gravação), a narração também toca, útil pra ensaiar.

## Regra Pro
- Anexar narração e usar o modo com narração são bloqueados por `useSubscription().isPro`.
- Free vê o botão com cadeado e o `UpgradeDialog` já existente.
- Enforcement no cliente é suficiente (feature de UX, não de dados sensíveis) — mesmo padrão do Sonic Avatar.

## Impacto técnico (arquivos)
- `src/lib/types.ts`: `MindmapProject` ganha `narrationMediaId?: string` (referência no IndexedDB, igual imagens).
- `src/lib/imageStorage.ts`: reaproveitar `pickMediaAndStore` — só ampliar filtro pra aceitar `audio/*`.
- `src/lib/screenRecorder.ts`: aceitar `narrationEl?: HTMLAudioElement` em `startRecording`. Se presente, cria `MediaElementAudioSourceNode`, conecta ao `dest` e ao `audioAnalyser`, e **não** pede `getUserMedia` de mic.
- `src/lib/micAnalyser.ts`: sem mudança; só não é ligado quando há narração.
- `src/components/mindmap/Presentation.tsx`:
  - Novo `<audio ref>` oculto com o blob da narração.
  - Ao começar (após countdown), `audio.play()` + `startRecording({ narrationEl })`.
  - Ao pausar/retomar recording, pausa/retoma o áudio.
  - Ao sair, `audio.pause()` + revoga URL.
- `src/components/mindmap/RecorderHUD.tsx`: barra de progresso + botão pausar narração quando aplicável.
- `src/components/mindmap/MindMapEditor.tsx`: no inspetor, seção “Narração (Pro)” com anexar/remover/preview, gated por `isPro`.
- `src/components/mindmap/SonicAvatarOverlay.tsx`: nenhuma mudança — já usa `getRecordingAnalyser()` primeiro, que passa a expor a narração automaticamente.

## Limitações honestas
- Só uma narração por projeto (uma trilha única). Multi-track / edição no meio fica fora do escopo.
- Se o usuário passa dos nós fora do ritmo da narração, o vídeo mostra isso — não há “auto-sync”. É um editor ao vivo, como você descreveu.
- Arquivos grandes (>50MB) podem pesar o IndexedDB do navegador. Vou avisar no anexo se passar disso e sugerir comprimir.
- Áudio do sistema (aba) continua sendo capturado por padrão; posso silenciar durante narração pra não sobrepor — confirmar preferência (default: silenciar).

## Riscos de regressão
Baixos. As mudanças no `screenRecorder` são aditivas (novo parâmetro opcional). O caminho sem narração fica idêntico ao atual. Sonic Avatar já tem fallback em cascata (recording → mic → nada), então continua funcionando nos três cenários.

## Fora do escopo (posso fazer depois se você quiser)
- Gravar a narração dentro do próprio app (em vez de anexar arquivo).
- Marcadores/cue points na waveform pra pular nós automaticamente.
- Waveform visual do áudio anexado.
