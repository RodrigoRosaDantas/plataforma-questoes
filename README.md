# Plataforma de Questões

Nova base GitHub da plataforma de resolução de questões. O produto é **genérico para concursos**: concursos mudam; a arquitetura da plataforma não.

## Arquitetura

```text
Notion — Banco Mestre editorial
        ↓ workflow com NOTION_TOKEN (server-side)
release JSON validada no GitHub
        ↓
GitHub Pages / PWA
        ↓
adaptador de progresso do usuário
```

O navegador **nunca recebe o token do Notion**. O conteúdo editorial e o progresso do usuário são domínios separados.

## Estado da plataforma

A plataforma usa uma arquitetura limpa, sem carregar o legado técnico do repositório SEDES/DF. A V2 reorganiza a experiência de estudo em torno do fluxo escolher → responder → corrigir → revisar → acompanhar, mantendo Notion e progresso do estudante em domínios separados.

A `main` do repositório já contém a release completa derivada do Banco Mestre. O workflow `Sincronizar Banco Mestre do Notion` recompõe essa release automaticamente; snapshots locais de bootstrap podem continuar em modo de amostra para validar a interface sem expor o banco inteiro.

## Funcionalidades V2

- Home orientada à próxima ação;
- Banco e editais;
- Banco de questões;
- filtros por órgão, cargo, banca, ano, disciplina, assunto e formato;
- contagem disponível em tempo real;
- escolha do tamanho da bateria;
- embaralhamento;
- treino comentado e modo prova;
- cronômetro;
- mapa da bateria;
- marcações;
- resultado com percentual e precisão separados;
- caderno de erros;
- D0/D7/D20 simplificado;
- histórico e desempenho;
- retomada de sessão;
- importação JSON apenas para pré-validação;
- PWA e cache offline do shell;
- responsividade mobile/tablet/desktop;
- workflows de validação, sync do Notion e GitHub Pages.

## Release auditada em 15/09/2026

- 3.765 registros na fonte editorial;
- 3.696 questões objetivas publicadas;
- 69 registros excluídos pelos gates editoriais;
- 2.528 questões de Certo / Errado;
- 1.168 questões de múltipla escolha A–E;
- 38 cadernos oficiais TJDFT catalogados, com 232 questões interativas revisadas;
- 0 questões publicadas sem enunciado, gabarito ou campos essenciais.
O sincronizador preserva `formatoOriginal` e cria um `formato` derivado apenas quando o campo está vazio. Ele não altera o Notion.

## Configuração do GitHub

1. Crie um repositório chamado `plataforma-questoes`.
2. Envie o conteúdo deste pacote para a `main`.
3. Em **Settings → Secrets and variables → Actions** crie:
   - Secret: `NOTION_TOKEN`
   - Variable: `NOTION_DATA_SOURCE_ID` = `784234ae-deca-4514-b60d-19524e122a89`
4. Garanta que o Banco Mestre esteja compartilhado com a integração correspondente ao token.
5. Em **Actions**, execute `Sincronizar Banco Mestre do Notion`.
6. Em **Settings → Pages**, selecione **GitHub Actions** como origem de publicação.

## Gates editoriais do sync

Uma questão não entra na release quando:

- não tem enunciado;
- não tem gabarito;
- não tem disciplina, cargo ou banca;
- possui gabarito `Anulada` ou `Sem gabarito`;
- está marcada como duplicada;
- possui bloqueio manual de publicação;
- `Auditoria de conteúdo = Não aprovada`;
- é discursiva ou não possui alternativas objetivas suficientes para o fluxo objetivo da plataforma.

Questões anuladas e questões com gabarito `Anulada` ou `Sem gabarito` permanecem fora da release. Questões discursivas também ficam preservadas no Notion até existir um fluxo próprio de resposta e correção; nenhum desses estados é silenciosamente convertido em questão objetiva.

## Persistência

A plataforma usa `ProgressStore` com armazenamento local imediato e sincronização opcional no Supabase. Sem conta ou sem conexão, o estudo continua funcionando no aparelho; após o login por link de e-mail, o estado é mesclado por recência entre aparelhos sem trocar os IDs das questões nem misturar estado do usuário com o Banco Mestre.

### Auditoria Supabase — 15/09/2026

- corrigido o privilégio que impedia `ensure_student_profile()` de criar ou reativar o perfil do usuário autenticado;
- `anon` não tem acesso à tabela de estado sincronizado nem à função de provisionamento;
- `authenticated` possui somente `SELECT`, `INSERT` e `UPDATE` necessários, sem `DELETE`, `TRUNCATE`, `TRIGGER` ou `REFERENCES`;
- políticas RLS isolam perfil e progresso pelo `auth.uid()` do usuário;
- IDs de perfis históricos são preservados e as colunas de identidade não podem ser alteradas pelo cliente;
- teste transacional confirmou leitura/escrita própria, zero leitura cruzada e zero atualização cruzada, sem deixar registros de teste;
- questões, alternativas, enunciados e gabaritos continuam fora do Supabase.

## Desenvolvimento

```bash
npm test
npm run validate
npm run build
```

Para sincronizar o Notion localmente:

```bash
NOTION_TOKEN='...' NOTION_DATA_SOURCE_ID='784234ae-deca-4514-b60d-19524e122a89' npm run sync:notion
```

Nunca versione o token.

## Estado técnico atual

A release publicada usa metadata schema 2 e um `releaseSnapshotId` determinístico. Cada questão traz hash/versionamento editorial para que o histórico de respostas continue ligado à versão que foi resolvida.

O botão **Atualizar release** recarrega os arquivos publicados com cache-busting. O verticalizado abre uma bateria já filtrada pelo órgão, cargo, disciplina e assunto do tópico escolhido.

O modo local guarda o estudo no navegador. Ao entrar por link de e-mail, o Supabase sincroniza o estado do estudo entre aparelhos; não armazena o banco editorial. O acesso é protegido por RLS e o frontend usa apenas a chave publicável.

A política atual de pontuação é explícita: sem penalidade, branco fora do denominador de precisão e gabarito/feedback somente após confirmar. Como a página é estática, o gabarito ainda pode ser inspecionado por quem examinar os arquivos; correção autoritativa no servidor é necessária para uma aplicação de prova segura.


## Auditoria responsiva — 15/09/2026

A interface foi refinada para celular, iPad/tablet e desktop: grades se adaptam a telas médias, filtros e cartões empilham sem overflow, alvos de toque têm tamanho confortável, o resolvedor mantém ações acessíveis e o controle de tema permanece disponível no celular. O service worker usa cache versionado e o botão Atualizar continua explícito.


### Publicação responsiva
A melhoria responsiva está consolidada no commit de release atual. O workflow padrão executa validação e publicação a cada push na `main`.


## Atualização V2 — 15/09/2026

- Home compacta e orientada à próxima ação;
- sidebar off-canvas em iPad e celular, com backdrop, Escape e estados ARIA;
- editais verticalizados pesquisáveis, com disciplinas recolhíveis e bateria exata por tópico;
- painel de filtros recolhível em telas médias e chips de filtros ativos;
- resolvedor com barra de progresso, modo visível, alternativas acessíveis e foco no feedback;
- recomendações de estudo no painel de desempenho;
- rotas compartilháveis e suporte ao botão Voltar;
- instalação PWA com ícones 180, 192 e 512 px;
- cache canônico da release, sem duplicar o arquivo de questões a cada atualização;
- persistência otimizada para não reconstruir toda a interface a cada resposta.

O conteúdo editorial não foi alterado pela atualização visual. O Supabase permanece restrito ao progresso do estudante; questões e gabaritos continuam derivados do Banco Mestre no Notion.
