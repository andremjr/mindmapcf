import type { BlockType } from "./types";

export const TRIGGERS: Record<Exclude<BlockType, "main_idea" | "detail">, string[]> = {
  intro: ["hoje", "nesse vídeo", "neste vídeo", "vou explicar", "entenda", "vamos falar"],
  contrast: ["mas", "porém", "só que", "no entanto", "entretanto", "contudo"],
  problem: ["problema", "erro", "falha", "risco", "dificuldade", "obstáculo"],
  solution: ["solução", "caminho", "estratégia", "como resolver", "resolve", "resposta"],
  example: ["por exemplo", "imagine", "na prática", "exemplo", "suponha"],
  conclusion: ["conclusão", "resumindo", "por isso", "então", "portanto", "no fim"],
  warning: ["cuidado", "atenção", "perigo", "aviso", "alerta"],
};

export const STOPWORDS_PT = new Set([
  "a","o","os","as","de","do","da","dos","das","um","uma","uns","umas",
  "e","ou","mas","que","se","na","no","nas","nos","em","por","para","pelo",
  "pela","com","sem","sobre","ao","aos","à","às","já","ainda","muito","mais",
  "menos","muita","muitos","muitas","ser","estar","é","são","era","foi","ter",
  "tem","têm","eu","você","ele","ela","nós","eles","elas","meu","minha","seu",
  "sua","isso","isto","aquilo","esse","essa","este","esta","aquele","aquela",
  "como","quando","onde","porque","qual","quais","então","assim","só","bem",
  "lá","aqui","ali","aí","vai","vou","vamos","tá","tô","né","pra","pro",
]);
