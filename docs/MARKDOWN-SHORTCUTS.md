# Barra de atalhos Markdown — v1.10.4

A barra **Markdown:** é distinta da barra de formatação LaTeX e aparece entre
os atalhos personalizados e os símbolos matemáticos na pré-visualização. Há
também barras Markdown nos editores de código e de texto completo.

## Comandos

| Botão | Resultado / comportamento |
| --- | --- |
| H1, H2, H3 | Adiciona um título `#`, `##` ou `###` à linha |
| B | Envolve a seleção com `**...**` |
| I | Envolve a seleção com `*...*` |
| S | Riscado com `~~...~~` |
| </> | Código inline com crases |
| 🔗 | Link `[texto](https://exemplo.com)`, com URL selecionada |
| • Lista | Lista com marcadores `- item` |
| 1. Lista | Lista numerada |
| ☐ | Lista de tarefas `- [ ] item` |
| ❝ | Citação `> ...` |
| ``` | Bloco de código com três crases |
| ▦ | Tabela Markdown 2 × 2 |
| ― | Linha horizontal `---` |

Os botões de linha atuam nas linhas incluídas na seleção. Os botões de
formatação inline inserem delimitadores ao redor da seleção; se não houver
seleção, inserem um texto-modelo editável. Ao aplicar novamente determinados
formatos, o comando remove os marcadores existentes.

Os comandos nunca inserem HTML no campo original. O Markdown é guardado
em formato textual e interpretado apenas pela prévia da extensão.

Seleções de formatação inline dentro de math mode são bloqueadas para não
danificar a estrutura LaTeX; comandos de linha continuam disponíveis.

O zoom da prévia, os atalhos LaTeX, o modo de aplicação e as opções de
ocultar/minimizar não são alterados por esta versão.

## Verificação

Execute `node tests/markdown-shortcuts.test.js` na raiz do repositório.
Os testes cobrem comandos, remoção de marcadores, operações em várias linhas
e posições de seleção/cursor. A integração com sites reais deve ser
verificada no Chrome instalado.
