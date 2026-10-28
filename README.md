# MyJobs

Aplicação pessoal de procura e gestão de emprego, criada com Astro, TypeScript e CSS. Independente do portfolio e de outros projectos.

## Estado actual

A interface inclui um dashboard dinâmico calculado a partir dos dados persistidos localmente e um motor de pesquisa local com filtros combináveis, ordenação por relevância textual/data/salário, carregamento progressivo e dados fictícios identificados. As páginas de procura e oportunidades guardadas partilham os favoritos locais. As pesquisas também podem ser guardadas, executadas novamente, renomeadas e removidas.

A pesquisa usa oportunidades estáticas de demonstração em `src/data/opportunities-demo.ts`; não consulta fontes externas nem representa vagas reais. Os favoritos e pesquisas são guardados em `localStorage`. O perfil profissional da Fase 2 é lido através da sua camada de acesso, sem alterar o armazenamento ou apagar dados.

Os tipos de oportunidade estão em `src/types/opportunity.ts`; pesquisa, normalização e detecção de duplicados estão em `src/lib/opportunity-search.ts`; persistência está em `src/lib/opportunity-storage.ts` e `src/lib/opportunity-service.ts`. A interface usa a preferência PT/EN já guardada pelo perfil.

### Fontes de oportunidades

`src/types/opportunity-source.ts` define o contrato comum de fontes paginadas, preparado para fontes futuras como IEFP e EURES. O adaptador ITJobs está isolado em `src/lib/sources/itjobs/`: `itjobs-client.ts` valida paginação/respostas e exige transporte e chave explicitamente injectados; `itjobs-mapper.ts` converte os campos documentados para `JobOpportunity`; `itjobs-source.ts` adapta o cliente ao contrato comum. `src/lib/opportunity-sources.ts` agrega fontes quando chamado explicitamente e apenas reporta candidatos a duplicado, sem remover anúncios.

Esta preparação não é activada pela interface nem pela pesquisa actual. O cliente não usa `fetch` global e nenhum transporte é configurado pelo produto. A documentação oficial indica `POST https://api.itjobs.pt/job/search.json` com `api_key`, `q`, `page` e `limit` no corpo do pedido; por isso, a activação futura deve ocorrer exclusivamente num backend Cloudflare Worker com a chave como secret, nunca no browser. Resultados com campos opcionais ausentes permanecem desconhecidos, não recebem URL construída a partir do `slug`, nem competências ou áreas inferidas. Os anúncios ITJobs são marcados como externos (`isDemo: false`, `source: ITJobs`), separados dos demonstrativos (`isDemo: true`).

Os testes usam exclusivamente transportes injectados e respostas fictícias locais; não contactam a ITJobs.

### Worker ITJobs (preparação, não activado)

O Worker independente está em `src/worker/`, com entrada em `src/worker/index.ts` e handler testável em `src/worker/itjobs-search.ts`. Aceita apenas `POST /api/itjobs/search` com `{ "query": "...", "page": 1, "limit": 20 }`. Valida o corpo até 4 KiB, pesquisa até 120 caracteres, página entre 1 e 1000 e limite entre 1 e 50. Usa o `ITJobsClient` existente, com timeout de 8 segundos, e devolve apenas oportunidades normalizadas e erros públicos genéricos.

O CORS exige correspondência exacta com `ALLOWED_ORIGIN`; não permite credenciais e restringe métodos/cabeçalhos. O Worker falha fechado se faltar a origem ou a chave. `wrangler.toml` declara `ITJOBS_API_KEY` como secret requerido, não contém a chave, desactiva `workers.dev` e não define rota. `.dev.vars*` está excluído do Git. O handler não está ligado ao Astro nem à pesquisa actual.

A camada de identidade valida no Worker o `Cf-Access-Jwt-Assertion` emitido por uma aplicação Cloudflare Access: assinatura RS256 contra as chaves públicas Access, `iss`, `aud`, `exp`, `nbf`, tipo de token e `sub`. As chaves públicas são obtidas do endpoint oficial de certificados do domínio Access e mantidas em cache por cinco minutos; não são segredos. O binding `SEARCH_LIMITER` limita cada identidade autenticada a 20 pedidos por 60 segundos, usando o hash SHA-256 do `sub` como chave. A configuração ainda não contém domínio Access, audience tag, origem permitida ou credenciais de utilizador; o endpoint falha fechado até essas opções serem configuradas.

Antes de qualquer activação futura, ainda será necessário criar e proteger uma aplicação Cloudflare Access, configurar o domínio, audience tag e origem, guardar a chave no secret do Worker e confirmar que o `namespace_id` do rate limiter está disponível na conta. O rate limit nativo é aproximado e aplicado por localização Cloudflare, não constitui um limite global exacto. A autenticação Access protege o endpoint; CORS é apenas uma política de browser. Esta fase não configura credenciais, serviços, domínio nem deploy.

## Requisitos

Node.js LTS e npm.

## Desenvolvimento local

```bash
npm install
npm run dev
```

O Astro apresenta o endereço local no terminal (normalmente http://localhost:4321).

## Testes e build

```bash
npm test
npx astro check
npm run build
npm run preview
```

## Estrutura

- `src/pages/` — páginas e rotas.
- `src/components/` — navegação, cabeçalho e cartões existentes.
- `src/data/` — conjunto de oportunidades demonstrativas.
- `src/types/` — modelos tipados do perfil e das oportunidades.
- `src/lib/` — pesquisa, fontes, normalização, perfil, interface e armazenamento.
- `src/scripts/` — interacções das páginas de perfil, pesquisa e favoritos.
- `src/styles/global.css` — identidade visual e regras responsivas.
- `tests/` — testes das camadas de dados, pesquisa e adaptadores de fontes.

## Limitações desta fase

Não há chamadas de API activadas, integração na interface, scraping, autenticação ou análise por IA. O Worker desta fase é apenas uma estrutura independente e não publicada. CORS não substitui autenticação nem controlo contra abuso. A ordenação salarial não converte moedas. Os dados persistidos no navegador não são sincronizados entre dispositivos.

## Fase 5 — arquivo local e candidaturas

Guardados e Candidaturas consultam um arquivo versionado de anúncios completos, identificado por origem e ID. A migração copia favoritos recuperáveis do catálogo sem apagar as chaves anteriores; IDs sem anúncio e registos inválidos são preservados e sinalizados. Arquivos ilegíveis ou de versão desconhecida bloqueiam escrita.

Os seis estados de candidatura e notas (até 20 000 caracteres) são guardados explicitamente, com data de actualização. Retirar um favorito oculta-o em Guardados, conservando o anúncio e as notas em Candidaturas. As páginas permitem pesquisa, ordenação, consulta integral e abertura segura do URL original quando disponível. Nenhuma candidatura é enviada.

A pesquisa continua demonstrativa. O arquivo aceita snapshots externos normalizados, mas nenhuma fonte externa foi activada. Tudo fica no navegador, sem sincronização, encriptação ou garantia contra limpeza do armazenamento. Não guardar informação sensível. A interface de gestão desta fase está em português; os cartões respeitam o idioma existente.

## Fase 6 — dashboard local

O dashboard calcula o total do arquivo, favoritos activos e contagens dos estados actuais Enviada, Entrevista e Proposta. Favoritos são um subconjunto do arquivo; estados não são totais históricos acumulados. Actividade recente mostra a última fotografia de até cinco registos, ordenada por actualização, recolha ou publicação disponível, sem fabricar datas ou histórico. Os links abrem o registo correspondente em Guardados ou Candidaturas. Actualiza ao regressar, recarregar ou receber alterações de outra janela. Dados ilegíveis são preservados e geram aviso; a fonte de pesquisa continua demonstrativa e não são activadas APIs externas.

## Fase 7 — demonstração estática

Build: npm run build. Publicar futuramente apenas dist, sob /myjobs/ (GitHub Pages), nunca a pasta de código. npm run preview permite verificar /myjobs/ e as sete rotas internas com barra final. Inclui 404 e .nojekyll. Ainda não existe publicação configurada.

Sem chamadas a ITJobs, Worker, autenticação ou IA. Os módulos de integração permanecem no código-fonte, isolados do bundle público. Usar apenas informação fictícia no perfil e notas. Não há backend nem sincronização.

A demonstração usa chaves myjobs:demo:v1: distintas das antigas jobfinder:, que ficam intactas. Começa sem arquivo. Repor exemplos coloca quatro anúncios fictícios no arquivo após confirmação, substituindo apenas exemplos e respectivas notas/estados; Retirar exemplos deixa o arquivo demonstrativo vazio. Ambas preservam perfil, pesquisas, registos não demonstrativos e outros dados do domínio. Limpar perfil é uma operação separada na página Perfil. Dados locais podem perder-se ao limpar o navegador e não são armazenamento seguro.
