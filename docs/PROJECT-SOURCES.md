# Fontes e acessos — Plataforma de Questões

Atualizado em 21/09/2026.

Este documento materializa o índice de fontes e acessos operacionais do projeto
`RodrigoRosaDantas/plataforma-questoes`. Ele não contém tokens, senhas, chaves
de API ou valores de secrets.

A identidade atual do produto é **Plataforma de Questões**. SEDES/DF permanece
como acervo histórico e fonte de origem de parte do banco, mas não define mais o
nome nem a arquitetura do produto.

## 1. Fontes principais

Estas são as fontes centrais da operação e devem ser consultadas primeiro:

1. [Página central — SEDES/DF Questões: Banco Editorial e Site](https://app.notion.com/p/3accf5a2673181faa215e4a9187ff960?pvs=1)
   - Painel editorial que conecta Banco Mestre, operação e publicação.
2. [Banco Mestre — Provas e Simulados SEDES/DF](https://app.notion.com/p/a1d5fc8f8e434105861faba90dc156d9?v=85b47b4a2e17461e9d3482724b13fab8&source=copy_link)
   - Fonte editorial de questões, metadados, auditoria, gabaritos e fila de exportação.
3. [Repositório GitHub — Plataforma de Questões](https://github.com/RodrigoRosaDantas/plataforma-questoes)
   - Código, workflows, dados derivados, documentação e histórico versionado.
4. [Site público — Plataforma de Questões](https://rodrigorosadantas.github.io/plataforma-questoes/)
   - Release publicada no GitHub Pages.

### Fluxo de publicação

```text
Notion — Banco Mestre
        ↓
GitHub Actions — sincronização e validação
        ↓
data/questions.json e taxonomias derivadas
        ↓
GitHub Pages / PWA
```

O navegador não recebe o token do Notion. O conteúdo editorial é materializado
no GitHub por workflow server-side; o progresso do estudante permanece separado.

## 2. Bases específicas do Notion

Estas bases e páginas são fontes editoriais auxiliares ou recortes temáticos:

- [Banco de Questões — SEDES/DF TDAS](https://app.notion.com/p/3a6cf5a2673181e08936c3d8cdca13d8?pvs=1)
- [S02 — Questões | PODC](https://app.notion.com/p/3a9cf5a2673181279138e0038d6a9a87?pvs=1)
- [S02 — Material Premium | PODC](https://app.notion.com/p/3a9cf5a267318173bdc6cf7b829c10aa?pvs=1)
- [Painel S02 — PODC](https://app.notion.com/p/3a9cf5a2673181aa9ffdcedff79b5db2?pvs=1)
- [PE73 — Programas sociais, benefícios e vulnerabilidades](https://app.notion.com/p/364cf5a2673181d595aecbb026718f79?pvs=1)
- [Questões Diárias — EDAS/Administração](https://app.notion.com/p/365cf5a26731816f9283f251480f91b7?pvs=1)

Não é necessário cadastrar cada página individual de questão como fonte. O
Banco Mestre funciona como fonte agregadora e reduz duplicidade e ruído.

## 3. Acessos técnicos e de integração

São atalhos administrativos, não fontes de conteúdo:

- [Integrações do Notion](https://www.notion.so/profile/integrations)
- [GitHub Actions](https://github.com/RodrigoRosaDantas/plataforma-questoes/actions)
- [Configurações das Actions](https://github.com/RodrigoRosaDantas/plataforma-questoes/settings/actions)
- [Secrets das Actions](https://github.com/RodrigoRosaDantas/plataforma-questoes/settings/secrets/actions)

O endereço de Secrets é apenas um atalho de manutenção. Nunca registrar neste
repositório o valor de `NOTION_TOKEN`, chaves de integração ou qualquer outro
secret. Os nomes de configuração podem aparecer na documentação; os valores
devem permanecer exclusivamente no GitHub Actions.

## 4. Ordem recomendada de consulta

1. Banco Mestre do Notion;
2. página central editorial;
3. repositório GitHub;
4. site público publicado;
5. protocolo editorial e documentação do projeto;
6. provas e gabaritos oficiais;
7. páginas específicas de recorte, como S02 e PE73;
8. legislação, manuais e demais fontes normativas oficiais.

## 5. Regra de atualização

- O Notion é a fonte de verdade do conteúdo editorial.
- O GitHub contém a release derivada, a aplicação e os mecanismos de validação.
- O site público exibe apenas a release publicada.
- O Supabase, quando usado, armazena somente o estado do estudo do usuário.
- Alterações no conteúdo devem passar pela sincronização e pelos gates editoriais.
- Não alterar manualmente `data/questions.json` para substituir a fonte editorial.
- Links, tokens e dados privados não devem ser incorporados ao frontend.

## 6. Correção de referências antigas

O material de origem citava o antigo repositório `sedes-df-questoes`. Como o
projeto atual está consolidado em `plataforma-questoes`, este índice usa os
links atuais do GitHub e do GitHub Pages. O conteúdo histórico da SEDES/DF foi
preservado no acervo, sem voltar a definir a identidade da plataforma.
