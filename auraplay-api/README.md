# AuraPlay API

Backend HTTP/JSON do AuraPlay, construído com Next.js, TypeScript e App Router para deploy na Vercel. O aplicativo .NET MAUI deve acessar somente esta API; não deve consultar diretamente AniList, Jikan, Supabase ou o futuro provedor de reprodução.

## Estado atual

O backend possui catálogo AniList persistido, fallback seletivo Jikan, busca local, rotas públicas, sincronização protegida, locks e registros de jobs. A integração Kenjitsu usa Anikoto como provider principal e Anizone como fallback controlado; sem configuração explícita, o sistema continua usando `PlaceholderProvider`.

Não existem scraping, episódios fictícios, bypass de DRM ou links de reprodução inventados. Os adapters usam somente endpoints documentados pelo Kenjitsu.

## Arquitetura

```text
.NET MAUI
    │ HTTPS/JSON
    ▼
Next.js na Vercel
    ├── Supabase PostgreSQL (catálogo persistente)
    ├── AniList GraphQL (fonte principal de metadados)
    ├── Jikan REST (fallback seletivo por MAL ID)
    └── EpisodeProvider (Placeholder ou KenjitsuProvider com adapter selecionado)
```

Rotas GET nunca iniciam sincronização. Catálogo, provider e episódios são fluxos internos independentes protegidos por `SYNC_SECRET`.

## Requisitos

- Node.js 22 ou superior; o script inicial usa `--env-file-if-exists`.
- npm 10 ou superior.
- Projeto Supabase.
- Conta Vercel para publicação.

## Instalação local

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

A API estará disponível em `http://localhost:3000`. Nunca versione `.env.local`.

## Variáveis de ambiente

| Variável | Obrigatória | Uso atual |
|---|---:|---|
| `SUPABASE_URL` | Sim | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Acesso privilegiado exclusivamente no servidor |
| `SYNC_SECRET` | Sim | Bearer token das rotas internas; mínimo de 16 caracteres |
| `ANILIST_GRAPHQL_URL` | Sim | Endpoint GraphQL oficial do AniList |
| `JIKAN_BASE_URL` | Sim | Base da API Jikan v4 |
| `EPISODE_PROVIDERS` | Não | Lista ordenada; recomendado `anikoto,anizone`. Quando presente, prevalece sobre a variável antiga |
| `EPISODE_PROVIDER` | Não | Compatibilidade antiga para seleção individual de `anikoto` ou `anizone` |
| `EPISODE_PROVIDER_BASE_URL` | Para Kenjitsu | `https://auraplay-kenjitsu.vercel.app` |
| `EPISODE_PROVIDER_API_KEY` | Não | Reservada para adaptador autorizado |
| `EPISODE_PROVIDER_USERNAME` | Não | Reservada para adaptador autorizado |
| `EPISODE_PROVIDER_PASSWORD` | Não | Reservada para adaptador autorizado |
| `LOG_LEVEL` | Sim | `debug`, `info`, `warn` ou `error` |
| `APP_ENV` | Sim | `development`, `test` ou `production` |

Não use prefixo `NEXT_PUBLIC_` em Service Role, segredo de sync ou credenciais do provider.

## Supabase e migration

O schema inicial está em `supabase/migrations/001_initial_schema.sql`. A migration de segurança `supabase/migrations/002_restrict_internal_function_execute.sql` revoga a execução pública das funções internas de manutenção e mantém `EXECUTE` da função por ID somente para `service_role`. Ela não altera schema, dados, RLS, triggers nem o corpo das funções. O MAUI não acessa essas tabelas diretamente.

### SQL Editor

1. Crie um projeto no Supabase.
2. Abra **SQL Editor → New query**.
3. Em banco novo, aplique `001_initial_schema.sql` e depois `002_restrict_internal_function_execute.sql`, nessa ordem.
4. Confira cada execução antes de avançar. Em banco existente, aplique somente as migrations ainda pendentes.

### Supabase CLI

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
```

O arquivo já está em `supabase/migrations`, portanto `db push` aplica a migration pendente. Não reaplique manualmente em um banco que já registrou essa versão.

## Comandos

```bash
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
npm run sync:initial
```

`sync:initial` chama os mesmos services das rotas internas, sem HTTP. Ele carrega 20 itens por seção do AniList e registra jobs. Quando nenhum provider real estiver configurado, o resultado geral esperado é `PARTIAL`, com catálogo `SUCCEEDED` e provider/episódios `PARTIAL`.

## Formato das respostas

Sucesso:

```json
{
  "success": true,
  "data": {},
  "meta": { "requestId": "00000000-0000-4000-8000-000000000000" }
}
```

Erro:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Parâmetros inválidos.",
    "requestId": "00000000-0000-4000-8000-000000000000"
  }
}
```

O mesmo `requestId` é devolvido no header `x-request-id`. Stack traces e detalhes internos não são retornados.

## Rotas públicas

| Método e rota | Descrição |
|---|---|
| `GET /api/health` | Estado leve do banco e provider; AniList aparece como `degraded` porque health não faz consulta externa |
| `GET /api/home` | Seções persistidas no Supabase; nunca sincroniza durante o GET |
| `GET /api/search?q=...&page=1&limit=20` | Busca apenas o índice local; consulta de 2–100 caracteres, limite máximo 50 |
| `GET /api/search/remote?q=...&page=1&limit=20` | Descoberta remota somente leitura no AniList; não persiste nem inicia sincronização |
| `GET /api/anime/{id}` | Metadados, aliases, relações e temporadas existentes; aceita UUID interno ou AniList ID |
| `GET /api/episodes/{animeId}` | Episódios previamente sincronizados, agrupados por temporada |
| `GET /api/playback/{episodeId}` | Valida episódio/fonte persistidos e resolve playback no provider correspondente; falhas são controladas |

Playback possui rate limit local de 20 solicitações por minuto por cliente. Em ambiente serverless, esse contador em memória é apenas uma proteção por instância; uma solução distribuída será necessária antes de produção em escala.

### Contrato e dados transitórios de playback

`providerSourceId` é o único identificador de fonte persistido. A fonte persistida contém apenas identidade do provider, servidor, áudio, qualidade e disponibilidade; ela não contém a mídia resolvida.

URLs de vídeo e legenda, headers (incluindo `Referer` e `Authorization`), cookies, tokens e assinaturas existem somente durante a resolução do playback. Esses valores nunca devem ser persistidos nem armazenados como cache permanente. O contrato admite múltiplas fontes resolvidas, legendas normalizadas, intro/outro, HLS, áudio selecionado, idioma, poster, tracks auxiliares e `qualities[]` opcional, sem exigir seletor de qualidade no MAUI.

`RAW` representa áudio original e não deve ser convertido em `SUB` ou `MULTI`. O banco atual não possui `RAW` no enum SQL; portanto nenhum valor `RAW` poderá ser persistido até que uma estratégia de armazenamento seja autorizada em fase própria.

## Rotas internas

| Método e rota | Fluxo |
|---|---|
| `POST /api/internal/sync/catalog` | AniList → catálogo Supabase |
| `POST /api/internal/sync/provider` | Catálogo do provider; `PARTIAL` com placeholder |
| `POST /api/internal/sync/episodes` | Episódios do provider; `PARTIAL` com placeholder |
| `POST /api/internal/sync/all` | Catálogo → provider → episódios |
| `POST /api/internal/anime/import` | Importa ou atualiza um anime canônico por AniList ID |
| `POST /api/internal/anime/{animeId}/sync-provider` | Descobre e persiste associações do anime nos providers configurados |
| `POST /api/internal/anime/{animeId}/sync-episodes` | Sincroniza em lote/cursor os episódios do anime e provider selecionado |

Autenticação obrigatória:

```http
Authorization: Bearer SEU_SYNC_SECRET
Content-Type: application/json
```

Exemplo de payload sem credenciais:

```json
{
  "cursor": "cursor-opcional",
  "limit": 20
}
```

O limite aceito é 1–100. Segredos em query string são ignorados e a chamada recebe 401. As rotas possuem rate limit local de 10 solicitações por minuto por cliente.

Para um provider real, a sincronização de episódios também exige:

```json
{
  "limit": 20,
  "target": {
    "providerKey": "provider-autorizado",
    "providerAnimeId": "id-do-anime",
    "providerSeasonId": "id-da-temporada"
  }
}
```

## Integração com .NET MAUI

Registre um único `HttpClient` apontando para a URL desta API. Não inclua Service Role ou `SYNC_SECRET` no aplicativo.

```csharp
using System.Net.Http.Json;

public sealed class AuraPlayApiClient(HttpClient http)
{
    public Task<ApiEnvelope<HomeResponse>?> GetHomeAsync(CancellationToken ct = default) =>
        http.GetFromJsonAsync<ApiEnvelope<HomeResponse>>("api/home", ct);

    public Task<ApiEnvelope<List<AnimeCard>>?> SearchAsync(string query, int page = 1, CancellationToken ct = default) =>
        http.GetFromJsonAsync<ApiEnvelope<List<AnimeCard>>>(
            $"api/search?q={Uri.EscapeDataString(query)}&page={page}&limit=20", ct);

    public Task<ApiEnvelope<EpisodesResponse>?> GetEpisodesAsync(string animeId, CancellationToken ct = default) =>
        http.GetFromJsonAsync<ApiEnvelope<EpisodesResponse>>(
            $"api/episodes/{Uri.EscapeDataString(animeId)}", ct);
}

public sealed record ApiEnvelope<T>(bool Success, T? Data, ApiMeta? Meta, ApiError? Error);
public sealed record ApiMeta(string RequestId);
public sealed record ApiError(string Code, string Message, string RequestId);
```

Os modelos `HomeResponse`, `AnimeCard` e `EpisodesResponse` devem refletir o JSON das rotas. O MAUI decide a interface pelo `playbackStatus`, sem tentar hidratar ou corrigir catálogo por conta própria.

## Deploy na Vercel

1. Importe este diretório como projeto Vercel.
2. O framework será detectado como Next.js.
3. Em **Project Settings → Environment Variables**, cadastre todas as variáveis obrigatórias para Production, Preview e Development conforme necessário.
4. Marque Service Role, `SYNC_SECRET` e futuras credenciais do provider como sensíveis.
5. Antes do primeiro deploy, gere valores novos para `SUPABASE_SERVICE_ROLE_KEY` e `SYNC_SECRET`; não reutilize valores que tenham sido expostos durante desenvolvimento.
6. Após autorização explícita, execute o deploy e valide `/api/health`.
7. Execute `npm run sync:initial` somente em uma operação autorizada, localmente com o ambiente de produção, ou invoque a rota interna por um agendador seguro.

Rotas de sync aceitam lotes/cursor e não pressupõem memória persistente. Um agendador deve enviar o Bearer header; nunca coloque o segredo na URL.

## Cache e resiliência

- AniList: a consulta de catálogo da Home usa cache local de 15 minutos, timeout de 10 segundos e retry limitado para falhas temporárias.
- Jikan: cache local de 24 horas, uma requisição concorrente, espaçamento mínimo de 350 ms e suporte a `Retry-After`.
- Jikan só é consultado por MAL ID quando um campo permitido está ausente; sua falha preserva o AniList.
- A Home sempre lê o último catálogo persistido e marca dados com mais de 30 minutos como `stale`.
- Cache em memória é apenas otimização; funções serverless podem reiniciar.

## Integração Kenjitsu

`KenjitsuProvider` delega para `AnikotoAdapter` ou `AnizoneAdapter`. O cliente HTTP comum aplica timeout, concorrência limitada, validação Zod e retry somente para falhas temporárias, incluindo HTTP 429 com `Retry-After`.

Configuração recomendada:

```dotenv
EPISODE_PROVIDERS=anikoto,anizone
EPISODE_PROVIDER_BASE_URL=https://auraplay-kenjitsu.vercel.app
```

Se `EPISODE_PROVIDERS` estiver ausente, `EPISODE_PROVIDER=anikoto` ou `EPISODE_PROVIDER=anizone` continua aceito. AnimePahe não é registrado nem selecionável pela factory nesta instalação.

O fallback Anikoto → Anizone ocorre somente quando o principal está indisponível, retorna vazio ou não encontra o anime. Erros internos de validação, configuração/autenticação e ambiguidades não acionam fallback. Episódios e playback sempre usam exclusivamente o adapter indicado pelo `providerKey` persistido; IDs de providers diferentes nunca são intercambiados.

As listas planas de episódios usam uma temporada técnica determinística `default`, pois os três providers não documentam temporadas. URLs, headers e legendas são resolvidos somente durante playback. `selectedSourceId` sempre aponta explicitamente para uma entrada de `sources[]`; não existe seleção implícita por posição. Não existem tabelas `audio_tracks` ou `subtitle_tracks` nesta versão.

## Segurança

- Service Role é lida somente em `src/lib/supabase/server.ts`.
- Após a remoção do marcador `server-only` para suportar o script `tsx`, uma guarda explícita bloqueia o cliente quando `window` existe.
- O cliente privilegiado não é exportado por módulos de frontend.
- RLS está habilitado e não há políticas públicas de escrita.
- Autenticação interna usa Bearer header e comparação temporal segura.
- Logs de sync armazenam códigos sanitizados, contagens e duração, não credenciais ou URLs de playback.
- `.env.local`, `.npm-cache`, `node_modules` e `.next` estão ignorados.

## Limitações conhecidas

1. Sem `EPISODE_PROVIDERS` (ou a variável legada `EPISODE_PROVIDER`) e `EPISODE_PROVIDER_BASE_URL`, o sistema usa `PlaceholderProvider`; provider e episódios retornam `PARTIAL` e playback retorna `PROVIDER_NOT_CONFIGURED`.
2. A descoberta genérica e os sinks/repositories idempotentes de provider, temporadas, episódios e fontes estão implementados; o preenchimento depende de sincronização interna explicitamente autorizada.
3. A substituição de entradas do catálogo não é atômica: `CatalogRepository` apaga a seção e faz o upsert em uma segunda operação. Se o segundo comando falhar, a seção pode ficar vazia. A correção futura recomendada é RPC transacional ou catálogo versionado/staging, mediante migration autorizada.
4. A resolução de playback depende da disponibilidade do provider e de uma associação/fonte estável previamente persistida; URLs e headers resolvidos nunca são persistidos.
5. Rate limits e caches em memória não são compartilhados entre instâncias Vercel.
6. AnimePahe não está disponível nem registrado nesta instalação.
7. Health não consulta AniList para evitar chamada externa no endpoint leve; informa `degraded` para essa dependência.
8. Não há autenticação de usuário, favoritos ou histórico nesta versão.

## Solução de problemas

- **401 nas rotas internas:** confirme o header Bearer e o mesmo `SYNC_SECRET` configurado no servidor.
- **`PROVIDER_NOT_CONFIGURED`:** nenhum provider real foi configurado ou a fonte persistida aponta para um provider indisponível.
- **Home vazia:** aplique a migration e execute `npm run sync:initial`.
- **Sync `LOCKED`:** outro job do mesmo escopo está ativo; aguarde a expiração/liberação do lock.
- **Sync `PARTIAL`:** confira o campo `metadata.reason`; com placeholder é esperado.
- **Erro de ambiente:** copie `.env.example` e preencha somente `.env.local`/Vercel.
- **Falha de build:** execute `npm install`, depois lint, typecheck, testes e build em sequência.

## Próximas fases

Antes do deploy de produção:

1. Revisar este relatório final e confirmar a rotação da `SUPABASE_SERVICE_ROLE_KEY` e do `SYNC_SECRET`.
2. Autorizar explicitamente um deploy Preview sem segredos reais no repositório.
3. Configurar as variáveis sensíveis diretamente na Vercel, separadas por ambiente.
4. Validar health, rotas públicas e autenticação interna no Preview sem executar sincronização em massa.
5. Somente depois autorizar o deploy de produção e a sincronização inicial controlada.
