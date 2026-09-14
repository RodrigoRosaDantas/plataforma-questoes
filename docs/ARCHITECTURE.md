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

Fonte: adaptador `ProgressStore`. Nesta V1, localStorage. A interface de armazenamento está isolada para futura implementação autenticada em nuvem.

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
