# Inventory Management App

Sistema de inventário para registrar entradas, saídas e correções com histórico auditável.

## Arquitetura

- React + Vite hospedado no Cloudflare Pages.
- Supabase Auth para login por e-mail e senha.
- Supabase Postgres com RLS para isolar os dados da operadora.
- Funções SQL transacionais para impedir divergências e saldo negativo.
- O saldo nunca é calculado ou persistido diretamente pelo navegador.

## Desenvolvimento local

1. Instale as dependências:

   ```powershell
   npm install
   ```

2. Copie `.env.example` para `.env.local` e informe a URL e a chave publicável do Supabase. Nunca coloque uma chave `service_role` em variáveis `VITE_*`.

3. Inicie a aplicação:

   ```powershell
   npm run dev
   ```

## Preparar o Supabase

1. Crie ou escolha o projeto e autentique o Supabase CLI.
2. Vincule este repositório e aplique a migration:

   ```powershell
   npx supabase link --project-ref SEU_PROJECT_REF
   npx supabase db push
   ```

3. No painel do Supabase, crie a única operadora em **Authentication > Users**. O cadastro público não é oferecido pela aplicação.
4. Execute os advisors de segurança e desempenho depois de aplicar a migration:

   ```powershell
   npx supabase db advisors
   ```

As tabelas expostas possuem RLS. Usuários anônimos não recebem acesso, e usuários autenticados acessam somente linhas cujo `owner_id` corresponda ao seu usuário.

## Migrar os dados antigos

Primeiro execute apenas a conferência:

```powershell
$env:LEGACY_FUNCTION_URL="https://PROJECT.supabase.co/functions/v1/make-server-6a5c4630"
$env:LEGACY_SUPABASE_ANON_KEY="CHAVE_PUBLICA_ANTIGA"
npm run migrate:legacy
```

O comando cria `migration-report.json` e não grava no banco. A importação é bloqueada se houver produtos duplicados, movimentações órfãs ou saídas sem uma entrada anterior correspondente. Quando o saldo legado divergir, o saldo de destino é recalculado exclusivamente pelo histórico preservado.

Depois de conferir o relatório:

```powershell
$env:NEW_SUPABASE_URL="https://PROJECT.supabase.co"
$env:NEW_SUPABASE_SERVICE_ROLE_KEY="CHAVE_DE_SERVICO_NOVA"
$env:OPERATOR_USER_ID="UUID_DA_OPERADORA"
$env:MIGRATION_APPLY="true"
npm run migrate:legacy
```

A chave de serviço só deve ser usada nesse processo local e removida do terminal ao final.

## Cloudflare Pages

O projeto usa upload direto no Cloudflare Pages. Publique um preview com:

```powershell
npm run build
npx wrangler pages deploy dist --project-name inventory-management-app --branch preview
```

O preview atual fica em `https://preview.inventory-management-app.pages.dev`. Promova para produção somente depois de validar os totais migrados e os fluxos de entrada, saída e correção.

## Desativar o backend antigo

Depois da migração e da validação do preview:

1. Remova a Edge Function antiga `make-server-6a5c4630` do projeto Supabase.
2. Remova a tabela legada `kv_store_6a5c4630` e seus índices.
3. Revogue a chave secreta usada na migração em **Settings > API Keys**.
4. Confirme que somente as tabelas novas e as RPCs autorizadas permaneçam acessíveis.

## Verificação

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e
```
