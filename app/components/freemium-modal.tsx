import { useState } from "react";
import {
  FREE_DAILY_CREDITS,
  PRO_PRICE_BRL,
  getCustomApiKey,
  getRemainingCredits,
  getSelectedModel,
  getSelectedTone,
  isProUser,
  setCustomApiKey,
  setProUser,
  setSelectedModel,
  setSelectedTone,
} from "./freemium-service";
import {
  Sparkles,
  CheckCircle2,
  Key,
  X,
  Zap,
  Sliders,
  ShieldCheck,
} from "lucide-react";

interface FreemiumModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

export function FreemiumModal({ isOpen, onClose, onUpdate }: FreemiumModalProps) {
  const [apiKeyInput, setApiKeyInput] = useState(getCustomApiKey());
  const [keySaved, setKeySaved] = useState(false);
  const [proStatus, setLocalProStatus] = useState(isProUser());
  const [selectedModel, setLocalModel] = useState(getSelectedModel());
  const [selectedTone, setLocalTone] = useState(getSelectedTone());

  if (!isOpen) return null;

  const credits = getRemainingCredits();
  const isPro = proStatus || Boolean(apiKeyInput.trim());

  const handleSaveKey = () => {
    setCustomApiKey(apiKeyInput);
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2500);
    if (onUpdate) onUpdate();
  };

  const handleTogglePro = () => {
    const next = !proStatus;
    setProUser(next);
    setLocalProStatus(next);
    if (onUpdate) onUpdate();
  };

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    setLocalModel(model);
    if (onUpdate) onUpdate();
  };

  const handleToneChange = (tone: "casual" | "formal" | "emergency") => {
    setSelectedTone(tone);
    setLocalTone(tone);
    if (onUpdate) onUpdate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-teal-500/10 via-cyan-500/10 to-transparent">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-teal-500 text-white rounded-xl shadow-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                Inteligência Gemini & Planos
                {isPro && (
                  <span className="px-2 py-0.5 text-xs font-semibold bg-amber-500 text-white rounded-full">
                    PRO / BYOK
                  </span>
                )}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Modelo selecionado: <strong className="text-teal-600 dark:text-teal-400">{selectedModel}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {/* Status de Créditos */}
          <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">
                Créditos de IA Restantes Hoje
              </p>
              <p className="text-2xl font-black text-gray-900 dark:text-white mt-0.5">
                {isPro ? "Ilimitado ⚡" : `${credits} / ${FREE_DAILY_CREDITS}`}
              </p>
              {!isPro && (
                <p className="text-xs text-gray-400 mt-1">
                  Renovação automática diária à meia-noite sem nenhum custo.
                </p>
              )}
            </div>
            <div className="text-right">
              <button
                onClick={handleTogglePro}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition shadow-sm ${
                  proStatus
                    ? "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-white"
                    : "bg-gradient-to-r from-teal-500 to-cyan-600 text-white hover:brightness-110"
                }`}
              >
                {proStatus ? "Desativar Pro (Demo)" : `Assinar Pro (${PRO_PRICE_BRL}/mês)`}
              </button>
            </div>
          </div>

          {/* Comparativo de Planos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white text-base">Plano Gratuito</h3>
                <p className="text-xs text-gray-500 mt-0.5">Sempre grátis</p>
                <ul className="mt-3 space-y-2 text-xs text-gray-600 dark:text-gray-300">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    Visão MediaPipe 3D local ilimitada
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    Voz e escuta nativa (Web Speech)
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    15 refinamentos Gemini diários
                  </li>
                </ul>
              </div>
            </div>

            <div className="p-4 rounded-xl border-2 border-teal-500 bg-teal-50/30 dark:bg-teal-950/20 relative flex flex-col justify-between">
              <span className="absolute -top-3 right-4 px-2 py-0.5 bg-teal-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-full shadow-sm">
                Recomendado
              </span>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white text-base">Plano Pro</h3>
                <p className="text-xs text-teal-600 dark:text-teal-400 font-semibold mt-0.5">
                  {PRO_PRICE_BRL} / mês
                </p>
                <ul className="mt-3 space-y-2 text-xs text-gray-700 dark:text-gray-200">
                  <li className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-teal-500 shrink-0" />
                    Gemini 3.8 Flash ilimitado
                  </li>
                  <li className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-teal-500 shrink-0" />
                    Ajuste de tons (Formal, Casual, Emergência)
                  </li>
                  <li className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-teal-500 shrink-0" />
                    Tradução reversa em cards visuais de Libras
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Opção BYOK (Bring Your Own Key) */}
          <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-dashed border-gray-300 dark:border-gray-700">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
              <Key className="w-4 h-4 text-amber-500" />
              <span>Opção Grátis Ilimitada: Use sua chave pessoal (BYOK)</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Cole sua chave gratuita obtida no{" "}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-teal-600 dark:text-teal-400 underline font-medium"
              >
                Google AI Studio
              </a>{" "}
              para desbloquear IA ilimitada sem assinar o Pro.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                type="password"
                placeholder="Ex: AIzaSy..."
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <button
                onClick={handleSaveKey}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg transition shrink-0"
              >
                {keySaved ? "Salva!" : "Salvar Chave"}
              </button>
            </div>
          </div>

          {/* Configurações de Modelo e Tom */}
          <div className="space-y-4 pt-2 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
              <Sliders className="w-4 h-4 text-teal-600" />
              <span>Parâmetros de Tradução da IA</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Seletor de Modelo */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                  Modelo Gemini:
                </label>
                <select
                  value={selectedModel}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-teal-500"
                >
                  <option value="gemini-3.8-flash">Gemini 3.8 Flash (Padrão Recomendado)</option>
                  <option value="gemini-2.5-pro">Gemini 2.5 Pro (Profundo & Técnico)</option>
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (Ultra Estável)</option>
                </select>
              </div>

              {/* Seletor de Tom */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                  Tom da Conversa:
                </label>
                <select
                  value={selectedTone}
                  onChange={(e) => handleToneChange(e.target.value as "casual" | "formal" | "emergency")}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-teal-500"
                >
                  <option value="casual">Casual (Amigável & Dia a dia)</option>
                  <option value="formal">Formal (Trabalho & Atendimento)</option>
                  <option value="emergency">Emergência (Hospital & Socorro)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Dados de câmera processados no seu dispositivo</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gray-800 dark:bg-gray-700 text-white text-xs font-bold rounded-xl hover:bg-gray-900 transition"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
}
