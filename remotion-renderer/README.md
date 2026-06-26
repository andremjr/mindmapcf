# Canvas Narrativo — Remotion Renderer

Renderizador oficial em Remotion para os JSONs exportados pelo app **Canvas Narrativo** (target `remotion`).

## 1. Onde colocar o JSON

Coloque o arquivo exportado na raiz desta pasta com o nome:

```
remotion-renderer/project.json
```

(Você pode usar outro caminho passando `--props=./caminho/arquivo.json` no comando.)

## 2. Onde colocar o áudio

Crie a pasta `public/` (se não existir) e coloque dentro:

- O áudio principal — ex.: `public/audio/voz.mp3`
- Os SFX referenciados pelo `assetRegistry` — ex.: `public/sfx/whoosh.mp3`

Depois, edite o JSON e aponte os campos `file` para o caminho **relativo a `public/`**:

```json
{
  "audio": { "id": "...", "name": "voz.mp3", "durationSec": 87.3, "file": "audio/voz.mp3" },
  "assetRegistry": [
    { "id": "whoosh_soft_01", "file": "sfx/whoosh.mp3", "origin": "public", "license": "CC0", "author": "...", "sourceUrl": "..." }
  ]
}
```

> Se o áudio ou um SFX não existir, o vídeo **renderiza mesmo assim**, apenas sem aquele som. Um aviso aparece no console (`[CanvasNarrativo] ...`).
>
> SFX com `origin: "synth"` (gerados via Web Audio no app) são pulados — exporte-os como arquivo `.mp3`/`.wav` se quiser ouvi-los no MP4.

## 3. Instalar dependências

```bash
cd remotion-renderer
npm install
```

## 4. Abrir o preview (Remotion Studio)

```bash
npm run studio
```

O studio abre em `http://localhost:3000` já carregando o `project.json` embutido como props padrão — sem precisar selecionar manualmente. Se quiser testar outro JSON, basta substituir o arquivo `project.json` e reiniciar o studio.

## 5. Renderizar o MP4

```bash
npm run render
```

Equivale a:

```bash
npx remotion render src/index.tsx CanvasNarrativo out/video.mp4 --props=./project.json
```

O vídeo final fica em `remotion-renderer/out/video.mp4`. Width, height, FPS e duração são lidos automaticamente de `renderConfig` no JSON.

## Formato esperado do JSON

Use o adapter **Remotion** do app (`Exportar para Render` → target `remotion`) ou o JSON canônico (`generic`). Campos obrigatórios:

- `project.id`, `project.durationSec`
- `renderConfig.width`, `height`, `fps`, `durationSec`
- `textNodes[]`, `cameraKeyframes[]`, `transcriptBlocks[]`
- `visualPreset`, `soundPreset`
- `sfxEvents[]`, `assetRegistry[]` (podem ser vazios)
