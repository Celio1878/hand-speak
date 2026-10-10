# 🤟 HandSpeak — Tradutor Bidirecional de Libras em Tempo Real

Plataforma inteligente de tradução bidirecional entre a **Língua Brasileira de Sinais (Libras)** e **Português falado**, desenvolvida para aproximar pessoas surdas/mudas e pessoas ouvintes com inteligência artificial de ponta (**Google Gemini 3.8 Flash** e **MediaPipe 3D**).

---

## 🌟 Principais Recursos

- 🖐️ **Rastreamento de 2 Mãos em Tempo Real**: Visão computacional com MediaPipe Tasks Vision em 3D e normalização geométrica invariante à escala.
- 🔤 **Reconhecimento Híbrido Multimodo**:
  - **Expressões & Palavras**: Sinais de alta frequência (Oi, Obrigado, Por favor, Sim, Não, Ajuda, Casa, Família, Água).
  - **Datilologia Completa A-Z**: Todas as 26 letras do alfabeto com eliminação de colisões (F vs T, A vs S, U vs V).
  - **Números 0-10**: Reconhecimento isolado sem conflito com letras.
- 🤖 **Google Gemini 3.8 Flash**:
  - Tradução da sintaxe de Libras (tópico-comentário) para frases fluidas em Português falado.
  - Ajuste de registros de tom: *Casual*, *Formal* e *Emergência Médica*.
  - Tradução reversa da fala do ouvinte para glossas e cards visuais de Libras.
  - Fallback automático para `gemini-2.5-pro` e `gemini-2.5-flash`.
- 🗣️ **Comunicação em Dois Sentidos (Bilingue)**:
  - **Sinalizador -> Ouvinte**: Reconhecimento de gestos + Síntese de Voz (TTS pt-BR).
  - **Ouvinte -> Sinalizador**: Captura por microfone (STT pt-BR) + cards visuais de Libras.
- 💎 **Modelo Freemium Inteligente**:
  - 15 créditos diários gratuitos de Gemini renovados automaticamente.
  - Suporte a **BYOK (Bring Your Own Key)** para uso ilimitado grátis com chave pessoal do Google AI Studio.
  - Plano Pro (R$ 9,90/mês) para uso intensivo comercial.
- ⚡ **Tecnologias Modernas**: React 19, React Router v7, Tailwind CSS v4, Lucide Icons e Bun 1.x.

---

## 🚀 Como Executar

### Pré-requisitos
- [Bun](https://bun.sh/) (v1.3+ instalado)
- Câmera e microfone habilitados no navegador

### 1. Instalação das Dependências
```bash
bun install
```

### 2. Configuração de Variáveis de Ambiente (Opcional)
Crie um arquivo `.env` para disponibilizar a chave da API do Google Gemini:
```env
GEMINI_API_KEY=sua_chave_do_google_ai_studio_aqui
```
> *Nota: Se a chave não for informada no ambiente, o usuário pode inserir sua chave pessoal gratuita diretamente no modal de configurações do aplicativo (BYOK).*

### 3. Executando em Modo de Desenvolvimento
```bash
bun run dev
```
O aplicativo estará disponível em `http://localhost:5173`.

### 4. Checagem de Tipos e Build de Produção
```bash
bun run typecheck
bun run build
```

---

## 🏛️ Governança Agêntica

O repositório adota padrões rígidos de engenharia autônoma:
- [`AGENTS.md`](./AGENTS.md): Papéis e competências das 4 personas agênticas (Visão 3D, Linguística, Gemini/IA, Acessibilidade/Áudio).
- [`RULES.md`](./RULES.md): Regras de frame budget (60 FPS), WCAG 2.2 e diretrizes de código.
- [`MEMORY.md`](./MEMORY.md): Registros de Decisões de Arquitetura (ADRs), catálogo de sinais e matriz de modelos.
- [`.agents/skills/`](./.agents/skills/): Habilidades operacionais (`libras-vision`, `gemini-libras`, `speech-dialogue`, `accessibility-ux`).

---

## 🐳 Executando com Docker

```bash
docker build -t handspeak .
docker run -p 3000:3000 handspeak
```

---

Desenvolvido com foco em acessibilidade e inclusão social. 🤟
