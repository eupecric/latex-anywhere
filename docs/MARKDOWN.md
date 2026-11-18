# Markdown e LaTeX — LaTeX Anywhere v1.10.2

A prévia da extensão agora reconhece Markdown além dos delimitadores e ambientes de matemática LaTeX.

## Exemplos

```markdown
# Título

Um **texto em negrito**, outro *em itálico*, ~~riscado~~ e `código`.

- Primeiro item
- Segundo item

> Uma citação.

| Operação | Expressão |
| --- | --- |
| Soma | 2 + 2 |

A fórmula é \(\boxed{x^2+y^2=z^2}\).
```

Também são reconhecidos links Markdown com endereços `https:`, `http:` e `mailto:`,
listas numeradas, cabeçalhos de nível 1–6, linhas horizontais e blocos de código cercados por crases.

## Edição e preservação do código original

- O código original permanece intacto no campo de origem e é o conteúdo aplicado ou copiado.
- Na prévia principal, a formatação Markdown aparece renderizada. Dê **dois cliques** em um trecho
  formatado para editar seu Markdown original, como acontece com as expressões LaTeX.
- Para editar o texto inteiro sem alternar entre trechos, use **Editar texto separado**.
- O Markdown concluído pode ser renderizado enquanto se digita, sem clicar fora.
- Texto dentro de blocos de código Markdown não é tratado como matemática.
- O renderizador cria elementos DOM com texto escapado; HTML bruto do usuário não é executado.
  URLs de esquemas perigosos são descartadas. Imagens remotas não são carregadas
  automaticamente a partir da prévia, para evitar requisições de rede invisíveis.

## Limitações

A renderização Markdown segue a sintaxe comum e as extensões GFM suportadas pelo Marked 4.0.19.
A extensão não é um compilador LaTeX: o KaTeX não cobre todos os pacotes de LaTeX.

**Composições aninhadas** em que a sintaxe Markdown envolve uma fórmula — por exemplo,
`**\(x\)**` — ainda podem não receber toda a formatação externa simultaneamente
na prévia editável. Fórmulas e formatações lado a lado funcionam normalmente.

`\boxed{...}` já é reconhecido pelo KaTeX dentro de matemática; a versão 1.10.2 também
adiciona uma entrada **Expressão em caixa** na paleta de estruturas.

## Segurança e licenças

- Renderização matemática local: KaTeX (MIT).
- Parser Markdown local: Marked 4.0.19 (MIT). Fonte incorporada em `extension/vendor/marked.js`.
- A extensão não importa scripts de CDNs nem envia o texto do campo a servidores externos.
- Consulte as licenças dos componentes em `extension/vendor/`.
