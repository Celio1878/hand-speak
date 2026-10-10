# RULES.md — Regras de Engenharia e Padrões de Código

Este documento contém as regras inegociáveis para o desenvolvimento no repositório **HandSpeak**. Todos os agentes e desenvolvedores devem seguir estritamente estas diretrizes.

---

## 1. Regras de Runtime e Gerenciador de Pacotes (Bun)

1. **Bun Exclusivo**:
   - Utilize sempre `bun` para gerenciar pacotes: `bun add`, `bun remove`, `bun update`.
   - NUNCA use `npm install` ou `yarn`.
   - O arquivo `bun.lock` é o único lockfile aceito. Mantenha `package-lock.json` banido do repositório.
2. **Execução de Scripts**:
   - `bun run dev` para desenvolvimento local.
   - `bun run typecheck` para validação de tipos TypeScript.
   - `bun run build` para build de produção.

---

## 2. Regras de Performance & Loop de Vídeo (60 FPS)

1. **Orçamento de Renderização (Frame Budget)**:
   - O processamento de visão dentro do `requestAnimationFrame` deve consumir no máximo **12ms por frame** para garantir taxa constante de 60 FPS.
   - Evite alocação desnecessária de objetos ou arrays pesados a cada frame. Reutilize buffers e referências (`useRef`).
2. **Higiene de Recursos & Zero Memory Leaks**:
   - Ao desmontar componentes ou pausar a câmera, cancele o loop com `cancelAnimationFrame(requestRef.current)`.
   - Interrompa todos os tracks do fluxo de mídia: `stream.getTracks().forEach(track => track.stop())`.
   - Instâncias do `HandLandmarker` devem ser gerenciadas em singleton ou descartadas corretamente ao encerrar.

---

## 3. Regras de Acessibilidade (WCAG 2.2 AA / AAA)

1. **Comunicação Não-Auditiva**:
   - Todas as informações sonoras (como alertas ou confirmações) devem ter contrapartida visual clara (cores contrastantes, anéis de progresso, ícones com badges).
   - Ofereça feedback háptico através de `navigator.vibrate` em dispositivos móveis compatíveis.
2. **Contraste e Legibilidade**:
   - Relação de contraste mínima de 4.5:1 para textos regulares e 3:1 para elementos de interface destacados.
   - Forneça suporte consistente a Dark Mode (`dark:` no Tailwind) e Light Mode.
   - Tamanho mínimo de fonte para transcrição de leitura: 20px (`text-xl` ou superior).
3. **Navegação Acessível**:
   - Todos os botões e controles interativos devem possuir atributos `aria-label` descritivos em Português (`pt-BR`).
   - Todos os fluxos críticos devem ser operáveis via teclado.

---

## 4. Regras de IA, Google Gemini e Freemium

1. **Princípio Local-First e Resiliência**:
   - A aplicação DEVE funcionar perfeitamente mesmo offline ou sem internet ativa para detecção de Libras, soletração e dicionário local.
   - O Google Gemini atua como enriquecedor de linguagem natural (Libras -> Português fluente e Português -> Glossas de Libras). Se a API falhar ou estiver sem créditos, o motor local assume imediatamente sem travar a interface.
2. **Segurança de Credenciais**:
   - A chave de API do servidor (`GEMINI_API_KEY`) NUNCA deve ser exposta no código frontend do cliente. Todas as chamadas do servidor devem passar pela rota `app/routes/api.gemini.ts`.
   - Chaves pessoais de usuários no modelo BYOK (*Bring Your Own Key*) devem ser armazenadas exclusivamente no `localStorage` do navegador do usuário e transmitidas com segurança para a rota proxy.
3. **Controle de Custos e Freemium**:
   - Usuários do plano gratuito recebem **15 créditos diários de Gemini**.
   - Ao atingir o limite, a interface deve exibir de forma elegante o modal Freemium explicando o plano Pro (R$ 9,90/mês) ou instruindo a inserção de chave pessoal gratuita (BYOK).

---

## 5. Padrões de Código TypeScript e React 19

1. **Tipagem Estrita**:
   - Proibido uso de `any` solto. Tipos devem ser explicitamente importados (`type NormalizedLandmark`, `type GestureToken`, etc.).
   - Sempre trate estados nulos e indefinidos nos landmarks de visão computacional.
2. **React 19 & React Router v7**:
   - Utilize a API `use(...)` com `Suspense` para recursos assíncronos ou proteja componentes de câmera contra execução no SSR.
   - Componentes que acessam `navigator`, `window` ou Web APIs devem rodar apenas no cliente (`typeof window !== 'undefined'`).
3. **Internacionalização**:
   - Toda a interface com o usuário DEVE estar em Português do Brasil (`pt-BR`).
   - Variáveis, funções e código fonte permanecem em inglês para conformidade com convenções internacionais.
