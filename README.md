# Fadagotchi

Bichinho virtual no estilo Tamagotchi: uma fada (pixie) que precisa de comida, carinho, diversão, banheiro, banho, sono e poção quando adoece.

## Como jogar

Abra `index.html` no navegador. Não precisa de build nem dependências.

- **A** escolhe o ícone · **B** confirma · **C** volta (ou toque direto nos ícones)
- Teclado: `A`/`←`, `B`/`Enter`, `C`/`Esc`/`→`
- O tempo passa em tempo real, inclusive com a página fechada (até 3 dias). O progresso fica salvo no `localStorage` do navegador.
- Em **Ajustes** dá pra acelerar o tempo (até 600×) e trocar o visual entre **Colorido** e **Clássico (LCD)**.

## Ciclo de vida

Botão de flor → abre em ~2 min → fadinha bebê → fada adulta com 24 h. Dorme das 22h às 7h.

## Arquitetura (`index.html`)

1. **Sprites**: pixel art monocromática (LCD) e itens coloridos.
2. **Core**: estado e regras da simulação (`Core.stepMinute`, `needs`, `mood`). Não sabe nada de tela.
3. **Renderers**: `LcdRenderer` (48×32) e `ColorRenderer` (128×80, fada desenhada proceduralmente). Interface comum `init(canvas)` + `draw(state, ui, now)`. Um futuro renderer realista entra aqui sem mexer no Core.
4. **UI**: botões, ficha da fada, persistência.

## Roadmap

- [x] v0.1: versão LCD clássica
- [x] v0.2: visual colorido, faixa com o nome da seção, tela maior
- [ ] Mais personalidade (animações de tédio, fome etc.)
- [ ] Personalização da fada ao nascer
- [ ] Gráficos realistas

## Publicação

- **GitHub Pages:** https://lyraleo23.github.io/fadagotchi/ (Settings → Pages → Deploy from a branch → `main` / root).
- **Artifact no Claude:** o artifact recebe só o conteúdo de dentro do `<body>` mais `<title>`/`<style>` (o Claude adiciona o esqueleto HTML na publicação).
