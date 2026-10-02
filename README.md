# Gabriel Diniz

**Junior Software Developer · Building in Public**

Meu portfólio pessoal: uma capa direta, com fotografia, tipografia e movimento.

A base foi reconstruída com HTML semântico, um arquivo de estilos e dois scripts com responsabilidades separadas: `portrait-pan.js` controla a fotografia e `motion.js` cuida da entrada dos textos, do fundo e dos links. As regras antigas de componentes removidos e as animações CSS duplicadas foram eliminadas.

[**Visitar o portfólio**](https://gabbswq.github.io/) · [Perfil no GitHub](https://github.com/gabbswq) · [LinkedIn](https://www.linkedin.com/in/gabbswq)

## A experiência

- Layout responsivo para celular, tablet e desktop.
- Entrada coordenada dos textos e parallax do fundo durante a rolagem.
- Fotografia explorável movendo o mouse sobre a imagem, dentro de uma moldura fixa.
- A posição do mouse controla o enquadramento: a esquerda revela o começo da composição e a direita revela o final. Não exige clique, roda, foco ou ativação.
- No celular, arraste com um dedo dentro da foto; a pinça continua sendo do navegador. Fora da foto, a navegação permanece normal.
- A posição explorada é mantida ao soltar, sair com o ponteiro e redimensionar. **Home**, com foco de teclado na foto, recupera o enquadramento inicial.
- Setas, Home e foco visível para navegação por teclado, com descrição para leitores de tela. O mouse usa suavização discreta; com movimento reduzido, a resposta é imediata. O toque acompanha o dedo diretamente.

O conteúdo continua acessível sem JavaScript: a foto usa um recorte estático. A exploração da foto não depende do GSAP. Em telas nas quais a página inteira cabe, não há deslocamento de página para animar no fundo.

## Explorar a fotografia

O arquivo `hero.png` é a fotografia horizontal de 2048 × 1143 pixels, preservada sem alteração. A moldura atual é quase quadrada no desktop e quadrada no celular. Antes, `object-fit: cover` recortava a imagem dentro de um elemento do tamanho da moldura; ampliar ou transladar esse elemento com GSAP não tornava toda a composição alcançável. A inclinação também movimentava a moldura, não a janela de observação.

`portrait-pan.js` agora controla exclusivamente a posição e o tamanho renderizado da foto. A escala mínima é `max(larguraDaMoldura/larguraOriginal, alturaDaMoldura/alturaOriginal)`. A imagem inteira recebe essas dimensões, e os limites são a diferença entre imagem e moldura. Não há zoom extra, deformação, retorno automático ou espaço vazio nas bordas.

| Entrada | Comportamento |
| --- | --- |
| Mouse sobre a foto | A posição proporcional do ponteiro percorre todo o conteúdo escondido nos eixos disponíveis, sem botão pressionado |
| Um dedo ou caneta em contato | A imagem acompanha o deslocamento durante o mesmo gesto, sem ativação prévia |
| Roda e trackpad | Mantêm a rolagem normal da página; não há interceptação específica da foto |
| Pinça / Ctrl/Cmd + roda | Preservados para o navegador |
| Setas | Deslocam a janela de observação nos eixos disponíveis; Shift aumenta o passo |
| Home | Com foco de teclado na foto, volta à composição inicial, em 58% do espaço horizontal e 50% do vertical |

Nesta fotografia e nestas proporções de moldura, há normalmente apenas espaço horizontal para explorar. Suportar gestos diagonais não significa criar artificialmente uma segunda direção.

O hover usa as dimensões internas da moldura, descontando suas bordas. O deslocamento é a posição normalizada do ponteiro multiplicada pelo espaço disponível da imagem. A suavização termina nos limites exatos; sair da foto interrompe o movimento e preserva o último enquadramento. O tipo real do ponteiro determina a interação, então um mouse conectado a um computador com tela de toque continua usando hover. Mouse e toque não chamam foco programaticamente, e o cursor permanece normal.

No toque, `touch-action: pinch-zoom` fica restrito à foto. Um gesto de um dedo que começa nela é reservado à exploração até terminar, inclusive na borda; **não há promessa de transferência da mesma sequência de toque para a página**. Levante o dedo e arraste fora dela para navegar. O segundo dedo encerra o arraste da foto e deixa a pinça para o navegador. No celular em paisagem, a moldura deixa espaço adicional dos lados para navegar.

Referências: [Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events), [touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action) e [eventos de roda](https://developer.mozilla.org/en-US/docs/Web/API/Element/wheel_event).

## Tecnologias

| Tecnologia | Papel no projeto |
| --- | --- |
| HTML5 | Estrutura semântica e conteúdo |
| CSS3 | Grid, layout responsivo e estados de interação |
| JavaScript / Pointer Events | Geometria, hover do mouse, captura do toque e teclado da foto |
| ResizeObserver | Limites e posição proporcional após mudanças no tamanho da moldura |
| GSAP 3.12.5 | Entrada de conteúdo e interação dos links, sem controle da posição da foto |
| ScrollTrigger | Parallax do fundo e indicador de progresso da página |
| Playwright + node:test | Testes de navegador, somente no desenvolvimento |
| Manrope e Inter | Tipografia via Google Fonts, com fontes de sistema como alternativa |
| GitHub Pages | Publicação estática |

Ser estático não significa ser apenas HTML: CSS e JavaScript cuidam da responsividade e das interações. Visualizar e publicar o site não exige backend, framework, instalação de pacotes ou etapa de build. GSAP e ScrollTrigger são servidos junto com o site, sem depender de um CDN em tempo de execução. Os pacotes npm são opcionais e servem apenas para executar os testes.

## Abrir no VS Code

1. Abra a pasta deste repositório em **Arquivo > Abrir Pasta**.
2. Abra `index.html` diretamente no navegador. Isso já funciona.
3. Para atualizar automaticamente enquanto edita, use a extensão **Live Server** e a opção **Open with Live Server** em `index.html`.

Quem ainda não tem uma cópia pode executar:

```sh
git clone https://github.com/gabbswq/gabbswq.github.io.git
cd gabbswq.github.io
code .
```

Não são necessárias chaves, login ou variáveis de ambiente para visualizar a página.

## Onde editar

| Arquivo | Conteúdo |
| --- | --- |
| [`index.html`](index.html) | Estrutura, textos e links |
| [`styles.css`](styles.css) | Layout responsivo, tipografia e estados de interação |
| [`motion.js`](motion.js) | Animações e adaptação à preferência de movimento reduzido |
| [`portrait-pan.js`](portrait-pan.js) | Dono exclusivo da geometria e da posição da fotografia |
| [`tests/portrait-pan.test.cjs`](tests/portrait-pan.test.cjs) | Verificações de interação, limites, responsividade e capturas |
| [`vendor/`](vendor/) | Bibliotecas locais e avisos de licença |
| `hero.png` | Fotografia principal |
| `hero-bg-final.png` | Fundo usado na página |
| `hero-bg.png` | Versão original do fundo |
| `.nojekyll` | Publicação direta, sem processamento Jekyll |

## Conferir uma alteração

- Testar celular e desktop sem rolagem horizontal ou sobreposição.
- Em uma página recém-aberta, mover o mouse da esquerda para a direita sobre a foto com nenhum botão pressionado e alcançar os dois lados da composição, sem bordas vazias.
- Conferir que a roda rola a página mesmo sobre a foto; iniciar o arraste móvel com o primeiro toque, sem ativação.
- Conferir que não há botão, instrução visível, gradiente sobre a foto ou brilho ao passar o cursor.
- Conferir que sair com o ponteiro preserva a posição e que Home a restaura quando acionado pelo teclado.
- Testar teclado, perda de foco, cancelamento do gesto, redimensionamento e rotação do celular.
- Conferir rolagem fora da foto e pinça do navegador no celular; não esperar transferência de toque no meio do gesto.
- Testar a suavização do mouse e a resposta imediata com movimento reduzido; as entradas, o fundo e os links não recebem movimento decorativo nessa preferência.
- Preferências de pausa salvas por versões anteriores não são mais consultadas.
- Conferir os links sociais e a página com JavaScript desabilitado.

### Testes automatizados

Com Node.js e npm disponíveis, execute cada comando separadamente:

```sh
npm ci
npx playwright install chromium
npm test
```

O teste abre e fecha um servidor local temporário. As capturas ficam em `test-results/`, fora do Git. Para usar Chrome instalado, defina `PLAYWRIGHT_CHANNEL=chrome`. Para outro motor instalado pelo Playwright, use `PLAYWRIGHT_BROWSER=webkit` ou `firefox`, sem definir o canal. No PowerShell, variáveis usam a forma `$env:PLAYWRIGHT_CHANNEL='chrome'`.

O ensaio de um dedo, cancelamento e pinça usa eventos de toque do protocolo do Chromium em emulação móvel. O hover é testado com movimentos reais do mouse no navegador automatizado e zero botões pressionados, sem clique ou roda prévios; as capturas dos extremos precisam mostrar imagens diferentes. Deltas de trackpad são programáticos. Os demais testes cobrem roda livre, teclado, limites, bordas da moldura, redimensionamento, carregamento tardio, preferência de movimento e fallback. Em outros motores os casos de toque CDP são explicitamente ignorados. Um teste em iPhone/Android físico continua necessário antes de afirmar validação nesses dispositivos.

Para alterações nos scripts, atualize também suas versões nas URLs em `index.html`, evitando servir cópias antigas. A publicação é feita pelo GitHub Pages; uma mudança no repositório só chega ao site após o deploy.

## Contato e créditos

[X](https://x.com/gabbsweb3) · [LinkedIn](https://www.linkedin.com/in/gabbswq) · [E-mail](mailto:gabbsdiniz@proton.me)

Os avisos das bibliotecas e dos ícones estão em [`vendor/`](vendor/). As licenças de terceiros se aplicam aos respectivos componentes.

© 2026 Gabriel Diniz. Todos os direitos reservados.
