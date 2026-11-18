# LaTeX Anywhere

Extensão para Google Chrome (Manifest V3) que adiciona um editor e uma pré-visualização LaTeX a campos de texto em sites compatíveis, incluindo `textarea` e `contenteditable`.

**Versão inicial neste repositório: 1.10.0.**

## Instalação em modo desenvolvedor

1. Abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta **`extension/`** deste repositório.
5. Atualize as abas em que deseja usar a extensão.

> Se a extensão já está instalada, mantenha a mesma pasta no Chrome para preservar o identificador e as preferências; atualize os arquivos e use **Recarregar** em `chrome://extensions`.

## Recursos

- Prévia renderizada de expressões entre `\(...\)`, `\[...\]`, `$$...$$` e ambientes AMS compatíveis.
- Prévia e editores móveis/redimensionáveis com opção de sincronizar ou aplicar manualmente.
- Edição inline ou separada de fórmulas, incluindo ambientes multilinha.
- Barra de formatação e catálogo de símbolos LaTeX com busca e categorias.
- Atalhos de inserção e teclas configuráveis por site; `Ctrl+B`, `Ctrl+I`, `Ctrl+U` fixos nos editores da extensão.
- Menu de contexto dos símbolos: **Copiar LaTeX** e **Definir tecla de atalho**.
- Zoom independente nas visualizações e modos de minimizar/ocultar a extensão.

## Estrutura

- `extension/` — código da extensão, ícones, manifesto e bibliotecas locais.
- `docs/` — documentação da versão importada e capturas.
- `tests/` — página local simples para experimentar a extensão.

## Tecnologia e limitações

O código inclui uma versão local do **KaTeX** para renderização matemática; consulte a licença correspondente em `extension/vendor/LICENCA-KATEX.txt`.

O processamento das mensagens ocorre no navegador. Preferências de interface e atalhos são salvas localmente por site. O recurso de sincronização automática com editores complexos (como o ProseMirror do ChatGPT) tem limitações e deve ser validado no navegador antes de seu uso em mensagens importantes.

Os testes anteriormente registrados foram executados em páginas simuladas no Chromium; eles não demonstram compatibilidade universal com todos os editores ou com a interface atual do ChatGPT.

## Desenvolvimento

Após editar `extension/`, clique em **Recarregar** na página de extensões e atualize o site de teste. Para futuras versões, registre mudanças como novos commits, mantendo a mesma estrutura do repositório.

## Releases and version history

The first version published to this repository is **v1.10.0**. See
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

Third-party KaTeX components are licensed separately under MIT; their notice
is preserved at
[`extension/vendor/LICENCA-KATEX.txt`](extension/vendor/LICENCA-KATEX.txt).
Open source does not require forks to display the author's name in their UI,
but the applicable attribution notices must be preserved on redistribution.
