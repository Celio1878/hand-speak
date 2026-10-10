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
3. **Estabilidade de Landmarks (Filtro Anti-Jitter)**:
   - Todo feed de landmarks de até 2 mãos deve passar por suavização temporal via filtro EMA (`smoothLandmarks` com alpha ~0.72) antes do cálculo geométrico de falanges e renderização de esqueleto no Canvas para eliminar tremor e ruído de sensor.
4. **Higiene de Recursos WebGL e Three.js**:
   - Toda instância de Three.js ou cena WebGL deve liberar explicitamente os buffers e geometrias ao desmontar componentes (`renderer.dispose()`, `geometry.dispose()`, `material.dispose()`) e cancelar loops de renderização (`cancelAnimationFrame`), prevenindo memory leaks e perda de contexto gráfico.

---

## 3. Regras de Acessibilidade (WCAG 2.2 AA / AAA)

1. **Comunicação 100% Visual e Não-Auditiva**:
   - Como o HandSpeak é voltado para a quebra de barreiras entre a comunidade surda/muda e ouvintes, a experiência é **100% visual**: o sistema não depende de microfone, escuta de áudio ou sintetizador de voz.
   - Todas as confirmações de sinais possuem contrapartida visual clara (cores contrastantes, anéis de progresso, chips de status, cards de Libras).
   - Ofereça feedback háptico através de `navigator.vibrate` em dispositivos móveis compatíveis.
2. **Contraste e Legibilidade**:
   - Relação de contraste mínima de 4.5:1 para textos regulares e 3:1 para elementos de interface destacados.
   - Forneça suporte consistente a Dark Mode (`dark:` no Tailwind) e Light Mode.
   - Tamanho mínimo de fonte para transcrição de leitura: 20px (`text-xl` ou superior).
3. **Navegação Acessível**:
   - Todos os botões e controles interativos devem possuir atributos `aria-label` descritivos em Português (`pt-BR`).
   - Todos os fluxos críticos devem ser operáveis via teclado (`Enter` para envio).

---

## 4. Regras de IA, Google Gemini e Freemium

1. **Princípio Local-First e Resiliência**:
   - A aplicação DEVE funcionar perfeitamente mesmo offline ou sem internet ativa para detecção de Libras, soletração e dicionário local.
   - O Google Gemini atua como enriquecedor de linguagem natural (Libras -> Português fluente e Português -> Glossas de Libras). Se a API falhar ou estiver sem créditos, o motor local assume imediatamente sem travar a interface.
2. **Segurança de Credenciais**:
   - A chave de API do servidor (`GEMINI_API_KEY`) é a única utilizada e NUNCA deve ser exposta no código frontend do cliente. Todas as chamadas de IA devem passar exclusivamente pela rota do servidor `app/routes/api.gemini.ts`.
   - O fluxo de chave pessoal (BYOK) está descontinuado. Nenhuma credencial pessoal de usuário deve ser solicitada, exibida ou armazenada no frontend.
3. **Controle de Custos e Freemium**:
   - Usuários do plano gratuito recebem **15 créditos diários de IA**.
   - Ao atingir o limite, a interface deve exibir de forma elegante o modal de planos apresentando a assinatura Pro (R$ 9,90/mês).
4. **Diálogo 100% Visual no Mensageiro Integrado**:
   - A comunicação de resposta do interlocutor é realizada através do campo de digitação de texto no rodapé do chat.
   - Ao enviar o texto digitado, a aplicação gera automaticamente os **cards visuais de Libras** e publica a mensagem no histórico, viabilizando a leitura imediata pela pessoa surda sem requisições de microfone ou dependências de áudio.
5. **White-Labeling Rigoroso na Interface do Usuário**:
   - É terminantemente proibido exibir nomes de empresas terceiras (Google, Google AI Studio, MediaPipe) ou nomes comerciais de modelos (Gemini) na interface voltada para o usuário final.
   - Toda a comunicação deve utilizar a identidade visual e terminologias coesas do produto: "Inteligência Artificial", "Rastreamento 3D de Libras", "Tradução Inteligente".
6. **Autocorreção Semântica e Desambiguação de Libras**:
   - Erros de colisão geométrica (A vs S, F vs T, U vs V, M vs N) devem ser desambiguados localmente por matriz de confusão fonológica de Libras com Levenshtein ponderado antes de substituição in-place no buffer.
   - A autocorreção é disparada ao inserir espaço ou após pausa de ~1.2s de inatividade na soletração, com notificação visual sutil.
7. **Guardrails de IA, Proteção contra Injeção de Prompt e Escudo de Saída**:
   - Todas as requisições de IA devem ser limitadas a no máximo 400 caracteres (`MAX_AI_INPUT_LENGTH = 400`).
   - Requisições na rota `/api/gemini` devem passar por controle de taxa deslizante (máximo 30 requisições/minuto por cliente/IP).
   - O pré-flight deve interceptar tentativas de prompt injection (`detectPromptInjection`) com neutralização silenciosa, poupando cotas sem exibir mensagens de erro técnicas.
   - Entradas de usuários devem ser isoladas em tags `<user_input>` com escape XML no prompt do sistema.
   - Toda resposta gerada deve passar pelo escudo de saída (`sanitizeAiOutput`), redigindo segredos/chaves de API, removendo scripts XSS e suprimindo conversas meta da IA.
8. **Vídeo Chamada P2P (WebRTC 100% Frontend) e Compreensão Mútua**:
   - A comunicação entre dois dispositivos remotos deve operar prioritariamente via WebRTC P2P (PeerJS) sem servidores de mídia intermediários dedicados.
   - Todo diálogo deve fornecer suporte a legendas dinâmicas flutuantes em tempo real e reações rápidas de compreensão mútua (👍 Entendi, 🔄 Repetir, ⏳ Um momento, 👏 Concordo, ❓ Dúvida) com feedback háptico e visual sincronizado.
9. **Moderação e Segurança em Tempo Real na Transmissão de Vídeo**:
   - O fluxo de vídeo em chamadas remotas deve ser monitorado por arquitetura híbrida de 2 camadas: filtro local contínuo a cada ~800ms (`video-safety-guard.ts`) e auditoria multimodal periódica/sob suspeita a cada 5s (`api.moderation.ts`).
   - Política de Tolerância Zero: detecção confirmada de conteúdo sexual, violência, armas, terror ou risco a menores deve acionar desfoque imediato (<100ms), desconexão do WebRTC e encerramento da sala.
   - A interface deve sempre prover botão de emergência ("🚨 Denunciar / Sair") para corte manual imediato.
   - Movimentos naturais de mãos, braços e expressões faciais da Língua de Sinais (Libras) devem ser explicitamente preservados de falsos positivos.

---

## 5. Padrões de Código TypeScript, React 19 e React Router v7

1. **Tipagem Estrita**:
   - Proibido uso de `any` solto. Tipos devem ser explicitamente importados (`type NormalizedLandmark`, `type GestureToken`, etc.).
   - Sempre trate estados nulos e indefinidos nos landmarks de visão computacional.
2. **React 19, Suspense & Error Boundaries**:
   - Utilize a API `use(...)` com `Suspense` para recursos assíncronos ou proteja componentes de câmera contra execução no SSR.
   - Todo componente assíncrono que consome promises via `use(...)` DEVE ser encapsulado por um `ErrorBoundary` dedicado com opção acessível de recuperação/retry para impedir que falhas de rede ou hardware derrubem o `RenderErrorBoundary` da rota inteira.
   - Componentes que acessam `navigator`, `window` ou Web APIs devem rodar apenas no cliente (`typeof window !== 'undefined'`).
3. **Resiliência de WASM e Modelos de Visão**:
   - Arquivos WASM do MediaPipe devem ser mantidos localmente em `public/wasm/` para operação offline, evitando dependência de CDNs externos sujeitos a CORS e bloqueios de MIME type.
   - Sempre forneça fallback gracioso de aceleração gráfica (`GPU` -> `CPU`) e modelo (`Local` -> `Remoto`).
4. **Prevenção de Erros de Hidratação SSR no React Router 7**:
   - O `<head>` de `app/root.tsx` NUNCA deve conter `<title>` ou `<meta name="description">` estáticos duplicados quando as rotas exportarem `meta()`. Delegue exclusivamente para o componente `<Meta />`.
   - Elementos raiz (`<html>` e `<body>`) devem conter `suppressHydrationWarning` para tolerar atributos dinâmicos injetados por extensões do navegador do cliente.
5. **Internacionalização**:
   - Toda a interface com o usuário DEVE estar em Português do Brasil (`pt-BR`).
   - Variáveis, funções e código fonte permanecem em inglês para conformidade com convenções internacionais.
