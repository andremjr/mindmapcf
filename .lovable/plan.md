# Templates de Canvas: Tier List + Iceberg

Adicionar dois novos formatos ao lado do mapa mental, ambos **exclusivos Pro**, reaproveitando o mesmo grafo de nós (posição, mídia, texto, cor) que já sincroniza com Supabase, grava vídeo, toca narração e renderiza Sonic Avatar.

## Modelo de dados (sem migração)

O campo `data` da tabela `mindmaps` já é `jsonb` livre. Adicionamos duas chaves:

- `data.template`: `"mindmap" | "tierlist" | "iceberg"` (default `"mindmap"`)
- `data.templateConfig`: objeto específico por template (tiers, níveis, cores)

Nenhuma migração de schema. Projetos antigos abrem como `mindmap` normalmente.

## Estrutura semântica dos nós

Cada template usa um "papel" (`role`) opcional no nó, além dos campos atuais:

```text
Tier List
├─ raiz (role: "board")
├─ tier S (role: "tier", tierColor, ordem)
│   ├─ item (role: "item", texto/imagem)
│   └─ item
├─ tier A ...

Iceberg
├─ raiz (role: "iceberg")
├─ nível 1 (role: "level", depth: 0, cor)
│   └─ item (role: "item", card expandido)
├─ nível 2 (role: "level", depth: 1)
└─ ...
```

Isso mantém compatibilidade total com o motor atual — o layout automático e o inspector apenas checam `role` para renderizar de forma diferente.

## Seletor de template

Novo botão no header do editor: **"Formato"** com três opções (Mapa mental / Tier List / Iceberg).

- Só aparece quando o projeto está **vazio ou recém-criado** (evita destruir grafos existentes).
- Ao trocar, o app popula um **template inicial** (raiz + estrutura mínima) e trava o `role` da raiz.
- Free vê os formatos mas com selo "Pro" e CTA para upgrade — mesmo padrão do Sonic Avatar.

## Tier List

**Editor:**
- Renderizador dedicado `TierListCanvas.tsx` (linhas horizontais fixas em vez do layout radial).
- Cada tier: label editável inline + color picker (paleta 10 cores já existente) + botão "adicionar tier" no fim.
- Itens: card compacto (nome opcional + imagem/emoji), arrastar entre tiers ou reordenar dentro do tier.
- Atalhos: `Enter` novo item no tier atual, `Tab` novo tier, `Del` remove.
- Padrão inicial: S / A / B / C / D com cores tier-list clássicas.

**Apresentação/gravação:**
- Câmera passeia tier por tier (topo → base) com o motor de câmera atual.
- Setinha `→` avança para o próximo tier; segundo `→` entra em modo item-por-item se o tier tiver itens marcados como destaque.
- Sonic Avatar e narração funcionam sem mudança.

## Iceberg

**Editor:**
- Renderizador `IcebergCanvas.tsx`: fundo dividido em faixas (céu → superfície → águas rasas → profundo → abissal), 3 ou 4 níveis configuráveis.
- Cada nível: label + cor de faixa (gradiente).
- Itens: círculos/cards pequenos posicionados livremente dentro da faixa do nível.
- Ao **clicar num item** no editor: abre um **modal de card expandido** para preencher título, texto longo, imagem, vídeo, link — reaproveita os componentes do inspector atual.
- Padrão inicial: 4 níveis com nomes editáveis ("Conhecido", "Menos conhecido", "Obscuro", "Proibido").

**Apresentação/gravação:**
- Câmera começa no topo do iceberg, desce nível por nível (`→` avança).
- Ao chegar num nível, `→` percorre itens; ao focar um item, faz **zoom cinematográfico** no card expandido (mesma animação que já usamos para nós grandes) e mostra o conteúdo em tela cheia — sem modal.
- `←` volta um passo (item → nível → cima).

## Gating Pro

- Bloqueio no seletor de template: usuários Free só criam `mindmap`. Ao clicar em Tier List/Iceberg abre modal de upgrade (o já existente).
- Enforcement no servidor: reforçamos a trigger `enforce_mindmap_freemium_limits` para rejeitar `data.template` diferente de `"mindmap"` quando o usuário não é Pro. Isso impede bypass via API.

## Reaproveitamento (sem retrabalho)

Continuam funcionando sem mudança:
- Sync Supabase (`mindmapSync.ts`)
- Gravação de tela (`screenRecorder.ts`) e regra 40% de vídeo
- Narração pré-gravada + Sonic Avatar
- Import/export JSON (adiciona `template` e `templateConfig` no payload)
- Temas claro/escuro
- Pastas em `projects.index.tsx`
- Miniatura do projeto (usa primeira imagem do primeiro item do grafo)

## Escopo desta entrega

1. Campo `template` + `templateConfig` no store + tipos TS
2. Seletor de formato no editor (com gate Pro)
3. `TierListCanvas.tsx` + drag entre tiers + apresentação por tier
4. `IcebergCanvas.tsx` + modal de card + zoom cinematográfico no item
5. Trigger Supabase reforçada para bloquear templates Pro no Free
6. Import/export atualizado

## Fora de escopo (pode virar próximo passo)

- Mais templates (fluxograma, timeline, matriz 2×2)
- Templates prontos com conteúdo de exemplo por tema
- Botão "converter mindmap existente em tier list"

Posso implementar tudo isso na sequência?
