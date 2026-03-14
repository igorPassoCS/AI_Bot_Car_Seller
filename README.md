# Car Search With Mastra

Aplicação full-stack em TypeScript com Next.js + Mastra para busca de carros com chat de consultoria.

## Sumário

- [Requisitos](#requisitos)
- [Tecnologias utilizadas](#tecnologias-utilizadas)
- [Decisões técnicas principais e experiência do usuário](#decisões-técnicas-principais-e-experiência-do-usuário)
- [Plano de Negócios](#-plano-de-negócios)

# Requisitos

- Node.js 20+ instalado na máquina
- `npm` disponível no terminal
- Chave da OpenAI para habilitar o chat com IA em `OPENAI_API_KEY`
- Modelo configurável em `OPENAI_MODEL` (padrão: `openai/gpt-4o-mini`)

## Links da demonstração

- Vídeo de demonstração: https://drive.google.com/file/d/1Ib0wQsDx0Z66tNI-RwUdi9TMmvLMBRqL/view?usp=sharing
- Aplicação deployada (não funcioana corretamente pois não está linkada à uma API key, mas está deployada da mesma forma): https://ai-bot-car-seller-5qqyq3vfu-igorpassocs-projects.vercel.app/

## Como rodar localmente

1. Entre na pasta do projeto:

```bash
cd /caminho/do/projeto
```

2. Instale as dependências:

```bash
npm install
```

3. Crie o arquivo de variáveis de ambiente com base no exemplo:

```bash
cp .env.example .env.local
```

4. Edite o arquivo `.env.local` e preencha pelo menos estas variáveis:

```env
OPENAI_API_KEY=sua_chave_real_da_openai
OPENAI_MODEL=openai/gpt-4o-mini
CARS_DATA_PATH=data/cars.json
```

Observações:

- `OPENAI_API_KEY` é necessária para o chat funcionar corretamente.
- `OPENAI_MODEL` pode ser mantido como está, caso você queira usar o modelo padrão do projeto.
- `CARS_DATA_PATH` aponta para a base local de carros e normalmente não precisa ser alterada.

5. Rode em desenvolvimento:

```bash
npm run dev
```

6. Abra no navegador a URL exibida no terminal.

Na maioria dos casos será `http://localhost:3000`, mas se essa porta já estiver em uso o Next.js subirá em outra porta, como `3001` ou `3002`.

## Rodando em produção local

Se quiser validar a build de produção localmente:

1. Gere a build:

```bash
npm run build
```

2. Inicie o servidor:

```bash
npm run start
```

## Arquitetura

- `src/domain`: tipos de domínio.
- `src/application`: regras de negócio e orquestração de chat.
- `src/infrastructure`: acesso ao `cars.json`.
- `src/mastra`: agente e tools do Mastra.
- `src/app`: frontend e API route.
- `public`: arquivos estáticos servidos diretamente pelo Next.js.

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
- Mismatch de preço: sugere opções próximas e argumenta valor.
- Mismatch de localização: recomenda mesmo assim, destacando entrega/reserva.

# Tecnologias utilizadas

- Linguagem principal: TypeScript
- Frontend e backend web: Next.js 15 com App Router
- UI: React 19
- Estilização: Tailwind CSS 4
- Orquestração de agentes: Mastra (`@mastra/core`)
- Validação de dados: Zod
- Renderização de markdown no chat: `react-markdown`
- Animações de interface: Framer Motion
- Deploy: Vercel

# Decisões técnicas principais e experiência do usuário

O projeto foi pensado para funcionar como um consultor de vendas conversacional, e não apenas como um filtro estático de carros. Por isso, a decisão principal foi estruturar a experiência com uma lógica multiagente de IA, onde cada agente possui uma responsabilidade bem definida dentro da jornada de atendimento.

### Estratégia multiagente

- [Researcher](./src/mastra/agents/researcher-agent.ts): interpreta a mensagem do usuário, identifica intenções como busca, refinamento, comparação, rejeição e mudança de contexto, e organiza os critérios que devem ser usados na busca.
- [Tool `searchCars`](./src/mastra/tools/search-cars-tool.ts): executa a busca no estoque local com base nos filtros consolidados, aplicando critérios como preço, localização, marca, modelo e exclusões.
- [Closer](./src/mastra/agents/closer-agent.ts): transforma o resultado técnico da busca em uma resposta comercial mais natural, explicando opções, contornando objeções quando faz sentido e respeitando o contexto da conversa.
- [Orquestrador](./src/application/services/chat-orchestrator.ts): conecta memória de conversa, workflow e fallback determinístico, garantindo que o sistema mantenha contexto entre turnos e continue funcional mesmo se alguma etapa agêntica falhar. O workflow principal que integra essas etapas está em [car-sales-workflow.ts](./src/mastra/workflows/car-sales-workflow.ts).

Essa divisão ajuda a manter o comportamento mais previsível, facilita manutenção e torna mais simples evoluir cada parte do fluxo sem misturar interpretação, busca e persuasão no mesmo bloco de lógica.

### Estratégias implementadas na experiência

- Interface inspirada em produtos conversacionais modernos: a tela foi desenhada para lembrar a fluidez de uso do Gemini, mas com identidade visual adaptada ao contexto da Klubi.
- Visual com identidade da marca: elementos como lguardaogo, cores de destaque e acabamento do layout foram ajustados para deixar a experiência mais coerente com uma apresentação de produto.
- Ações rápidas por botões: foram adicionados botões com frases prontas para reduzir atrito no primeiro uso e facilitar a validação de cenários principais sem depender de digitação manual.
- Conversa com memória de curto prazo: o sistema  filtros atuais, último carro relevante e itens rejeitados para permitir refinamentos naturais como "mais barato", "no Rio" ou "não quero esse".
- Persuasão com limite: o agente comercial pode defender uma opção uma vez (mesmo que você peça para ele carros mais baratos, ele vai tentar de primeira ser persuasivo, depois pode ser mais flexível e trazer outras opções de veículos) , mas depois precisa pivotar para novas alternativas, para que a experiência pareça consultiva em vez de insistente.
- Fallback controlado: mesmo quando uma chamada agêntica falha, a aplicação tenta manter uma resposta útil, evitando que o usuário fique sem retorno.

### Como a experiência do usuário foi pensada

O foco principal foi reduzir fricção e fazer a busca parecer uma conversa assistida. Em vez de exigir que o usuário monte filtros formais, a interface aceita linguagem natural e tenta acompanhar a intenção dele ao longo da conversa. Isso melhora a sensação de continuidade e deixa o fluxo mais próximo de um atendimento real.

Ao mesmo tempo, a interface foi desenhada para ajudar tanto um usuário final quanto um avaliador do projeto. Os botões com frases prontas aceleram testes, os cards deixam as sugestões visuais e a organização do chat ajuda a entender rapidamente o que o sistema interpretou e o que foi oferecido como alternativa.

# Limitações

Como o objetivo deste projeto foi construir uma versão funcional em apenas 2 dias, algumas decisões priorizaram velocidade de entrega e clareza da demo, em vez de profundidade total de produto. Por isso, a aplicação ainda possui algumas limitações importantes:

- O estoque é local e controlado para demonstração, então a busca não está integrada a um inventário real de produção com atualização em tempo real.
- A memória conversacional foi pensada para resolver bem o contexto recente, mas ainda não cobre todos os casos complexos de referência a carros muito antigos da conversa.
- A estratégia de persuasão foi desenhada para ser previsível e segura na demo, então ela ainda é simples e não representa um motor comercial totalmente otimizado por métricas reais de conversão.
- A experiência está mais forte para os fluxos principais de descoberta, refinamento por preço e localização; cenários muito abertos ou ambíguos ainda podem exigir ajustes adicionais.
# 💼 Plano de Negócios 

## 1. Se você fosse lançar esse buscador no mercado, qual seria seu modelo de negócios?
    
Uma possibilidade que faz bastante sentido é adotar um modelo B2B white-label, oferecendo esse buscador integrado a um e-commerce completo para revendedoras de veículos. O foco seriam pequenos lojistas que ainda não possuem infraestrutura digital própria ou a expertise necessária para criar uma ferramenta de conversão tão eficiente. Para esse perfil de cliente, embora o filtro de 'diferentes localidades' talvez seja menos relevante, os agentes de persuasão e com capacidade de filtragem continuam gerando um valor enorme.

Quanto à monetização, acredito que o modelo de mensalidade (SaaS) é o caminho mais viável. Cobrar uma taxa variável sobre cada venda seria arriscado, já que em produtos de alto valor, como automóveis, o fechamento do negócio geralmente ocorre 'por fora' da plataforma, o que dificultaria o controle das comissões. Com o SaaS, garantimos uma receita previsível focada na entrega da tecnologia.

Pensei também no modelo de marketplace que possui vários lojistas diferentes, estilo WebMotors, mas entendo que a barreira de entrada é muito alta devido aos grandes players já consolidados. Por isso, o modelo de serviço direto para a loja é mais estratégico. Além disso, vejo um grande potencial em expandir essa inteligência para o chat do WhatsApp. Como é uma ferramenta que o público já domina, isso eliminaria grande parte do atrito tecnológico para usuários menos experientes e permitiria que o lojista recebesse o lead já qualificado diretamente no chat, agilizando a venda.

## 2. Como você atrairia seus primeiros usuários? (Estratégia de aquisição, canais, etc)

Minha estratégia inicial de aquisição seria baseada em **networking e indicações**. Eu focaria em contatos de pessoas conhecidas, como amigos de amigos que possuam revendas de veículos, pois sei que a confiança é um fator muito importante no começo dos projetos. Pediria uma introdução direta para facilitar a abordagem, seja com o dono ou com o responsável pela empresa.

Acredito que, como o normalmente os atuantes em nichos de mercado são bem conectados com seus pares, posso aproveitar o **efeito de rede**. Após entregar um trabalho de qualidade para o primeiro cliente (em um momento que o cliente já tem valor percebido), eu ofereceria uma comissão por indicação (modelo de afiliados) para que ele me conectasse a outros lojistas ou grupos de revendedores. Isso transformaria a satisfação do cliente em um canal de vendas.

Para o primeiro cliente especificamente, eu ofereceria a plataforma por um **valor simbólico**. É importante cobrar algo, mesmo que pouco, para garantir o comprometimento dele com a ferramenta e dar valor à solução. Em troca, estabeleceria um canal aberto para feedbacks constantes, permitindo que eu valide as funcionalidades e corrija bugs em um cenário real.

Assim que o produto estiver estável e com alguns casos de sucesso, eu começaria a escalar através de **anúncios online (tráfego pago)**. Eu mesmo criaria os primeiros criativos ou buscaria uma produção de baixo custo para testar quais abordagens convertem melhor antes de aumentar o investimento.
    
## 3. Qual seria sua estimativa de CAC (Custo de Aquisição de Cliente)?

(a seguir vou utilizar valores exemplares, o ponto importante da explicação são as formas do cálculo)

Minha estimativa de **CAC** seria dividida em duas fases distintas, acompanhando o amadurecimento do projeto. Na fase inicial de **networking e indicações**, o custo financeiro seria praticamente zero, mas o custo de tempo seria alto. Nesse momento, o CAC real seria o valor da **comissão** paga ao indicador. Se a mensalidade for, por exemplo, R$ 300, eu poderia oferecer os primeiros R$ 150 (50% do primeiro mês) como recompensa pela indicação, fixando meu CAC inicial de forma controlada e previsível.

Já na fase de **anúncios online**, o cálculo muda. Como o público-alvo é bem específico (donos de revendas), eu estimaria um custo por lead (CPL) entre R$ 10 e R$ 30. Considerando que nem todo lead vira cliente, se eu precisar de 10 conversas para fechar uma venda, meu CAC via tráfego pago ficaria em torno de R$ 100 a R$ 300. 

## 4. Qual seria sua proposta de LTV (Lifetime Value) e como você maximizaria isso?

Minha proposta de **LTV** é baseada em uma retenção média de pelo menos **12 a 18 meses**. Considerando uma mensalidade inicial de R$ 300 (podendo variar o preço, dependendo do tamanho da revendedora de carros), cada cliente traria um valor bruto entre R$ 3.600 e R$ 5.400. Como a arquitetura do projeto é escalável e o custo de nuvem seria otimizado, a maior parte desse valor se reflete em margem de lucro para o negócio.

Para maximizar esse LTV, eu focaria em três estratégias principais:

Primeiro, o **aumento da 'aderência' (stickiness)** do produto. Eu integraria o buscador diretamente no fluxo de trabalho do lojista, enviando leads qualificados automaticamente para o WhatsApp ou CRM dele. Quando uma ferramenta se torna o motor de vendas de uma empresa, o custo de substituição fica muito alto, o que reduz o cancelamento (churn).

Segundo, eu trabalharia com **planos de expansão**. À medida que a revenda cresce e aumenta o número de carros no estoque ou o volume de mensagens processadas pelos agentes da Mastra, eu ofereceria Tiers superiores (com benefício adicionais). Isso permite que eu aumente a receita vinda de um mesmo cliente sem precisar adquirir um novo.

Por fim, focaria em **prova de valor constante**. Através de relatórios mensais gerados automaticamente, eu mostraria ao lojista exatamente quantos leads foram convertidos graças à lógica de contorno de objeções dos meus agentes. Mostrar o ROI (Retorno sobre Investimento) de forma clara é a melhor maneira de garantir que o cliente veja a mensalidade como um investimento, e não como um custo.

## 5. Que tipo de monetização você considera viável para essa aplicação?

A monetização que considero mais viável é o modelo **SaaS com planos em tiers**, o que permite segmentar o valor entregue de acordo com a necessidade e o porte de cada revendedora.

No **Tier 1**, eu ofereceria a aplicação integrada diretamente ao site/e-commerce da loja. Esse plano seria focado em transformar a busca passiva do site em uma experiência de consultoria ativa, onde os agentes ajudam o usuário a encontrar o carro ideal e qualificam o lead antes mesmo dele chegar ao vendedor. É a porta de entrada para quem quer modernizar o site atual ou utilizar o site que desenvolvi integrado à inteligência de venda dos agentes.

Já no **Tier 2**, a solução seria totalmente integrada ao **WhatsApp**. Este é o plano premium, pois elimina completamente o atrito: o cliente não precisa navegar em um site, ele simplesmente conversa com o agente no app que já usa todo dia. Para o lojista, o valor é maior porque a taxa de resposta e conversão no WhatsApp é drasticamente superior a qualquer formulário de site.

Além dessa divisão por funcionalidades, a mensalidade seria **variável conforme o porte da empresa**. Eu adotaria uma métrica de escala, como o volume de estoque ou a quantidade de leads processados. Assim, consigo cobrar um valor acessível de pequenas revendas que estão começando, garantindo que o produto não seja caro para elas, ao mesmo tempo em que capturo mais valor de grandes concessionárias que possuem um fluxo intenso e extraem mais proveito da automação

## 6. Há alguma estratégia de retenção de usuários que você aplicaria?

Minha estratégia de retenção baseia-se no conceito de **'Software as a Service'**. Entendo que, para o pequeno lojista, entregar apenas um login e senha não é o suficiente. Por isso, ofereço um pacote que inclui a integração completa, suporte técnico próximo e uma etapa breve de capacitação. O objetivo é garantir que a equipe de vendas da revenda saiba exatamente como lidar com os leads qualificados que o agente de IA gera, maximizando o proveito da ferramenta e, consequentemente, o faturamento deles.

No início, esse modelo apresenta um **desafio de escalabilidade**, já que a integração e o suporte exigem um esforço manual e um acompanhamento mais 'artesanal' para cada novo cliente. No entanto, vejo isso como um investimento necessário na fase de validação. Esse contato próximo me permite entender as dores reais do lojista e identificar padrões de comportamento que seriam impossíveis de notar de forma automatizada.

Ao longo do tempo, o produto será desenvolvido para se tornar cada vez mais **'self-service'**. A ideia é transformar os aprendizados desse suporte inicial em funcionalidades automatizadas e fluxos de integração simplificados (como um dashboard intuitivo ou instaladores automáticos). Assim, consigo reduzir gradualmente a necessidade de intervenção manual, permitindo que a aplicação ganhe escala sem perder a qualidade e o toque consultivo que garantiram a retenção dos primeiros clientes.
