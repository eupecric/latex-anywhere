# Visibilidade e minimização por escopo (v1.10.3)

A barra principal possui dois menus independentes:

- **Ocultar:** Nesta aba / Neste domínio / Em todos os sites.
- **Minimizar:** Nesta aba / Neste domínio / Em todos os sites.

## Persistência

| Escopo | Recarregar a página | Fechar a aba | Reiniciar o navegador |
|---|---|---|---|
| Aba | Mantém | Encerra | Encerra (sessão da extensão) |
| Domínio | Mantém | Mantém | Mantém |
| Todos os sites | Mantém | Mantém | Mantém |

As preferências de aba ficam em `chrome.storage.session`, indexadas pelo ID da aba; o service worker apaga a chave quando recebe `tabs.onRemoved`. As preferências de domínio e globais ficam em `chrome.storage.local`. Nenhuma mensagem digitada é gravada nesses controles.

A opção **Neste domínio** usa o nome de host normalizado (removendo `www.`), compartilhando a escolha entre abas do mesmo domínio. O bloqueio global afeta todos os domínios.

## Precedência e recuperação

- **Ocultar** tem prioridade sobre **Minimizar**. Se qualquer ocultação ativa atingir uma página, a interface inteira deixa de aparecer.
- Se não houver ocultação, qualquer escopo de minimização ativo torna a barra compacta (botão **Maximizar** e grade 2×2 com os quatro cantos).
- **Maximizar** limpa os três escopos de minimização para restaurar a barra. Isso não altera os escopos de ocultação.
- O painel aberto pelo ícone da extensão mantém seis controles independentes, permitindo reverter qualquer preferência, mesmo com a interface invisível.
- O atalho `Alt+Shift+L` reativa primeiro a ocultação global, depois a do domínio, depois a da aba; quando nenhuma delas está ativa, oculta o domínio atual.

Os rascunhos da prévia **não são salvos** entre fechamentos de aba. Alterar a visibilidade/minimização não aplica texto no site.

## Verificação local

Verifique em uma página com `textarea` ou `contenteditable`:

1. Ocultar/minimizar somente na aba A e atualizar a aba A: o estado deve permanecer; a aba B no mesmo domínio deve ficar independente.
2. Fechar a aba A e abrir uma nova: a preferência por aba não deve ser herdada.
3. Acionar a opção do domínio: A e B devem compartilhar o estado, inclusive após refresh.
4. Acionar a opção global: todos os sites permitidos devem compartilhar o estado, inclusive após reiniciar o Chrome.
5. Ocultar e minimizar simultaneamente: a ocultação tem prioridade; restaurar a ocultação deve revelar a barra minimizada.
6. Abrir o popup pelo ícone enquanto oculto e recuperar cada escopo.
7. Maximizar uma barra minimizada por domínio/global e conferir os escopos no popup.

Os testes automatizados de armazenamento de sessão e eventos foram feitos com simulações do Chrome. O comportamento em páginas reais ainda depende de teste no navegador instalado.