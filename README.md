# Fadagotchi

Bichinho virtual no estilo Tamagotchi: uma fada (pixie) que precisa de comida, carinho, diversão, banheiro, banho, sono e poção quando adoece.

## Como jogar

Jogue em **https://lyraleo23.github.io/fadagotchi/** ou abra `index.html` por um servidor local (`python3 -m http.server`). Não precisa de build nem dependências.

## Instalar no celular

O Fadagotchi é um app instalável (PWA): ícone na tela inicial, tela cheia e funciona sem internet.

- **Android (Chrome):** abra o link e toque em **Instalar app** (ou menu ⋮ → Instalar app). Também tem o botão em Ajustes → App.
- **iPhone/iPad (Safari):** abra o link, toque em **Compartilhar** → **Adicionar à Tela de Início**.

Quando sai versão nova, aparece a barra **Nova versão disponível → Atualizar**.

### Levar a fada para outro aparelho

O progresso fica guardado no aparelho. Em **Backup da fada**: **Copiar código** num aparelho e **Importar** no outro (ou baixe/escolha o arquivo `.json`). Ela vive o tempo da "viagem" ao chegar.

- **◀ ▶** escolhem (ícone, comida, página de status, lado no minijogo) · **✓** confirma · **✕** cancela/volta (ou toque direto nos ícones)
- Toque na fada pra ela dar uma pirueta ou rir de cócegas
- Teclado: `←` `→`, `Enter`/`Espaço` confirma, `Esc`/`Backspace` cancela
- O relógio da fada é o relógio do seu aparelho. O tempo passa de verdade, inclusive com a aba no fundo, o celular bloqueado ou a página fechada (até 3 dias são simulados de uma vez). O progresso fica salvo no `localStorage` do navegador.
- As velocidades de teste adiantam o relógio; ao voltar para 1× ele volta ao horário real.
- Em **Ajustes** dá pra acelerar o tempo (até 600×) e trocar o visual entre **Ilustrado** (padrão), **Suave**, **Pixel art** e **Clássico (LCD)**.

## Acessórios

Cada hora em que ela fica bem cuidada (nenhuma necessidade pendente, ou dormindo de luz apagada) soma **brilho de cuidado**. Nos marcos ela ganha um acessório, que já vem vestido; dá pra tirar e pôr na ficha.

| Acessório | Lugar | Horas bem cuidada |
|---|---|---|
| Laço de fita | cabeça | 3 |
| Colar de orvalho | pescoço | 8 |
| Coroa de flores | cabeça | 16 |
| Capa de pétalas | costas | 30 |
| Tiara de estrela | cabeça | 50 |
| Asas cintilantes | asas | 80 |

Contrato com os renderers: `state.wear` = `{ head, neck, back, aura }` com o `id` do acessório. A arte é de cada renderer.

## Ciclo de vida

Cada botão de flor já vem com uma aparência sorteada (a cor do botão é a do cabelo). Dá pra trocar tudo em **Aparência**, na ficha.


Botão de flor → abre em 30 s → fadinha bebê → fada adulta com 24 h. Dorme das 22h às 7h. De dia ela pode cochilar (luz apagada ou exausta); acender a luz acorda.

## Estrutura

```
index.html              marcação + carrega os scripts em ordem
css/style.css           estilos
js/version.js           versão do app
js/sprites.js           pixel art do visual LCD
js/core.js              simulação (fome, sono, saúde, acessórios…)
js/looks.js             aparências
js/accessories.js       acessórios
js/world.js             mapa do cenário
js/behavior.js          gestos → Pose
js/faces.js             expressão final e páginas de status
js/renderers/illustrated.js visual Ilustrado (padrão)
js/renderers/smooth.js  visual Suave (também fornece itens e telas de Status/Comida ao Ilustrado)
js/renderers/pixel.js   visual Pixel art
js/renderers/lcd.js     visual Clássico (LCD)
js/backup.js            exportar/importar
js/app.js               PWA (service worker, instalação, atualização)
js/ui.js                botões, ficha, salvamento e loop
sw.js                   service worker (cache offline)
manifest.webmanifest    manifesto do app
icons/                  ícones gerados a partir da fada
tools/build_artifact.py gera a versão de arquivo único usada no Claude
```

### Publicar uma versão nova

1. Suba a versão em `js/version.js` **e** em `sw.js` (precisam ser iguais).
2. Se criar arquivo novo em `js/`, coloque no `index.html` e na lista `ASSETS` do `sw.js`.
3. `git push` — o GitHub Pages publica e o app instalado mostra **Atualizar**.
4. Para o Claude: `python3 tools/build_artifact.py saida.html` gera o arquivo único.

## Arquitetura

```
Core (simulação) ──> Behavior (gestos) ──> Pose ──> Renderer (desenho)
                         ▲                              ▲
                         └────────── World (mapa) ──────┘
```

1. **Sprites**: pixel art monocromática (LCD).
2. **Looks**: aparência da fada em 5 partes (cabelo, pele, olhos, vestido, asas). Cada opção tem um **nome** (o contrato) e uma paleta padrão; um renderer novo pode usar só os nomes e trazer a própria arte. Fica salva em `state.look`.
3. **Core**: estado e regras da simulação (`Core.stepMinute`, `needs`, `mood`). Não sabe nada de tela.
4. **World**: mapa do cenário em coordenadas normalizadas (x 0..1, y 0..1): casinha, flores, borboletas, vaga-lumes e a área livre de voo. O Behavior usa o mapa pra saber aonde ir; os renderers desenham tudo nos mesmos lugares.
5. **Behavior**: decide o que a fada está fazendo agora (passear, acenar, pirueta, bocejo, cochilo, fome, tédio, ir dormir na casinha, espreguiçar, cheirar flores, perseguir borboletas, brincar com vaga-lumes) e entrega uma **Pose** a cada frame.
6. **Renderers**: `IllustratedRenderer` (ilustração com luz da cena, fundo desfocado, brilhos e rosto mais realista, padrão), `SmoothRenderer` (vetorial com curvas e gradientes), `ColorRenderer` (pixel art 192×120) e `LcdRenderer` (48×32). Todos desenham o mesmo mundo de 192×120 unidades a partir das Poses, do World, dos Looks e de `state.wear`.
7. **UI**: botões, ficha da fada, persistência.

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
- [x] v0.6: aparência sorteada ao nascer (8 cabelos, 5 tons de pele, 5 olhos, 6 vestidos, 5 asas) e editável na ficha
- [x] v0.7: acessórios ganhos com bom cuidado (laço, colar, coroa, capa, tiara, asas cintilantes)
- [x] v0.8: controles com 4 botões (◀ ▶ ✓ ✕)
- [x] v0.9: visual Suave (vetorial, alta resolução) como padrão
- [x] v1.0: app instalável (PWA), offline, aviso de atualização, backup da fada, código dividido em arquivos
- [x] v1.1: visual Ilustrado; resolução do canvas adaptada à tela
- [ ] Avisos no celular quando ela precisar de cuidado
- [ ] Gráficos realistas

## Publicação

- **App / GitHub Pages:** https://lyraleo23.github.io/fadagotchi/ (Settings → Pages → Deploy from a branch → `main` / root).
- **Artifact no Claude:** arquivo único gerado por `tools/build_artifact.py` (sem manifesto nem service worker; o Claude coloca o esqueleto HTML).
