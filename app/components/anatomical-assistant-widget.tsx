import { ChevronLeft, ChevronRight, Eye, Info, Pause, Play, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LIBRAS_ANATOMICAL_POSES, resolveTextToPoseSequence, type HandPose3D } from './anatomical-hand-poses';
import { AnatomicalHandScene } from './anatomical-hand-scene';

interface AnatomicalAssistantWidgetProps {
	initialText?: string;
	onClose?: () => void;
}

export function AnatomicalAssistantWidget({ initialText = '', onClose }: AnatomicalAssistantWidgetProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const sceneRef = useRef<AnatomicalHandScene | null>(null);

	// Estado do Sinal Atual e Sequência
	const [activePoseId, setActivePoseId] = useState<string>('A');
	const [categoryTab, setCategoryTab] = useState<'ALPHABET' | 'NUMBER' | 'WORDS'>('ALPHABET');
	const [speedMultiplier, setSpeedMultiplier] = useState<number>(1.0);
	const [isAutoRotating, setIsAutoRotating] = useState<boolean>(false);

	// Sequenciador de Frases / Palavras
	const [sequence, setSequence] = useState<HandPose3D[]>([LIBRAS_ANATOMICAL_POSES['A']]);
	const [sequenceIndex, setSequenceIndex] = useState<number>(0);
	const [isPlaying, setIsPlaying] = useState<boolean>(false);
	const playbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const currentPose =
		LIBRAS_ANATOMICAL_POSES[activePoseId] || sequence[sequenceIndex] || LIBRAS_ANATOMICAL_POSES['A'];

	// 1. Inicializa Cena 3D WebGL
	useEffect(() => {
		if (!containerRef.current) return;

		const initialPose = LIBRAS_ANATOMICAL_POSES[activePoseId] || LIBRAS_ANATOMICAL_POSES['A'];
		const scene = new AnatomicalHandScene(containerRef.current, initialPose.landmarks);
		sceneRef.current = scene;

		// Resize Observer para manter aspect ratio
		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const { width, height } = entry.contentRect;
				if (width > 0 && height > 0) {
					scene.resize(width, height);
				}
			}
		});
		ro.observe(containerRef.current);

		return () => {
			ro.disconnect();
			scene.dispose();
			sceneRef.current = null;
		};
	}, []);

	// 2. Aplica Nova Pose no Motor 3D
	const applyPose = useCallback((pose: HandPose3D, immediate = false) => {
		setActivePoseId(pose.id);
		if (sceneRef.current) {
			sceneRef.current.setPose(pose.landmarks, pose.activeJointsFocus, immediate);
		}
	}, []);

	// 3. Reage ao texto inicial recebido (ex: vindo do chat)
	useEffect(() => {
		if (initialText && initialText.trim().length > 0) {
			const seq = resolveTextToPoseSequence(initialText);
			setSequence(seq);
			setSequenceIndex(0);
			setIsPlaying(true);
			applyPose(seq[0], false);
		}
	}, [initialText, applyPose]);

	// 4. Loop de Reprodução da Sequência
	useEffect(() => {
		if (!isPlaying || sequence.length <= 1) {
			if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current);
			return;
		}

		const currentItem = sequence[sequenceIndex];
		const duration = Math.max(600, (currentItem?.durationMs || 1000) / speedMultiplier);

		playbackTimerRef.current = setTimeout(() => {
			setSequenceIndex((prevIdx) => {
				const nextIdx = (prevIdx + 1) % sequence.length;
				applyPose(sequence[nextIdx], false);
				return nextIdx;
			});
		}, duration);

		return () => {
			if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current);
		};
	}, [isPlaying, sequenceIndex, sequence, speedMultiplier, applyPose]);

	// Ações de Controle
	const handleTogglePlay = () => {
		setIsPlaying((prev) => !prev);
	};

	const handlePrevSign = () => {
		setIsPlaying(false);
		setSequenceIndex((prev) => {
			const next = prev > 0 ? prev - 1 : sequence.length - 1;
			applyPose(sequence[next], false);
			return next;
		});
	};

	const handleNextSign = () => {
		setIsPlaying(false);
		setSequenceIndex((prev) => {
			const next = (prev + 1) % sequence.length;
			applyPose(sequence[next], false);
			return next;
		});
	};

	const handleSelectDirectSign = (id: string) => {
		setIsPlaying(false);
		const pose = LIBRAS_ANATOMICAL_POSES[id];
		if (pose) {
			setSequence([pose]);
			setSequenceIndex(0);
			applyPose(pose, false);
		}
	};

	const handleResetCamera = (preset: 'FRONT' | 'SIDE' | 'TOP') => {
		if (sceneRef.current) {
			sceneRef.current.resetView(preset);
		}
	};

	const handleToggleAutoRotate = () => {
		if (sceneRef.current) {
			const state = sceneRef.current.toggleAutoRotate();
			setIsAutoRotating(state);
		}
	};

	const handleSpeedChange = () => {
		const nextSpeed = speedMultiplier === 1.0 ? 1.5 : speedMultiplier === 1.5 ? 0.5 : 1.0;
		setSpeedMultiplier(nextSpeed);
		if (sceneRef.current) {
			sceneRef.current.setPlaybackSpeed(nextSpeed);
		}
	};

	// Catálogos
	const alphabetLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
	const numbersList = ['0', '1', '2', '3', '4', '5'];
	const wordsList = ['OI', 'OBRIGADO', 'AMIGO', 'FAMILIA', 'PAZ', 'SIM', 'NAO'];

	return (
		<div className='bg-white dark:bg-gray-900 rounded-2xl shadow-md border border-gray-200 dark:border-gray-800 p-4 sm:p-5 flex flex-col gap-4 w-full'>
			{/* Cabeçalho do Assistente */}
			<div className='flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800'>
				<div className='flex items-center gap-2.5'>
					<div className='w-8 h-8 rounded-xl bg-linear-to-tr from-cyan-500 to-teal-500 flex items-center justify-center text-white shadow-sm font-bold text-sm'>
						🦾
					</div>
					<div>
						<h3 className='font-extrabold text-sm sm:text-base text-gray-800 dark:text-gray-100 flex items-center gap-1.5'>
							Assistente Virtual Anatômico
							<span className='text-[10px] px-2 py-0.5 rounded-full font-bold bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800'>
								WebGL 3D
							</span>
						</h3>
						<p className='text-[11px] text-gray-500 dark:text-gray-400'>
							Tutor interativo com 21 juntas anatômicas articuladas
						</p>
					</div>
				</div>

				{onClose && (
					<button
						onClick={onClose}
						className='p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800'
						title='Fechar Assistente'
					>
						✕
					</button>
				)}
			</div>

			{/* VIEWPORT 3D DO ESQUELETO ANATÔMICO */}
			<div className='relative w-full aspect-video sm:aspect-4/3 max-h-[340px] bg-linear-to-b from-gray-950 via-gray-900 to-gray-950 rounded-2xl overflow-hidden border border-gray-800 shadow-inner flex items-center justify-center'>
				{/* Container Canvas Three.js */}
				<div
					ref={containerRef}
					className='w-full h-full cursor-grab active:cursor-grabbing'
					title='Clique e arraste com o mouse para girar em 360°'
				/>

				{/* Badge do Sinal no Topo Direito (Livre de qualquer colisão) */}
				<div className='hidden md:block absolute top-2.5 right-2.5 bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-xl border border-cyan-500/30 text-right z-10 shadow-lg'>
					<span className='text-[10px] uppercase font-bold text-cyan-400 block tracking-wider'>
						Sinal Exibido
					</span>
					<span className='text-base font-black text-white'>{currentPose.label}</span>
				</div>

				{/* Dica de Interação no Rodapé Esquerdo */}
				<div className='absolute bottom-2.5 left-2.5 pointer-events-none bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-white/10 text-[10px] text-gray-300 flex items-center gap-1.5 z-10'>
					<Eye className='w-3 h-3 text-cyan-400 shrink-0' />
					<span className='hidden sm:inline'>Arraste para inspecionar em 360° | Scroll para zoom</span>
					<span className='sm:hidden'>Girar 3D</span>
				</div>

				{/* Controles de Câmera na Base Inferior Direita */}
				<div className='absolute top-2.5 left-2.5 flex items-center gap-1 sm:gap-1.5 bg-black/60 backdrop-blur-md p-1 rounded-xl border border-white/10 z-10 text-[11px] text-white/90 shadow-lg'>
					<button
						onClick={() => handleResetCamera('FRONT')}
						className='px-1 rounded-lg hover:bg-white/15 transition font-semibold min-h-9 flex items-center'
						title='Visão Frontal da Palma'
					>
						Frontal
					</button>
					<button
						onClick={() => handleResetCamera('SIDE')}
						className='px-1 rounded-lg hover:bg-white/15 transition font-semibold min-h-9 flex items-center'
						title='Visão Lateral do Polegar'
					>
						Lateral
					</button>
					<button
						onClick={() => handleResetCamera('TOP')}
						className='px-1 rounded-lg hover:bg-white/15 transition font-semibold min-h-9 flex items-center'
						title='Visão Superior das Falanges'
					>
						Topo
					</button>
					<button
						onClick={handleToggleAutoRotate}
						className={`px-1 rounded-lg transition font-semibold flex items-center gap-1 min-h-9 ${
							isAutoRotating ? 'bg-cyan-500 text-white' : 'hover:bg-white/15'
						}`}
						title='Alternar rotação 360° contínua'
					>
						<RotateCcw className='w-3 h-3' />
						360°
					</button>
				</div>
			</div>

			{/* BARRA DE CONTROLE DE REPRODUÇÃO & SEQUÊNCIA */}
			<div className='flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700'>
				<div className='flex items-center gap-1.5'>
					{sequence.length > 1 && (
						<>
							<button
								onClick={handlePrevSign}
								className='p-2 min-h-10 min-w-10 flex items-center justify-center rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition'
								title='Sinal Anterior'
								aria-label='Sinal anterior'
							>
								<ChevronLeft className='w-4 h-4' />
							</button>
							<button
								onClick={handleTogglePlay}
								className='px-3.5 py-2 min-h-10 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm'
								aria-label={isPlaying ? 'Pausar reprodução' : 'Iniciar reprodução'}
							>
								{isPlaying ? <Pause className='w-3.5 h-3.5' /> : <Play className='w-3.5 h-3.5' />}
								<span>{isPlaying ? 'Pausar' : 'Reproduzir'}</span>
							</button>
							<button
								onClick={handleNextSign}
								className='p-2 min-h-10 min-w-10 flex items-center justify-center rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition'
								title='Próximo Sinal'
								aria-label='Próximo sinal'
							>
								<ChevronRight className='w-4 h-4' />
							</button>
						</>
					)}

					{/* Velocidade de Reprodução */}
					<button
						onClick={handleSpeedChange}
						className='px-3 py-2 min-h-10 text-xs font-bold rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition flex items-center justify-center'
						title='Ajustar velocidade de demonstração anatômica'
					>
						{speedMultiplier}x
					</button>
				</div>

				{/* Indicador de progresso se houver sequência */}
				{sequence.length > 1 && (
					<div className='text-[11px] font-semibold text-gray-500 dark:text-gray-400'>
						Passo {sequenceIndex + 1} de {sequence.length}
					</div>
				)}
			</div>

			{/* CARD DE DETALHES ANATÔMICOS */}
			<div className='p-3.5 rounded-xl bg-cyan-50/70 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800/60 flex items-start gap-3'>
				<div className='p-2 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5'>
					<Info className='w-4 h-4' />
				</div>
				<div className='flex-1'>
					<h4 className='text-xs font-bold text-cyan-950 dark:text-cyan-200 mb-0.5 flex items-center gap-1'>
						<span>Orientação Anatômica:</span>
						<span className='font-extrabold text-teal-600 dark:text-teal-400'>{currentPose.label}</span>
					</h4>
					<p className='text-xs text-gray-700 dark:text-gray-300 leading-relaxed'>
						{currentPose.anatomicalTip}
					</p>
					<div className='mt-2 flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400'>
						<span className='w-2 h-2 rounded-full bg-amber-400 animate-pulse'></span>
						<span>Articulações em amarelo indicam o ponto crítico de flexão</span>
					</div>
				</div>
			</div>

			{/* SELEÇÃO RÁPIDA DE SINAIS DO CATÁLOGO */}
			<div className='flex flex-col gap-2'>
				<div className='flex items-center justify-between'>
					<div className='flex gap-1.5'>
						<button
							onClick={() => setCategoryTab('ALPHABET')}
							className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
								categoryTab === 'ALPHABET'
									? 'bg-cyan-600 text-white shadow-sm'
									: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900'
							}`}
						>
							Alfabeto (A-Z)
						</button>
						<button
							onClick={() => setCategoryTab('NUMBER')}
							className={`py-2 px-3 rounded-lg text-xs font-bold transition min-h-9 flex items-center justify-center ${
								categoryTab === 'NUMBER'
									? 'bg-cyan-600 text-white shadow-sm'
									: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900'
							}`}
						>
							Números (0-5)
						</button>
						<button
							onClick={() => setCategoryTab('WORDS')}
							className={`py-2 px-3 rounded-lg text-xs font-bold transition min-h-9 flex items-center justify-center ${
								categoryTab === 'WORDS'
									? 'bg-cyan-600 text-white shadow-sm'
									: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900'
							}`}
						>
							Expressões
						</button>
					</div>
				</div>

				{/* Grade de Seleção Rápida */}
				<div className='flex flex-wrap gap-1.5 max-h-[150px] overflow-y-auto p-1.5 rounded-xl bg-gray-50/50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-800'>
					{categoryTab === 'ALPHABET' &&
						alphabetLetters.map((letra) => (
							<button
								key={letra}
								onClick={() => handleSelectDirectSign(letra)}
								className={`w-9 h-9 min-h-9 min-w-9 rounded-xl text-xs font-extrabold transition flex items-center justify-center cursor-pointer ${
									activePoseId === letra
										? 'bg-cyan-500 text-white shadow ring-2 ring-cyan-400/50'
										: 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 border border-gray-200 dark:border-gray-700'
								}`}
							>
								{letra}
							</button>
						))}

					{categoryTab === 'NUMBER' &&
						numbersList.map((num) => (
							<button
								key={num}
								onClick={() => handleSelectDirectSign(num)}
								className={`w-9 h-9 min-h-9 min-w-9 rounded-xl text-xs font-extrabold transition flex items-center justify-center cursor-pointer ${
									activePoseId === num
										? 'bg-cyan-500 text-white shadow ring-2 ring-cyan-400/50'
										: 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 border border-gray-200 dark:border-gray-700'
								}`}
							>
								{num}
							</button>
						))}

					{categoryTab === 'WORDS' &&
						wordsList.map((word) => (
							<button
								key={word}
								onClick={() => handleSelectDirectSign(word)}
								className={`px-3.5 py-2 min-h-9 rounded-xl text-xs font-bold transition cursor-pointer ${
									activePoseId === word
										? 'bg-cyan-500 text-white shadow ring-2 ring-cyan-400/50'
										: 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 border border-gray-200 dark:border-gray-700'
								}`}
							>
								{word}
							</button>
						))}
				</div>
			</div>
		</div>
	);
}
