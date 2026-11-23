# LaTeX Anywhere

Extensão para Google Chrome (Manifest V3) que adiciona um editor e uma pré-visualização LaTeX a campos de texto em sites compatíveis, incluindo `textarea` e `contenteditable`.

**Versão atual: 1.10.4.** Primeira versão no repositório: 1.10.0.

## Instalação em modo desenvolvedor

1. Abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta **`extension/`** deste repositório.
5. Atualize as abas em que deseja usar a extensão.

> Se a extensão já está instalada, mantenha a mesma pasta no Chrome para preservar o identificador e as preferências; atualize os arquivos e use **Recarregar** em `chrome://extensions`.

## Recursos

- Renderização de Markdown: títulos, ênfase, listas, tabelas, citações, links e blocos de código, mantendo o Markdown original ao aplicar.
- Barra independente de **atalhos Markdown**, posicionada entre os atalhos LaTeX e a formatação matemática; disponível na prévia, no editor principal e no editor separado. Oferece títulos, negrito, itálico, riscado, link, listas, citação, código, tabela e linha horizontal.
- Suporte a `\boxed{...}` na prévia matemática e como atalho na paleta de estruturas.
- Prévia renderizada de expressões entre `\(...\)`, `\[...\]`, `$$...$$` e ambientes AMS compatíveis.
- Prévia e editores móveis/redimensionáveis com opção de sincronizar ou aplicar manualmente.
- Edição inline ou separada de fórmulas, incluindo ambientes multilinha.
- Barra de formatação e catálogo de símbolos LaTeX com busca e categorias.
- Atalhos de inserção e teclas configuráveis por site; `Ctrl+B`, `Ctrl+I`, `Ctrl+U` fixos nos editores da extensão.
- Menu de contexto dos símbolos: **Copiar LaTeX** e **Definir tecla de atalho**.
- Zoom independente nas visualizações e modo de minimizar a barra.
- Ocultação e minimização com escopos independentes: nesta aba, neste domínio ou em todos os sites; recuperação pelo ícone do Chrome.

## Ocultar e reativar

Clique em **Ocultar** ou **Minimizar** na barra principal. Ambos oferecem **Nesta aba**, **Neste domínio** e **Em todos os sites**.

A escolha **Nesta aba** sobrevive ao refresh, mas é eliminada quando a aba é fechada. Escolhas por domínio e globais sobrevivem a refresh e reinicialização do Chrome. **Ocultar tem prioridade sobre Minimizar.** O botão **Maximizar** elimina os escopos de minimização ativos, sem reativar nenhuma ocultação.

Na barra **Ocultar** você pode escolher:

- **Ocultar nesta aba:** a extensão deixa de aparecer apenas na aba atual, inclusive depois de recarregar, até fechar a aba.
- **Ocultar neste domínio:** a extensão deixa de aparecer no domínio atual,
  incluindo após atualizar a página ou fechar e reabrir o Chrome.
- **Ocultar em todos os sites:** oculta a extensão em qualquer aba/site;
  essa escolha tem prioridade sobre as configurações de cada domínio.

Para reativar, **clique no ícone da extensão na barra do Chrome**. O painel
permite controlar separadamente os três níveis de ocultação e os três níveis de minimização. Também é possível usar
**`Alt+Shift+L`**: com ocultação global ativa, ele a desativa; caso contrário,
reativa a ocultação do domínio ou da aba conforme necessário; sem bloqueio, oculta o domínio atual. O atalho pode ser ajustado em
`chrome://extensions/shortcuts`.

As escolhas de domínio e globais são armazenadas em `chrome.storage.local`; as escolhas da aba usam `chrome.storage.session`, independentemente do
texto das mensagens. O menu Ocultar não apaga os rascunhos abertos numa aba,
mas eles não são guardados para restaurar após fechar essa aba.

Documentação adicional: [visibilidade e minimização por escopo](docs/VISIBILIDADE-E-MINIMIZACAO.md).

## Estrutura

- `extension/` — código da extensão, ícones, manifesto e bibliotecas locais.
- `docs/` — documentação da versão importada e capturas.
- `tests/` — página local simples para experimentar a extensão.

## Atalhos Markdown

A barra **Markdown:** aparece entre os atalhos LaTeX e a barra matemática na pré-visualização. Também está disponível nos editores de texto. Trabalha com o texto-fonte original, respeita a seleção e preserva o cursor. Veja [a lista de ações e exemplos](docs/MARKDOWN-SHORTCUTS.md).

## Tecnologia e limitações

O código inclui uma versão local do **KaTeX** para renderização matemática e uma cópia do **Marked 4.0.19** para leitura do Markdown. Ambos são distribuídos sob licença MIT, com os avisos correspondentes em `extension/vendor/LICENCA-KATEX.txt` e `extension/vendor/LICENCA-MARKED.txt`.

[Consulte a documentação de Markdown, segurança e limitações](docs/MARKDOWN.md).

O processamento das mensagens ocorre no navegador. Preferências de interface e atalhos são salvas localmente por site. O recurso de sincronização automática com editores complexos (como o ProseMirror do ChatGPT) tem limitações e deve ser validado no navegador antes de seu uso em mensagens importantes.

Os testes anteriormente registrados foram executados em páginas simuladas no Chromium; eles não demonstram compatibilidade universal com todos os editores ou com a interface atual do ChatGPT.

## Desenvolvimento

Após editar `extension/`, clique em **Recarregar** na página de extensões e atualize o site de teste. Para futuras versões, registre mudanças como novos commits, mantendo a mesma estrutura do repositório.

## Releases and version history

The first version published to this repository is **v1.10.0**; the current development version is **v1.10.4**. See
[CHANGELOG.md](CHANGELOG.md) for the version history. Each subsequent change
should update `extension/manifest.json`, the changelog, and the corresponding
Git commit. The extension is intended for a future free Chrome Web Store
release; the current repository version should not be treated as a published
store release.

## Author and license

**Created and maintained by Patrick Eduardo Scuracchio**
([@eupecric](https://github.com/eupecric)).

Copyright © 2026 Patrick Eduardo Scuracchio.

LaTeX Anywhere's original code is distributed under the
[Apache License, Version 2.0](LICENSE). You may use, modify and distribute it
under the license conditions, including the requirements to retain the
applicable copyright and attribution notices and indicate changed files.
See [NOTICE](NOTICE) for the project's original authorship notice.

Third-party KaTeX and Marked components are licensed separately under MIT. Their notices
are preserved at `extension/vendor/LICENCA-KATEX.txt` and `extension/vendor/LICENCA-MARKED.txt`.
Open source does not require forks to display the author's name in their UI,
but the applicable attribution notices must be preserved on redistribution.
