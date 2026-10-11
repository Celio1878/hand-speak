import { useState } from "react";
import {
  FREE_DAILY_CREDITS,
  PRO_PRICE_BRL,
  getRemainingCredits,
  getSelectedTone,
  isProUser,
  setProUser,
  setSelectedTone,
} from "./freemium-service";
import {
  Sparkles,
  CheckCircle2,
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
  const [proStatus, setLocalProStatus] = useState(isProUser());
  const [selectedTone, setLocalTone] = useState(getSelectedTone());

  if (!isOpen) return null;

  const credits = getRemainingCredits();
  const isPro = proStatus;

  const handleTogglePro = () => {
    const next = !proStatus;
    setProUser(next);
    setLocalProStatus(next);
    if (onUpdate) onUpdate();
  };

  const handleToneChange = (tone: "casual" | "formal" | "emergency") => {
    setSelectedTone(tone);
    setLocalTone(tone);
    if (onUpdate) onUpdate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-2xl shadow-2xl border-t sm:border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[90vh] pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-0">
        {/* Puxador visual para mobile */}
        <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto mt-2.5 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-teal-500/10 via-cyan-500/10 to-transparent">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-teal-500 text-white rounded-xl shadow-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                Planos & Preferências
                {isPro && (
                  <span className="px-2 py-0.5 text-xs font-semibold bg-amber-500 text-white rounded-full">
                    PRO ⚡
                  </span>
                )}
              </h2>
              <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">
                Gerencie sua assinatura e personalize os parâmetros de tradução
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition min-h-[44px] min-w-[44px] flex items-center justify-center"
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
                    Rastreamento 3D de Libras em tempo real ilimitado
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    Interface 100% visual com cards de Libras e chat em tempo real
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    15 traduções inteligentes com IA diárias
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    Até 5 minutos de videochamada P2P por dia
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
                    Videochamadas P2P ilimitadas com moderação contínua
                  </li>
                  <li className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-teal-500 shrink-0" />
                    Traduções inteligentes com IA ilimitadas
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

          {/* Configurações de Tom de Conversa */}
          <div className="space-y-4 pt-2 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
              <Sliders className="w-4 h-4 text-teal-600" />
              <span>Personalização da Tradução</span>
            </div>

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

        {/* Footer */}
        <div className="p-4 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Processamento local de câmera no seu dispositivo</span>
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
