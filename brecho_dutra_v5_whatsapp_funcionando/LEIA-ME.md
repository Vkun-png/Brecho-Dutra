# Brechó Dutra — versão 5 (WhatsApp corrigido)

## Como atualizar o site
Descompacte e publique a pasta inteira no Netlify, substituindo `index.html`, `css`, `js`, `sw.js`, `icons` e `manifest.webmanifest`. Não altere o domínio para preservar a lista salva no aparelho. Atualize a página do Chrome/Android após a publicação.

## Correção
O botão verde agora é um **link direto** `https://wa.me/?text=...`, aberto na própria aba, sem `window.open`, que pode ser bloqueado no Android. O link é atualizado ao cadastrar, editar, apagar uma peça ou mudar o nome da fornecedora.

Alternativas abaixo do botão verde:
- **Compartilhar pelo Android:** abre o menu nativo (se o navegador oferecer Web Share API), permitindo escolher o WhatsApp.
- **Copiar mensagem:** copia o relatório para colar em uma conversa; se a área de transferência falhar, o texto é exibido para seleção manual.

Relatórios muito longos usam o compartilhamento nativo em vez de URLs gigantes.

## Não mudou
Modo mãos livres, antirrepetição de voz, divisão 50/50, salvar localmente, cadastro e edição das peças.

## Teste rápido
Cadastre uma peça manualmente, preencha a fornecedora, toque em **Compartilhar no WhatsApp**. O WhatsApp ou sua tela de compartilhamento deve abrir com os dados preenchidos. Caso o Android não consiga abrir o link, utilize uma das duas opções alternativas.

**Limitações:** exigem o Chrome atualizado, WhatsApp instalado para enviar pelo app e conexão com a internet. O envio final é feito pelo usuário; o site não envia mensagens sozinho.
