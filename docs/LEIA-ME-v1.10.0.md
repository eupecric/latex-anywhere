# LaTeX Anywhere v1.10.0

Extensão Chrome Manifest V3 com editor de LaTeX e pré-visualização matemática.

## Novidade: menu de contexto nos símbolos

Na paleta **Ω Símbolos**, clique com o **botão direito** em qualquer cartão para abrir:

- **Copiar LaTeX**: copia o código do símbolo sem modificar o texto do editor. Nos modelos, os marcadores internos `{{selection}}` e `{{cursor}}` são removidos (por exemplo, a fração é copiada como `\frac{}{}`).
- **Definir tecla de atalho…**: abre a configuração de atalhos de teclado já com o comando selecionado. Para uma nova associação, o botão inicia a captura de teclas; escolha uma combinação com Ctrl ou Alt e clique em **Salvar**. Se já houver uma associação para o símbolo, a janela mostra a associação existente, que pode ser alterada.

A vinculação é salva **por site** e usa uma identificação estável derivada do próprio comando, não da posição do cartão. O atalho inserirá a expressão no cursor/seleção da **prévia editável, do editor principal ou da janela de texto completo**. Ele não captura atalhos na caixa original do ChatGPT nem em outros sites.

Atalhos reservados: `Ctrl+B`, `Ctrl+I` e `Ctrl+U` continuam fixos e não podem ser alterados.

## Como instalar ou atualizar

1. Descompacte o arquivo ZIP.
2. Para **atualizar sem perder as preferências**, copie todos os arquivos da pasta `extensao` por cima da mesma pasta usada pela instalação atual; não remova a extensão anterior nem altere seu caminho no Chrome.
3. Em `chrome://extensions`, clique em **Recarregar**.
4. Atualize as abas onde a extensão é usada.

Para uma instalação nova, use **Carregar sem compactação** e selecione a pasta `extensao`.

## Testes

- Clique direito em um cartão de símbolo, abertura e fechamento do menu.
- Cópia do comando de uma expressão simples e de um modelo com marcadores (ex.: `\frac{}{}`).
- Abertura do gerenciador de teclado com comando pré-selecionado.
- Captura de `Ctrl+Alt+K`, salvamento por site e inserção de `\alpha` em uma prévia editável.
- Recusa de `Ctrl+B` como atalho personalizado.
- Sem erros de JavaScript observados no navegador de teste.

Esses testes foram executados no Chromium com scripts da extensão injetados em uma página de teste e APIs de armazenamento/clipboard simuladas. **Não constituem teste de instalação nativa no Chrome nem prova de compatibilidade com o ProseMirror real do ChatGPT.**

## Privacidade e limites

O processamento matemático é local. A extensão não transmite o texto para serviços externos. As teclas configuradas e as posições de janelas são persistidas por origem; o texto digitado não é armazenado.

Atalhos do sistema operacional ou navegador podem ter precedência sobre os atalhos da extensão.
