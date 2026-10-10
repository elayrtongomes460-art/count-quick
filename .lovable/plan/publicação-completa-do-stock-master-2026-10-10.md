# Publicação completa do Stock Master

## Diagnóstico
- O endereço do GitHub Pages está servindo uma página gerada pelo Jekyll a partir do README.
- Não existe workflow de publicação no checkout atual; a consulta pública de `.github/workflows` no repositório também retornou 404. Não foi possível inspecionar o histórico de execuções do GitHub Actions.
- O aplicativo usa TanStack Start e funções autenticadas de servidor para iniciar, carregar, salvar e finalizar inventários da Balança. GitHub Pages não executa essas funções.

## Solução escolhida
Preparar a publicação do aplicativo completo no Cloudflare Workers, através de GitHub Actions, sem remover telas, alterar o visual ou substituir as funções existentes.

O novo endereço será da hospedagem com servidor, não `github.io`. O endereço antigo continuará mostrando a publicação antiga até o GitHub Pages ser desativado ou receber um redirecionamento autorizado separadamente.

## Alterações
1. Configurar explicitamente a saída de produção com servidor e recursos JavaScript/CSS para Cloudflare Workers.
2. Criar um workflow para a branch `main`: instalar dependências com o lockfile, executar os testes existentes, compilar e publicar a configuração gerada pelo compilador — nunca a raiz do repositório ou o README.
3. Preparar o caminho `/count-quick/` para essa publicação externa, ajustando os caminhos de navegação e recursos necessários, sem mudar o endereço raiz do aplicativo no Lovable.
4. Impedir que `.env` e credenciais privadas sejam incluídos nos recursos públicos; obter a configuração pública e as credenciais de publicação das configurações do GitHub.
5. Documentar os arquivos alterados, a configuração da conta Cloudflare, as variáveis exigidas e os passos para executar o workflow.

## Verificação
- Verificar a compilação automática do projeto e executar os testes existentes relacionados à contagem.
- Acrescentar verificações no workflow para falhar se os arquivos de servidor, JavaScript ou CSS esperados estiverem ausentes.
- Verificar navegação, autenticação e caminhos de recursos na prévia disponível. A publicação externa e a autenticação no novo endereço só poderão ser confirmadas após configurar a hospedagem e executar o workflow.
- Não declarar a versão externa publicada sem evidência de uma execução bem-sucedida.

## Detalhes técnicos
- Preservar TanStack Start, Nitro, middleware de autenticação e as funções `createServerFn` existentes.
- Usar o preset `cloudflare-module` e a configuração Wrangler gerada pelo Nitro para publicar tanto o servidor quanto seus recursos estáticos; não publicar apenas `dist/client`.
- Ativar `/count-quick/` somente no ambiente de publicação externa, mantendo a prévia e a publicação Lovable no caminho atual.
- O HTML inicial será servido pelo aplicativo com servidor; não será um `index.html` estático derivado do README.
- Credenciais Cloudflare devem ser configuradas como secrets do GitHub. Configurações públicas de conexão não são chaves administrativas. Não solicitar nem expor a chave administrativa do Lovable Cloud.
- Registrar a decisão de hospedagem no `AGENTS.md`.

## Dependências para colocar no ar
A publicação externa exige uma conta Cloudflare, autorização para publicar nela e configuração do novo endereço permitido na autenticação. Nenhum acesso ao GitHub ou à Cloudflare foi estabelecido nesta conversa; preparar arquivos localmente não equivale a publicá-los nesses serviços.