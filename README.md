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

## Estado desta V1

A interface foi reconstruída a partir do inventário funcional e do snapshot mais recente do projeto no Work. Não é uma cópia literal do código-fonte do Work: o código-fonte interno do Work não estava exposto nesta sessão. A V1 implementa uma arquitetura limpa, sem carregar o legado técnico do repositório SEDES/DF excluído.

A release incluída no pacote está em **modo de amostra**, com uma questão real do Banco Mestre, apenas para validar a interface. O workflow `Sincronizar Banco Mestre do Notion` substitui essa amostra pela release completa.

## Funcionalidades V1

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

## Banco Mestre auditado em 14/09/2026

- 3.525 registros;
- 2.380 Certo/Errado;
- 937 múltipla escolha A–E;
- 206 sem formato explícito;
- 2 discursivas;
- 0 sem enunciado;
- 2 sem gabarito;
- 0 sem disciplina;
- 125 sem assunto;
- 0 sem cargo;
- 0 sem fonte/banca.

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
- está marcada como duplicada;
- possui bloqueio manual de publicação;
- `Auditoria de conteúdo = Não aprovada`.

Questões anuladas permanecem como estado explícito; não são silenciosamente convertidas em questões normais.

## Persistência

A V1 usa `ProgressStore` com armazenamento local para que a plataforma seja funcional sem backend. Isso é um **adaptador**, não uma decisão arquitetural definitiva. A próxima camada pode implementar conta/sincronização em nuvem sem trocar os IDs das questões nem misturar estado do usuário com o Banco Mestre.

## Desenvolvimento

```bash
npm run validate
npm run build
```

Para sincronizar o Notion localmente:

```bash
NOTION_TOKEN='...' NOTION_DATA_SOURCE_ID='784234ae-deca-4514-b60d-19524e122a89' npm run sync:notion
```

Nunca versione o token.
