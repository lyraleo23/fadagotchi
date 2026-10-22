# Fadagotchi

Bichinho virtual no estilo Tamagotchi: uma fada (pixie) que precisa de comida, carinho, diversão, banheiro, banho, sono e poção quando adoece.

## Como jogar

Abra `index.html` no navegador. Não precisa de build nem dependências.

- **A** escolhe o ícone · **B** confirma · **C** volta (ou toque direto nos ícones)
- Toque na fada pra ela dar uma pirueta ou rir de cócegas
- Teclado: `A`/`←`, `B`/`Enter`, `C`/`Esc`/`→`
- O tempo passa em tempo real, inclusive com a página fechada (até 3 dias). O progresso fica salvo no `localStorage` do navegador.
- Em **Ajustes** dá pra acelerar o tempo (até 600×) e trocar o visual entre **Colorido** e **Clássico (LCD)**.

## Ciclo de vida

Botão de flor → abre em 30 s → fadinha bebê → fada adulta com 24 h. Dorme das 22h às 7h.

## Arquitetura (`index.html`)

```
Core (simulação) ──> Behavior (gestos) ──> Pose ──> Renderer (desenho)
                         ▲                              ▲
                         └────────── World (mapa) ──────┘
```

1. **Sprites**: pixel art monocromática (LCD).
2. **Core**: estado e regras da simulação (`Core.stepMinute`, `needs`, `mood`). Não sabe nada de tela.
3. **World**: mapa do cenário em coordenadas normalizadas (x 0..1, y 0..1): casinha, flores, borboletas, vaga-lumes e a área livre de voo. O Behavior usa o mapa pra saber aonde ir; os renderers desenham tudo nos mesmos lugares.
4. **Behavior**: decide o que a fada está fazendo agora (passear, acenar, pirueta, bocejo, cochilo, fome, tédio, ir dormir na casinha, espreguiçar, cheirar flores, perseguir borboletas, brincar com vaga-lumes) e entrega uma **Pose** a cada frame.
5. **Renderers**: `LcdRenderer` (48×32) e `ColorRenderer` (192×120, desenho procedural com sombreamento). Só desenham Poses.
6. **UI**: botões, ficha da fada, persistência.

### Contrato do renderer

Um renderer novo (sprites desenhados à mão, 3D, visual realista…) só precisa implementar:

```js
{
  init(canvas),                 // prepara o canvas
  draw(state, ui, now, pose),   // desenha um frame
}
```

e registrar-se em `setSkin()`. A `Pose` é:

| Campo | Valores | Significado |
|---|---|---|
| `x` | 0..1 | posição horizontal no palco (coordenadas do World) |
| `facing` | -1..1 | -1 olhando p/ esquerda, 0 de frente, 1 p/ direita |
| `lift` | px | sobe (+) ou desce (−) em relação à altura normal |
| `sleepP` | 0..1 | 0 acordada, 1 dormindo (transição suave) |
| `hidden` | bool | está dentro da casinha |
| `door` | 0..1 | porta da casinha aberta |
| `focus` | `{kind, x, i}` | o que ela está olhando: `flower`, `butterfly`, `fireflies` |
| `wing` | rad | fase da batida de asas |
| `face` | `happy` `neutral` `sad` `sleep` `yawn` `tired` `bored` | expressão pedida pelo gesto |
| `armL` | `down` `wave` `up` `belly` `mouth` | braço livre |
| `armR` | `wand` `up` | braço da varinha |
| `nod` `kick` `shake` `trail` | — | cabeceada, chutinho, tremida, rastro de brilho |
| `action`, `p` | nome, 0..1 | gesto atual e progresso |

A expressão final vem de `faceFor(state, anim, pose)`: animações de ação (comer, carinho…) têm prioridade, depois o gesto, depois o humor.

## Roadmap

- [x] v0.1: versão LCD clássica
- [x] v0.2: visual colorido, faixa com o nome da seção, tela maior
- [x] v0.3: visual HD (192×120), sombreamento, cenário animado, nascimento em 30 s
- [x] v0.4: camada Behavior + Pose, gestos (aceno, pirueta, bocejo, cochilo, fome, tédio, adormecer, espreguiçar), fada vira de lado, toque na fada
- [x] v0.5: World (mapa do cenário); dorme dentro da casinha (janela acesa/apagada), cheira flores, persegue borboletas, brinca com vaga-lumes
- [ ] Personalização da fada ao nascer
- [ ] Gráficos realistas

## Publicação

- **GitHub Pages:** https://lyraleo23.github.io/fadagotchi/ (Settings → Pages → Deploy from a branch → `main` / root).
- **Artifact no Claude:** o artifact recebe só o conteúdo de dentro do `<body>` mais `<title>`/`<style>` (o Claude adiciona o esqueleto HTML na publicação).
