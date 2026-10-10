import { useState, useEffect } from "react";
import { generateRoomCode, normalizeRoomCode } from "./webrtc-call-service";
import { Copy, Check, Video, Users, ArrowRight, X, Sparkles } from "lucide-react";

interface RoomJoinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartHost: (roomCode: string) => void;
  onJoinRoom: (roomCode: string) => void;
  initialRoomCode?: string;
}

export function RoomJoinModal({
  isOpen,
  onClose,
  onStartHost,
  onJoinRoom,
  initialRoomCode = "",
}: RoomJoinModalProps) {
  const [tab, setTab] = useState<"create" | "join">(initialRoomCode ? "join" : "create");
  const [generatedCode, setGeneratedCode] = useState<string>("");
  const [inputCode, setInputCode] = useState<string>(initialRoomCode);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (!generatedCode) {
        setGeneratedCode(generateRoomCode());
      }
      if (initialRoomCode) {
        setInputCode(initialRoomCode);
        setTab("join");
      }
    }
  }, [isOpen, initialRoomCode]);

  if (!isOpen) return null;

  const getShareableUrl = (code: string) => {
    if (typeof window === "undefined") return "";
    const url = new URL(window.location.href);
    url.searchParams.set("room", code);
    return url.toString();
  };

  const handleCopyLink = () => {
    const url = getShareableUrl(generatedCode);
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(generatedCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (generatedCode) {
      onStartHost(generatedCode);
    }
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeRoomCode(inputCode);
    if (normalized.length >= 5) {
      onJoinRoom(normalized);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col">
        {/* Cabeçalho */}
        <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-500 to-cyan-500 flex items-center justify-center text-white shadow-md">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-gray-900 dark:text-white">
                Vídeo Chamada P2P
              </h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Tradução de Libras e legendas em tempo real
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            aria-label="Fechar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Abas: Criar ou Entrar */}
        <div className="p-3 bg-gray-50 dark:bg-gray-900/60 border-b border-gray-100 dark:border-gray-800">
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-gray-200/80 dark:bg-gray-800 rounded-2xl">
            <button
              onClick={() => setTab("create")}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                tab === "create"
                  ? "bg-white dark:bg-gray-900 text-teal-600 dark:text-teal-400 shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Criar Nova Sala</span>
            </button>
            <button
              onClick={() => setTab("join")}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                tab === "join"
                  ? "bg-white dark:bg-gray-900 text-cyan-600 dark:text-cyan-400 shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Entrar com Código</span>
            </button>
          </div>
        </div>

        {/* Conteúdo da Aba Criar */}
        {tab === "create" ? (
          <form onSubmit={handleCreateSubmit} className="p-5 flex flex-col gap-4">
            <div className="text-center py-2">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                Código da sua Chamada
              </span>
              <div className="inline-flex items-center gap-3 px-5 py-2.5 bg-teal-50 dark:bg-teal-950/40 border-2 border-teal-500/40 rounded-2xl">
                <span className="font-mono text-2xl font-black text-teal-700 dark:text-teal-300 tracking-wider">
                  {generatedCode}
                </span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="p-1.5 text-teal-600 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/40 rounded-lg transition"
                  title="Copiar código"
                >
                  {copiedCode ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800/50 p-3.5 rounded-2xl border border-gray-200 dark:border-gray-700/60 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                  Link Direto para o Interlocutor:
                </p>
                <p className="text-xs font-mono text-gray-800 dark:text-gray-200 truncate">
                  {getShareableUrl(generatedCode)}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopyLink}
                className="px-3 py-1.5 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-teal-600 dark:text-teal-400 font-bold text-xs rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm transition flex items-center gap-1 shrink-0"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? "Copiado!" : "Copiar Link"}</span>
              </button>
            </div>

            <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed text-center">
              Envie o link para a outra pessoa abrir no celular ou computador. Assim que ela entrar, a vídeo chamada iniciará automaticamente com legendas ao vivo!
            </p>

            <button
              type="submit"
              className="w-full py-3.5 px-4 bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-extrabold text-sm rounded-2xl shadow-lg hover:shadow-xl transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Video className="w-4 h-4" />
              <span>Abrir Sala e Iniciar Câmera</span>
            </button>
          </form>
        ) : (
          /* Conteúdo da Aba Entrar */
          <form onSubmit={handleJoinSubmit} className="p-5 flex flex-col gap-4">
            <div>
              <label
                htmlFor="room-code-input"
                className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1.5"
              >
                Digite o Código da Chamada (ex: HS-8421):
              </label>
              <input
                id="room-code-input"
                type="text"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                placeholder="HS-XXXX"
                maxLength={8}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/80 border-2 border-gray-200 dark:border-gray-700 rounded-2xl font-mono text-center text-lg font-black tracking-widest text-gray-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-inner"
              />
            </div>

            <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed text-center">
              Insira o código compartilhado pelo anfitrião para se conectar à chamada de vídeo com tradução em tempo real.
            </p>

            <button
              type="submit"
              disabled={!inputCode.trim() || inputCode.trim().length < 3}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-cyan-600 to-teal-500 hover:from-cyan-700 hover:to-teal-600 disabled:opacity-40 text-white font-extrabold text-sm rounded-2xl shadow-lg hover:shadow-xl transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Entrar na Chamada</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
