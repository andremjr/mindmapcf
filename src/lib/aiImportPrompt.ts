// Prompt template users can paste into any AI (ChatGPT, Claude, Gemini, etc.)
// to generate a mind map compatible with Canvas Narrativo's importer.
//
// The importer accepts Markdown (headings + indented bullets) or JSON.
// We recommend Markdown because it is the most universal format and every
// LLM produces it cleanly.

export const AI_IMPORT_PROMPT = `Você vai gerar um MAPA MENTAL para o aplicativo "Canvas Narrativo".

REGRAS DO FORMATO (obrigatório seguir):
- Responda APENAS com o mapa mental em Markdown, sem explicação, sem \`\`\`code fences\`\`\`, sem texto antes ou depois.
- A primeira linha deve ser o título do mapa começando com "# " (uma única linha com "#").
- Cada ramo principal usa "## Título do ramo".
- Sub-ramos usam listas com hífen ("- item"), aumentando 2 espaços de indentação a cada nível.
- Cada item deve ser CURTO: uma frase ou palavra-chave (idealmente até 60 caracteres). Não escreva parágrafos.
- Não use negrito, itálico, links, imagens, emojis, numeração ("1.", "2.") nem checkboxes ("[ ]").
- Profundidade máxima recomendada: 4 níveis (título + 3 níveis de sub-itens).
- Não inclua nada fora dessa estrutura.

EXEMPLO DO FORMATO ESPERADO:

# Tema principal
## Primeiro ramo
- Ideia 1
  - Detalhe 1a
  - Detalhe 1b
- Ideia 2
## Segundo ramo
- Ideia 3
  - Detalhe 3a
    - Sub-detalhe

TEMA DO MAPA MENTAL:
<escreva aqui o tema que você quer que a IA desenvolva>
`;
