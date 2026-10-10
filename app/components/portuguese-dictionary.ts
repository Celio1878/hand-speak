export type QuickPhraseCategory = {
  category: string;
  phrases: string[];
};

export const QUICK_PHRASES: QuickPhraseCategory[] = [
  {
    category: "Cumprimentos",
    phrases: [
      "Olá, tudo bem com você?",
      "Bom dia!",
      "Boa tarde!",
      "Boa noite!",
      "Prazer em te conhecer!",
    ],
  },
  {
    category: "Comunicação & Libras",
    phrases: [
      "Eu sou surdo e me comunico através de Libras.",
      "Você pode falar no microfone deste aplicativo.",
      "Muito obrigado pela compreensão!",
      "Você conhece a Língua Brasileira de Sinais?",
    ],
  },
  {
    category: "Dúvidas & Apoio",
    phrases: [
      "Pode me ajudar com uma informação, por favor?",
      "Onde fica o banheiro?",
      "Qual é o valor disso?",
      "Você pode repetir um pouco mais devagar?",
    ],
  },
  {
    category: "Emergência & Saúde",
    phrases: [
      "Preciso de atendimento médico com urgência.",
      "Estou sentindo muita dor.",
      "Por favor, chame uma ambulância ou ajuda policial.",
      "Onde fica a farmácia ou hospital mais próximo?",
    ],
  },
];

export const FREQUENT_PORTUGUESE_WORDS = [
  "OI",
  "OLÁ",
  "OBRIGADO",
  "OBRIGADA",
  "POR FAVOR",
  "BOM DIA",
  "BOA TARDE",
  "BOA NOITE",
  "SIM",
  "NÃO",
  "AJUDA",
  "AMIGO",
  "AMIGA",
  "FAMÍLIA",
  "CASA",
  "ÁGUA",
  "COMIDA",
  "MÉDICO",
  "HOSPITAL",
  "REMÉDIO",
  "BANHEIRO",
  "NOME",
  "QUAL",
  "ONDE",
  "QUANDO",
  "COMO",
  "HORA",
  "TRABALHO",
  "ESCOLA",
  "BRASIL",
  "LIBRAS",
  "APRENDER",
  "ENTENDER",
  "FELIZ",
  "PAZ",
  "AMOR",
  "SAÚDE",
  "DESCULPE",
  "COM LICENÇA",
  "TUDO BEM",
];

// Returns up to 4 predictive suggestions for a typed word
export function getWordSuggestions(prefix: string): string[] {
  if (!prefix || prefix.trim().length === 0) return [];
  const normalized = prefix.trim().toUpperCase();

  const matches = FREQUENT_PORTUGUESE_WORDS.filter(
    (word) => word.startsWith(normalized) && word !== normalized
  );

  return matches.slice(0, 4);
}
