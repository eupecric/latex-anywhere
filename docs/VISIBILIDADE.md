# Controles de visibilidade (v1.10.1)

A opção **Ocultar** da barra principal abre duas ações distintas:

| Escolha | Efeito | Persistência |
| --- | --- | --- |
| **Neste domínio** | Oculta o LaTeX Anywhere no hostname atual (tratando `www.` e a versão sem `www.` como iguais). | Recarregar a página, reabrir aba ou reiniciar Chrome não reativa. |
| **Em todos os sites** | Oculta a extensão em todas as abas e domínios em que o Chrome permite a execução. | Continua oculta até desativação explícita. |

Ambas as escolhas são salvas separadamente com `chrome.storage.local`.
Se ambas estiverem ativas, a escolha **global tem prioridade**. Desativar
apenas o bloqueio global não altera a configuração individual do domínio.

## Recuperação

O ícone do LaTeX Anywhere na barra do Chrome abre um pequeno painel com dois
controles independentes: **Ocultar em todos os sites** e **Ocultar neste domínio**.
Esse painel funciona mesmo quando o conteúdo da extensão está inteiramente oculto.

`Alt+Shift+L` alterna o domínio atual quando a ocultação global está desligada.
Se o bloqueio global estiver ligado, a combinação desliga o bloqueio global;
caso o domínio também tenha sido ocultado, será necessário desativar esse
segundo bloqueio pelo painel ou usar novamente o atalho.

## Cuidados e limites

- Não há envio de texto para servidores; só as preferências de visibilidade são armazenadas.
- A extensão não funciona em páginas protegidas do Chrome, como `chrome://`.
  Nelas, o painel ainda oferece o controle global.
- Configurações antigas de ocultação por origem são interpretadas como
  ocultação do domínio, até o usuário definir explicitamente o novo controle.
- Se rascunhos estiverem abertos, ocultar não os descarta na aba existente.
  Fechar a aba, porém, não armazena esses rascunhos no navegador.

## Verificação

Exercitar: ocultar domínio, atualizar página, reabrir domínio, reativar no painel;
ocultar global, abrir outra aba/domínio, atualizar, reativar global;
ativar os dois bloqueios e verificar sua precedência; testar `Alt+Shift+L`.
