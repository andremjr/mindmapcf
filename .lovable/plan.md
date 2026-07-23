# Chaveamento estilo Copa do Mundo

Refatoração do formato Chaveamento em três frentes: layout bracket duplo, editor de vencedores por confronto e apresentação animada com avanço rodada a rodada.

## 1. Layout de dois lados (bracket estilo Copa do Mundo)

Substituir o layout atual (todas as rodadas em colunas da esquerda para a direita) por bracket duplo simétrico:

```text
Esq R1   Esq R2   Esq SF     FINAL     Dir SF   Dir R2   Dir R1
[A vs B] ─┐                                              ┌─ [G vs H]
          ├─ [W]─┐                              ┌─[W] ─┤
[C vs D] ─┘      ├─ [SF-E]─┐        ┌─[SF-D]─┤       [E vs F]
[...]            │         [CHAMPION]         │       [...]
```

- Competidores dividem-se ao meio: primeiros N/2 vão para o lado esquerdo, restantes para o direito (mesmo seeding atual, apenas separado).
- Colunas da esquerda avançam da esquerda para o centro; colunas da direita avançam da direita para o centro; troféu/campeão no meio.
- Mantém suporte a BYE quando o número de competidores não é potência de 2.

## 2. Editor: definir vencedores previamente

No `BracketEditor`, adicionar uma seção "Definir vencedores" abaixo da lista de competidores:

- Renderiza o mesmo bracket duplo em modo leitura.
- Em cada confronto ativo (com ambos slots preenchidos), o usuário clica em um dos dois cards para marcá-lo como vencedor. O vencedor sobe para o próximo confronto e o botão do próximo confronto fica clicável.
- Mudar um vencedor em rodada anterior invalida (limpa) os vencedores das rodadas seguintes que dependiam dele.
- Botão "Resetar vencedores" continua no header.
- O resultado é persistido em `root.body` como JSON `{ "r{round}i{idx}": nodeId }` (formato atual mantido).

## 3. Apresentação animada

Sequência de navegação com setas (funciona igual em Apresentar e Gravar):

1. **Passo 0**: todos os competidores em fila embaixo da tela (grade horizontal, ordem = seeding).
2. **Passo 1**: competidores voam para seus slots iniciais dos dois lados (rodada 1 vazia com nomes).
3. **Passo 2..N**: cada seta revela o próximo confronto na ordem: R1 esq #1, R1 dir #1, R1 esq #2, R1 dir #2, ..., SF esq, SF dir, Final. Cada revelação:
   - Destaca o confronto atual (glow âmbar).
   - Após uma pausa curta, o vencedor pré-definido no editor "vence": card do perdedor esmaece, card do vencedor pulsa em verde e sobe animando para o slot da próxima rodada.
4. **Passo final**: card do campeão amplia no centro com brilho dourado.

Se um confronto não tem vencedor definido no editor, ele é pulado (sem animação de vitória) e o slot da próxima rodada fica marcado como "?".

Animações via `framer-motion` (já instalado) com `layoutId` para transições suaves entre a fila inicial, os slots de rodada e o troféu.

## Detalhes técnicos

### Estrutura de dados
- `MindNode` do root do bracket continua guardando o mapa de vencedores em `body` (JSON).
- Chaves de match reformuladas para incluir lado: `L-r{round}i{idx}` e `R-r{round}i{idx}` para os dois brackets; `FINAL` para o confronto central.

### Ordem de navegação
- Array plano `navSteps` construído em `useMemo`:
  ```
  ['pool', 'seat',
   'L-r0i0', 'R-r0i0', 'L-r0i1', 'R-r0i1', ...,
   'L-r1i0', 'R-r1i0', ...,
   'FINAL', 'CHAMPION']
  ```
- Cada step avança 1 na navegação. Confrontos com BYE são pulados automaticamente.

### Componentes tocados
- `src/components/bracket/BracketPresentation.tsx`: reescrita para bracket duplo + engine de steps + animações framer-motion.
- `src/components/bracket/BracketEditor.tsx`: adicionar painel "Bracket" abaixo dos competidores reutilizando um novo componente compartilhado `BracketBoard.tsx` com prop `mode: "edit" | "present"`.
- Novo: `src/components/bracket/BracketBoard.tsx` — renderização do bracket duplo (usado por editor e apresentação), recebendo `winners`, `revealedMatches`, `currentMatchKey`, `onPickWinner?`.
- Nenhuma migração de banco necessária; o schema JSON no `body` do root permanece compatível (chaves antigas serão ignoradas ao migrar; usuário clica Resetar se preferir recomeçar).

## Fora do escopo
- Não estamos mudando outros formatos.
- Sem placar/pontuação; só quem vence.
- Sem repescagem / chave da perdedores.
