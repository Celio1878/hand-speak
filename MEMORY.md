# MEMORY.md — Memória Permanente do Projeto HandSpeak

Este arquivo preserva o contexto contínuo do projeto, os Registros de Decisões de Arquitetura (ADRs), o catálogo de sinais de Libras e os aprendizados de engenharia acumulados.

---

## 1. Registros de Decisões de Arquitetura (ADRs)

### ADR-001: Rastreamento com MediaPipe Tasks Vision 3D
- **Contexto**: A versão inicial do app utilizava apenas 1 mão (`numHands: 1`) e comparava coordenadas 2D absolutas (X/Y), o que falhava quando o usuário rotacionava ou afastava a mão da câmera.
- **Decisão**: Migrar para `numHands: 2` com normalização de escala intrínseca (distância do pulso ao nódulo do dedo médio) e cálculo do vetor 3D de normal da palma.
- **Status**: Ativo.

### ADR-002: Google Gemini 3.8 Flash como Motor Conversacional
- **Contexto**: Libras possui sintaxe própria de tópico-comentário (ex: "EU IR MERCADO ONTEM"). A soletração gera sequências de palavras que precisam de fluência em Português para serem faladas em voz alta para ouvintes.
- **Decisão**: Utilizar o modelo Google Gemini 3.8 Flash (com fallback para `gemini-2.5-pro` e `gemini-2.5-flash`) via rota segura no servidor (`app/routes/api.gemini.ts`), com suporte a BYOK.
- **Status**: Ativo.

### ADR-003: Arquitetura Freemium e Gestão de Custos (Teto de R$ 10,00)
- **Contexto**: O custo de requisições de IA para usuários casuais é baixo (menos de R$ 0,25/mês), mas o uso comercial contínuo ou abusos de chamadas podem ultrapassar o limite estabelecido de R$ 10,00.
- **Decisão**: Implementar modelo Freemium com 15 créditos diários no plano gratuito e assinatura Pro a R$ 9,90/mês, além de suporte a chave gratuita do usuário (BYOK).
- **Status**: Ativo.

### ADR-004: Bun como Gerenciador de Pacotes e Runtime Padrão
- **Contexto**: O projeto possuía tanto `package-lock.json` quanto `bun.lock` inconsistentes, além de dependências desatualizadas.
- **Decisão**: Padronizar 100% no Bun 1.x, garantindo builds ultrarrápidos e lockfile único.
- **Status**: Ativo.

---

## 2. Resolução de Ambiguidades e Colisões Conhecidas em Libras

| Conflito | Causa Heurística Inicial | Solução Geométrica Implementada |
| :--- | :--- | :--- |
| **1 vs D** | Ambos têm apenas o indicador levantado. O número 1 interceptava a letra D. | Isolamento de modos (Modo Números vs Alfabeto) e verificação do círculo formado pelo polegar com os outros dedos (D). |
| **2 vs V** | Ambos têm indicador e dedo médio levantados. | No número 2 os dedos ficam erguidos; na letra V eles se separam em V. Em modo de escrita de texto, a letra V tem prioridade contextual. |
| **5 vs B** | Ambos possuem 4 ou 5 dedos abertos. | Letra B tem os 4 dedos unidos e o polegar dobrado para dentro da palma. O número 5 tem todos os dedos abertos e espalhados. |
| **0 vs O** | Ambos formam um círculo com os dedos. | No número 0 o círculo é feito com todos os dedos tocando o polegar. No alfabeto, a letra O tem formato oval característico. |
| **F vs T** | Ambos têm 3 dedos levantados e o indicador dobrado com o polegar. | Na letra F, o polegar fica posicionado **por fora** do dedo indicador. Na letra T, o polegar fica **por dentro** do dedo indicador. |
| **A vs S** | Ambos são punhos fechados. | Na letra A, o polegar fica encostado verticalmente ao lado do dedo indicador. Na letra S, o polegar cruza horizontalmente sobre os dedos fechados. |
| **U vs V** | Ambos têm indicador e médio levantados. | Na letra U, os dedos indicador e médio estão **unidos e paralelos** (distância < 0.035). Na letra V, os dedos estão **separados** (distância > 0.05). |

---

## 3. Catálogo de Sinais e Vocabulário de Libras

### Alfabeto Datilológico Completo:
- A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z.

### Números Suportados:
- 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10.

### Expressões e Palavras Frequentes:
- `OI`: Aceno horizontal de mão com movimento oscilatório.
- `SIM`: Polegar para cima (ou punho com flexão vertical afirmativa).
- `NAO`: Dedo indicador balançando lateralmente de um lado para o outro.
- `OBRIGADO`: Toque da mão aberta na testa ou queixo em direção à frente.
- `POR FAVOR`: Mãos unidas em prece ou mão aberta circular no peito.
- `BOM DIA`: Sinal de bom (mão na boca para frente) seguido de dia.
- `BOA TARDE`: Sinal de bom seguido do sol se pondo no antebraço.
- `BOA NOITE`: Sinal de bom seguido de mão cobrindo o punho oposto.
- `AJUDA`: Punho cerrado sobre a palma da outra mão impulsionando para frente.
- `AMIGO`: Mão no peito do lado esquerdo com batida suave.
- `FAMILIA`: Letras F de ambas as mãos se unindo em círculo.
- `PAZ`: Letras P e Z ou sinal de calma com as palmas voltadas para baixo.
- `EU`: Indicador apontando para o próprio peito.
- `VOCE`: Indicador apontando para o interlocutor à frente.
- `CASA`: Ambas as mãos unidas pelas pontas dos dedos formando um telhado.
- `AGUA`: Letra L no queixo com movimento do dedo indicador.
