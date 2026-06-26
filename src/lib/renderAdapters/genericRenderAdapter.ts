import type { RenderAdapter } from "./index";

/**
 * genericRenderAdapter — pass-through. Útil para qualquer renderizador
 * customizado que prefira consumir o schema canônico do Canvas Narrativo.
 */
export const genericRenderAdapter: RenderAdapter = {
  id: "generic",
  name: "Generic",
  transform: (x) => x,
};
