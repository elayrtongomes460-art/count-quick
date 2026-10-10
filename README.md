# Stock Master

Crie um aplicativo mobile de inventário para celular e coletor de dados com scanner físico, com foco em uso operacional em estoque. O app deve ser mobile first, com layout simples, profissional, rápido, com botões grandes e boa legibilidade para telas pequenas.

Objetivo desta etapa

Nesta primeira etapa, quero que você crie a estrutura base do aplicativo, conecte com o Supabase, configure autenticação, crie as tabelas do banco e prepare a navegação principal.

Stack / arquitetura

 Aplicativo mobile responsivo

 Backend em Supabase

 Autenticação via Supabase Auth

 Banco de dados no Supabase

 Estrutura preparada para uso em celular e coletor com scanner físico

 Navegação simples entre telas

Criar as seguintes telas base:

Login

Criar conta

Tela inicial / Home

Cadastro Itens

Novo Inventário

Contagem do Inventário

Histórico de Inventários

Detalhes do Inventário

Perfil / Sair

Fluxo de autenticação

Criar tela Login com:

 E-mail

 Senha

 Botão Entrar

 Link ou botão Criar conta

Criar tela Criar conta com:

 Nome

 E-mail

 Senha

 Confirmar senha

 Botão Cadastrar

Regras da autenticação

 usar Supabase Auth

 manter sessão ativa

 redirecionar usuário autenticado para a Home

 se não estiver autenticado, bloquear acesso às demais telas

 criar botão Sair

 exibir mensagens de erro amigáveis

Banco de dados no Supabase

Crie estas tabelas com os seguintes campos:

Tabela: profiles

Campos:

 id UUID relacionado ao usuário do Supabase Auth

 nome

 email

 created_at

Tabela: itens

Campos:

 id UUID

 produto

 part_number

 designacao

 quantidade_un

 unidade_un

 localizacao

 preco_medio_pond

 created_by UUID

 created_at

 updated_at

Regras da tabela itens

produto deve ser único

 todos os campos principais devem ser obrigatórios

Tabela: inventarios

Campos:

 id UUID

 nome_inventario

 data

 responsavel

 observacao

 status

 user_id UUID

 created_at

 updated_at

 finalized_at

Tabela: inventario_itens

Campos:

 id UUID

 inventario_id UUID

 item_id UUID

 produto

 part_number

 designacao

 quantidade_un_sistema

 unidade_un

 localizacao

 preco_medio_pond

 quantidade_contada

 diferenca

 valor_divergencia

 created_at

 updated_at

Relacionamentos

 um usuário pode criar vários inventários

 um inventário pode ter vários itens

 um item pode aparecer em vários inventários

Regras de negócio iniciais

 status do inventário: Em andamento ou Finalizado

 proteger todas as rotas para usuários autenticados

 vincular inventários ao usuário logado

 preparar a estrutura para leitura por scanner no campo Produto

Layout da Home

Após login, a Home deve mostrar cards ou botões grandes para:

Novo Inventário

Cadastro Itens

Histórico de Inventários

Perfil / Sair

Design

 layout mobile first

 visual profissional, industrial e corporativo

 botões grandes

 alto contraste

 boa leitura em ambientes operacionais

 interface limpa, sem excesso de informação

Importante

Nesta etapa, foque em:

 estrutura do app

 autenticação

 Supabase

 banco de dados

 navegação

 proteção de rotas

Não implemente ainda a lógica completa do inventário nem importação/exportação. Apenas deixe a base pronta e funcional.

PROMPT 2 — CADASTRO DE ITENS COMPLETO

Continuando o aplicativo mobile de inventário já criado, agora implemente completamente a tela Cadastro Itens, conectada ao Supabase.

Objetivo desta etapa

Criar o CRUD completo de itens, com formulário, listagem, pesquisa, edição e exclusão.

Tela: Cadastro Itens

A tela deve funcionar bem em celular e coletor de dados, com layout simples e rápido.

Os campos do formulário devem aparecer exatamente nesta sequência:

Produto

Part_Number

Designação

Quantidade UN

Unidade UN

Localização

Preço médio pond.

Regras dos campos

Produto = código principal do item / código lido pelo scanner

Part_Number = part number

Designação = descrição

Quantidade UN = quantidade do sistema

Unidade UN = unidade do item

Localização = localização física

Preço médio pond. = valor médio ponderado

Funcionalidades obrigatórias

Cadastro

 cadastrar novo item no Supabase

 validar todos os campos obrigatórios

 impedir cadastro com Produto duplicado

 mostrar mensagem clara se já existir item com o mesmo Produto

Listagem

 listar todos os itens cadastrados

 mostrar pelo menos:

 Produto

 Part_Number

 Designação

 Quantidade UN

 Unidade UN

 Localização

 Preço médio pond.

Pesquisa

permitir pesquisar por:

 Produto

 Part_Number

 Designação

Edição

 editar qualquer item já cadastrado

 atualizar no Supabase

Exclusão

 excluir item com confirmação antes de apagar

Regras de UX

 formulário simples

 botões grandes

 bom espaçamento

 foco em rapidez operacional

 se salvar com sucesso, mostrar feedback claro

 após salvar, limpar formulário e permitir novo cadastro

 manter compatível com tela pequena

Banco

Use a tabela itens já criada na etapa anterior.

Importante

Nesta etapa, foque apenas em:

 tela Cadastro Itens

 CRUD completo

 integração com Supabase

 validações

 pesquisa e listagem

Não implemente ainda a lógica de inventário.

PROMPT 3 — NOVO INVENTÁRIO + CONTAGEM COM SCANNER

Continuando o aplicativo mobile de inventário já criado, agora implemente a funcionalidade principal: Novo Inventário e Contagem do Inventário com scanner físico do coletor de dados, conectado ao Supabase.

Objetivo desta etapa

Criar:

 tela Novo Inventário

 tela Contagem do Inventário

 listagem dos itens contados

 lógica de busca automática pelo campo Produto

 cálculo de diferença e valor da divergência

Parte 1 — Tela Novo Inventário

Criar a tela Novo Inventário com os campos:

Nome do inventário

Data

Responsável

Observação (opcional)

 botão Iniciar Inventário

Regras

 ao iniciar, criar um registro na tabela inventarios

 status inicial = Em andamento

 vincular o inventário ao usuário logado

 após criar, redirecionar para a tela Contagem do Inventário

Parte 2 — Tela Contagem do Inventário

Essa tela é a mais importante do sistema.
Ela deve ser pensada para coletor de dados com scanner físico, mas também permitir digitação manual no celular.

Campos da tela, nesta ordem:

Produto

Part_Number

Designação

Quantidade UN

Unidade UN

Localização

Preço médio pond.

Quantidade contada

Diferença

Comportamento obrigatório

Campo Produto

 o campo Produto deve receber foco automático ao abrir a tela

 o scanner do coletor vai preencher esse campo

 ao detectar valor nesse campo, buscar automaticamente o item na tabela itens

 se encontrar, preencher automaticamente:

 Part_Number

 Designação

 Quantidade UN

 Unidade UN

 Localização

 Preço médio pond.

Quantidade contada

 o operador informa a quantidade contada

 calcular automaticamente:
Diferença = Quantidade contada - Quantidade UN

 calcular também:
Valor da divergência = Diferença x Preço médio pond.

Botões da tela

Adicionar item

Salvar contagem

Limpar leitura

Ver itens contados

Finalizar inventário

Parte 3 — Regras do scanner e da leitura

1. Item encontrado

Se o Produto existir:

 preencher os dados do item automaticamente

 permitir digitar a quantidade contada

 salvar no inventário atual

2. Item não encontrado

Se o Produto não existir:
mostrar mensagem:
“Item não cadastrado.”

E mostrar opções:

Cadastrar item

Voltar para leitura

3. Item já lido no inventário atual

Se o item já foi lançado no inventário em andamento:

 não criar duplicidade

 atualizar a quantidade contada do item já existente
ou permitir editar a quantidade já lançada

4. Após salvar

 salvar o item na tabela inventario_itens

 limpar os campos

 voltar o foco para Produto

 deixar pronto para próxima leitura

Parte 4 — Lista de itens contados

Criar uma área ou tela com os itens já contados no inventário atual.

Mostrar:

 Produto

 Part_Number

 Designação

 Quantidade UN

 Quantidade contada

 Diferença

 Unidade UN

 Localização

 Preço médio pond.

 Valor da divergência

Permitir:

 editar quantidade contada

 remover item do inventário

 pesquisar item já contado

Parte 5 — Finalização do inventário

Ao clicar em Finalizar inventário:

 alterar status para Finalizado

 gravar data/hora de finalização

 mostrar resumo:

 total de itens contados

 total de itens com diferença

 total de sobra

 total de falta

 valor total da divergência

Salvar tudo no Supabase.

Importante

Nesta etapa, foque em:

 criação do inventário

 tela de contagem

 leitura por scanner

 busca automática por Produto

 salvar itens contados

 cálculo de diferença

 finalização do inventário

Não implemente ainda importação/exportação de arquivos.

PROMPT 4 — HISTÓRICO + IMPORTAÇÃO + EXPORTAÇÃO + AJUSTES FINAIS

Continuando o aplicativo mobile de inventário já criado, agora implemente as funcionalidades finais: Histórico de Inventários, Importação de Itens por Excel/CSV, Exportação de Relatórios e refinamentos de usabilidade.

Objetivo desta etapa

Adicionar:

 Histórico de inventários

 Tela de detalhes do inventário

 Importação de itens por planilha

 Exportação do relatório final

 Ajustes finais de UX para operação em celular e coletor

Parte 1 — Histórico de Inventários

Criar a tela Histórico de Inventários.

Mostrar lista com:

 nome do inventário

 data

 responsável

 status

 quantidade de itens contados

 valor total da divergência

Permitir:

 pesquisar inventários

 abrir detalhes do inventário

 visualizar resumo final

Parte 2 — Detalhes do Inventário

Ao abrir um inventário do histórico, mostrar:

Cabeçalho

 nome do inventário

 data

 responsável

 observação

 status

 data de finalização

Lista de itens do inventário

Mostrar:

 Produto

 Part_Number

 Designação

 Quantidade UN do sistema

 Quantidade contada

 Diferença

 Unidade UN

 Localização

 Preço médio pond.

 Valor da divergência

Resumo do inventário

Mostrar:

 total de itens contados

 total de itens com diferença

 total de sobra

 total de falta

 valor total da divergência

Parte 3 — Importação de itens por Excel/CSV

Criar funcionalidade para importar itens por planilha.

A planilha deve conter as colunas exatamente nesta ordem:

 Produto

 Part_Number

 Designação

 Quantidade UN

 Unidade UN

 Localização

 Preço médio pond.

Regras da importação

 validar se todas as colunas existem

 validar tipos de dados

 impedir duplicidade de Produto

 oferecer opção:

atualizar item existente

ignorar item duplicado

 mostrar resumo da importação:

 total importado

 total atualizado

 total ignorado

 erros encontrados

Parte 4 — Exportação de relatório

Permitir exportar o relatório do inventário em:

CSV

Excel

PDF

O relatório exportado deve conter:

 Produto

 Part_Number

 Designação

 Quantidade UN do sistema

 Quantidade contada

 Diferença

 Unidade UN

 Localização

 Preço médio pond.

 Valor da divergência

Também incluir o resumo do inventário:

 nome do inventário

 data

 responsável

 status

 total de itens

 total da divergência

Parte 5 — Ajustes finais de usabilidade

Refinar o aplicativo para uso operacional em celular e coletor.

Ajustes obrigatórios:

 botões grandes e fáceis de tocar

 telas com bom espaçamento

 navegação rápida

 campo Produto com destaque na tela de contagem

 feedback visual de sucesso e erro

 destaque para itens com divergência

 foco em performance e simplicidade

 interface mobile first

 aparência profissional, industrial e corporativa

Revisar o app inteiro

Revisar e garantir:

 integração correta com Supabase

 autenticação funcionando

 CRUD de itens funcionando

 inventário funcionando

 histórico funcionando

 importação e exportação funcionando

 fluxo de scanner pronto para coletor.

O PDF QUE ANEXEI COLOQUE NO CADASTRO DO ITENS, PQ NO PDF CONTEM O ITENS QUE QUERO LOGO CADASTRAR, E AS DEMAIS INFORMAÇÕES, COMO PRODUTO, PARTNUMBER, QUANTIDADE, LOCALIZAÇÃO, PREÇO MEDIO

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://count-quick.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/782af82c-3ed5-4fd6-90d5-4103f763cfb3).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
