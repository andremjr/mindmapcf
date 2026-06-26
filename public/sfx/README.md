# SFX públicos — Canvas Narrativo

Esta pasta hospeda os arquivos de efeito sonoro reais usados pelo app.
Tudo precisa ter **licença permissiva e verificável**.

## Como adicionar um novo SFX

1. Baixe um arquivo (.mp3 ou .ogg) de uma fonte com licença CC0, CC-BY, MIT ou Apache.
   Boas opções:
   - https://kenney.nl/assets (CC0)
   - https://freesound.org (filtre por CC0/CC-BY — verifique a licença individual)
   - https://opengameart.org (CC0/CC-BY)
   - https://mixkit.co/free-sound-effects/
2. Coloque em `public/sfx/<kind>/<nome>.mp3`.
3. Registre o asset em `src/lib/sfxAssets.ts` preenchendo TODOS os campos:
   `id, name, kind, file, origin: "public", license, author, sourceUrl, attributionRequired`.
4. Se `attributionRequired = true`, lembre de exibir o crédito no rodapé do
   vídeo exportado ou na descrição.

## O que NÃO usar

- Sons sem licença explícita
- Sons protegidos por direitos autorais (música de filme, jogo, série…)
- Sons pagos sem comprovar a compra
- Qualquer asset de origem duvidosa

## Estado atual

Por padrão o app usa SFX sintetizados via Web Audio API (`synth:*`).
Eles são 100% livres de licença e servem como placeholder pronto para
ser substituído por arquivos reais de bibliotecas públicas.
