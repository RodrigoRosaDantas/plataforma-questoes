# Arquitetura V1 — Plataforma de Questões

## Princípio

A identidade do produto é **Plataforma de Questões**, não um concurso específico.

```text
Plataforma
  ├─ concursos/trilhas
  │   ├─ cargos
  │   └─ edital verticalizado
  ├─ banco único de questões
  ├─ provas e simulados
  └─ estado do usuário
      ├─ tentativas
      ├─ respostas
      ├─ erros
      ├─ marcadas
      ├─ revisões
      └─ desempenho
```

## Fonte da verdade

### Conteúdo editorial

Fonte: Notion — Banco Mestre.

O site não consulta o Notion diretamente. O GitHub Action consulta a API com segredo, transforma os campos e produz `data/questions.json`.

### Estado do usuário

A fonte imediata é o `ProgressStore` local, com sincronização opcional autenticada pelo adaptador `cloud-progress.js`. O Supabase armazena somente o estado do estudo do usuário — sessões, respostas, erros, marcações, revisões, anotações e sessão ativa — protegido por RLS por `profile_id`. Questões, gabaritos e conteúdo editorial continuam no GitHub.

## Contrato de identidade

O `id` da questão deriva de `Código`; se ausente, usa `Questão`; só em último caso usa o page ID do Notion. Posição no array nunca é identidade persistente.

## Contrato de publicação

O Notion pode conter itens históricos, bloqueados ou em revisão. A release pública é derivada e passa por gates. A plataforma não altera automaticamente o Banco Mestre durante a publicação.

Questões anuladas, sem gabarito utilizável ou discursivas permanecem no Notion, mas não entram no fluxo objetivo da V1 até haver suporte específico para seu formato.

## Mapeamento do Work para V1

- Banco e editais → `edits`
- Banco de questões → `questions`
- Provas aplicadas → `proofs`
- Simulados → `simulations`
- Revisar → `review`
- Desempenho → `performance`
- Importar provas → `import`
- Ajustes e dados → `settings`

A reconstrução evita o padrão antigo de múltiplas camadas de `MutationObserver`; a renderização é controlada por estado e funções explícitas.

## Próxima evolução técnica

1. publicar a release completa do Notion;
2. conectar os eixos verticalizados de SEEDF/TJDFT a IDs/aliases editoriais;
3. backend autenticado de progresso com isolamento por usuário;
4. testes E2E com navegador real;
5. estratégia de versionamento/migração de progresso;
6. política explícita para conteúdo corrigido/desatualizado/anulado.

## Contrato canônico da release — schema 2

Cada questão publicada mantém `id` estável, `contentVersion`, `contentHash` SHA-256 e `sourceSnapshot`. O hash cobre os campos editoriais que influenciam a resolução; `releaseSnapshotId` identifica o conjunto publicado. O workflow lê a versão anterior por ID, preserva a versão quando o conteúdo não mudou e incrementa quando mudou.

Tentativas e revisões gravam a versão/hash da questão. Assim, uma alteração editorial no Notion não reescreve silenciosamente o histórico do estudante.

## Progresso e sincronização

O modo local continua funcionando sem conta. Com acesso por link de e-mail, o adaptador usa o mesmo perfil autenticado em qualquer aparelho e faz merge por recência, incluindo anotações, marcações, revisões, histórico e sessão ativa. Exclusões de anotações/marcações usam tombstones para não reaparecerem durante o merge.

A tabela `public.student_progress_states` não tem permissão para `anon`, usa políticas `authenticated` com `USING` e `WITH CHECK` de propriedade e não recebe o conteúdo de `questions.json`.

## Tempo e pontuação

O cronômetro considera somente tempo ativo: troca de aba, `pagehide` e retorno são persistidos e pausados. A release declara a política de pontuação; a atual usa acerto simples, sem penalidade por erro, não conta branco como erro e só mostra gabarito após confirmação.

A resposta correta permanece no release público porque o site também oferece modo local estático. Isso evita uma falsa sensação de segurança: para prova de alto risco, a próxima fronteira é uma sessão autenticada com correção autoritativa no servidor.

## Status dos cinco pontos

1. Identidade/versionamento/snapshot: aplicado.
2. Cronômetro com tempo ativo: aplicado.
3. Anotações por questão: aplicado.
4. Sincronização entre aparelhos: aplicada no local e no Supabase, condicionada ao login.
5. Pontuação e feedback: política explícita e feedback pós-confirmação aplicados; segurança forte de gabarito em GitHub Pages continua limitada pelo modelo estático.
