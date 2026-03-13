# Car Search With Mastra

Aplicacao full-stack em TypeScript com Next.js + Mastra para busca de carros com chat de consultoria.

## Requisitos

- Node.js 20+
- Chave da OpenAI em `OPENAI_API_KEY`
- Modelo configuravel em `OPENAI_MODEL` (padrao: `openai/gpt-4o-mini`)

## Como rodar

1. Instale dependencias:

```bash
npm install
```

2. Configure variaveis:

```bash
cp .env.example .env.local
```

3. Rode em desenvolvimento:

```bash
npm run dev
```

4. Acesse `http://localhost:3000`.

## Arquitetura

- `src/domain`: tipos de dominio.
- `src/application`: regras de negocio e orquestracao de chat.
- `src/infrastructure`: acesso ao `cars.json`.
- `src/mastra`: agente e tools do Mastra.
- `src/app`: frontend e API route.
- `public`: arquivos estaticos servidos diretamente pelo Next.js.

## Imagens dos carros

Para imagens locais dos carros, use a pasta `public/images/cars`.

Exemplo:

```text
public/images/cars/byd-dolphin.jpg
```

No `data/cars.json`, referencie com caminho absoluto a partir de `public`:

```json
{
  "Name": "BYD",
  "Model": "Dolphin",
  "Image": "/images/cars/byd-dolphin.jpg",
  "Price": 99990,
  "Location": "Sao Paulo"
}
```

## Comportamentos de busca

- Match exato: retorna carros aderentes aos filtros.
- Mismatch de preco: sugere opcoes proximas e argumenta valor.
- Mismatch de localizacao: recomenda mesmo assim, destacando entrega/reserva.
