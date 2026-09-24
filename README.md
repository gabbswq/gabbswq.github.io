# Gabriel Diniz

**Junior Software Developer · Building in Public**

Meu portfólio pessoal: uma capa direta, com fotografia, tipografia e movimento.

[**Visitar o portfólio**](https://gabbswq.github.io/) · [Perfil no GitHub](https://github.com/gabbswq) · [LinkedIn](https://www.linkedin.com/in/gabbswq)

## A experiência

- Layout responsivo para celular, tablet e desktop.
- Entrada coordenada dos elementos, parallax da fotografia e do fundo durante a rolagem.
- Inclinação suave da foto ao mover o mouse, inclusive em computadores com tela sensível ao toque.
- Movimento automático ao passar o mouse sobre a foto, sem botão ou ativação manual.
- Navegação por teclado, foco visível e respeito à preferência do sistema por movimento reduzido.

O conteúdo continua acessível se o JavaScript ou a biblioteca de animação não carregar. Em telas nas quais a página inteira cabe sem rolagem, não há deslocamento de scroll para animar. No celular, a foto acompanha a rolagem; a inclinação é exclusiva do mouse.

## Tecnologias

| Tecnologia | Papel no projeto |
| --- | --- |
| HTML5 | Estrutura semântica e conteúdo |
| CSS3 | Grid, layout responsivo e estados de interação |
| JavaScript | Preferências e eventos de mouse, teclado e página |
| GSAP 3.12.5 | Timelines, interpolação e inclinação da foto |
| ScrollTrigger | Parallax ajustado à rolagem disponível |
| Manrope e Inter | Tipografia via Google Fonts, com fontes de sistema como alternativa |
| GitHub Pages | Publicação estática |

Ser estático não significa ser apenas HTML: CSS e JavaScript cuidam da responsividade e das interações. O projeto não exige backend, framework, instalação de pacotes ou etapa de build. GSAP e ScrollTrigger são servidos junto com o site, sem depender de um CDN em tempo de execução.

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
| [`index.html`](index.html) | Textos, links e estilos responsivos |
| [`motion.js`](motion.js) | Animações e adaptação à preferência de movimento reduzido |
| [`vendor/`](vendor/) | Bibliotecas locais e avisos de licença |
| `hero.png` | Fotografia principal |
| `hero-bg-final.png` | Fundo usado na página |
| `hero-bg.png` | Versão original do fundo |
| `.nojekyll` | Publicação direta, sem processamento Jekyll |

## Conferir uma alteração

- Testar celular e desktop sem rolagem horizontal ou sobreposição.
- Mover o mouse sobre a foto e rolar a página quando houver espaço para rolagem.
- Conferir que a foto reage ao mouse sem clicar e retorna ao repouso ao retirar o ponteiro.
- Testar com movimento reduzido no sistema: as animações ficam desativadas, inclusive se a preferência mudar com a página aberta.
- Preferências de pausa salvas por versões anteriores não são mais consultadas.
- Conferir os links sociais e a página com JavaScript desabilitado.

Para alterações em `motion.js`, atualize também sua versão na URL do script em `index.html`, evitando servir uma cópia antiga do navegador. A publicação é feita pelo GitHub Pages; uma mudança no repositório só chega ao site após a conclusão do deploy.

## Contato e créditos

[X](https://x.com/gabbsweb3) · [LinkedIn](https://www.linkedin.com/in/gabbswq) · [E-mail](mailto:gabbsdiniz@proton.me)

Os avisos das bibliotecas e dos ícones estão em [`vendor/`](vendor/). As licenças de terceiros se aplicam aos respectivos componentes.

© 2026 Gabriel Diniz. Todos os direitos reservados.
