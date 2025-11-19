import {Suspense, use, useEffect, useRef, useState} from "react";
import {DrawingUtils, FilesetResolver, HandLandmarker} from "@mediapipe/tasks-vision";
import {analyzeHandSign} from "~/components/libras-logic"; // Your existing logic
import {processTranscription} from "~/components/transcription-engine"; // The new file above

// --- Resource Initialization ---
let landmarkerPromise: Promise<HandLandmarker> | null = null;

function getHandLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
      );
      return await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 1,
      });
    })();
  }
  return landmarkerPromise;
}

export function HandTrackPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 font-sans text-[#3d3d3d]">
      <div className="max-w-3xl w-full px-4">
        <h1 className="text-[#007f8b] text-4xl font-bold mb-6 text-center">
          LIBRAS Writer
        </h1>

        <Suspense fallback={<div className="text-center mt-20">Loading AI...</div>}>
          <WebcamWriter/>
        </Suspense>
      </div>
    </div>
  );
}

function WebcamWriter() {
  const handLandmarker = use(getHandLandmarker());
  const [webcamRunning, setWebcamRunning] = useState(false);

  // Transcription State
  const [transcript, setTranscript] = useState("");
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [lockProgress, setLockProgress] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(null);
  // const lastPredictionTime = useRef<number>(0);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  function stopCamera() {
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    if (videoRef.current && videoRef.current.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
  }

  async function toggleWebcam() {
    if (webcamRunning) {
      setWebcamRunning(false);
      stopCamera();
    } else {
      setWebcamRunning(true);
      const stream = await navigator.mediaDevices.getUserMedia({video: {width: 1280, height: 720}});
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.addEventListener("loadeddata", predictWebcam);
      }
    }
  }

  async function predictWebcam() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    if (video.videoWidth > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    const startTime = performance.now();
    const result = handLandmarker.detectForVideo(video, startTime);

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const drawingUtils = new DrawingUtils(ctx);

      // 1. Check for Hand
      let detectedChar = null;

      if (result.landmarks && result.landmarks.length > 0) {
        const landmarks = result.landmarks[0];
        const handedness = result.handedness[0][0];

        // Draw Skeleton
        drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
          color: "rgba(0,255,0,0.5)",
          lineWidth: 2
        });
        drawingUtils.drawLandmarks(landmarks, {color: "#FF0000", lineWidth: 1});

        // Get Raw Letter from your Logic
        const gesture = analyzeHandSign(landmarks, handedness);
        if (gesture) detectedChar = gesture.letter;
      }

      // 2. Process Transcription (Hold-to-Type Logic)
      // We update state 60fps for smooth progress bar, but logic handles timing
      const {currentLetter, progress, confirmedLetter} = processTranscription(detectedChar);

      setActiveLetter(currentLetter);
      setLockProgress(progress);

      // 3. If confirmed, append to text
      if (confirmedLetter) {
        setTranscript((prev) => prev + confirmedLetter);
        // Optional: Add haptic feedback here
        if (navigator.vibrate) navigator.vibrate(50);
      }
    }

    if (video.srcObject) {
      requestRef.current = requestAnimationFrame(predictWebcam);
    }
  }

  // Helper to handle Space/Backspace
  const handleSpace = () => setTranscript(t => t + " ");
  const handleBackspace = () => setTranscript(t => t.slice(0, -1));
  const handleClear = () => setTranscript("");

  return (
    <div className="flex flex-col items-center w-full gap-6">

      {/* --- CAMERA AREA --- */}
      <div
        className="relative w-full max-w-[640px] aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border-4 border-white">
        {!webcamRunning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50 z-20 bg-black/80">
            <button onClick={toggleWebcam}
                    className="bg-[#007f8b] text-white px-6 py-3 rounded-full font-bold hover:scale-105 transition">
              Start Camera
            </button>
          </div>
        )}

        <video ref={videoRef} autoPlay playsInline muted
               className="absolute inset-0 w-full h-full object-cover transform -scale-x-100"/>
        <canvas ref={canvasRef}
                className="absolute inset-0 w-full h-full object-cover transform -scale-x-100 pointer-events-none"/>

        {/* --- OVERLAY: PROGRESS RING --- */}
        {webcamRunning && activeLetter && (
          <div className="absolute top-4 right-4 z-30">
            <div
              className="relative flex items-center justify-center w-20 h-20 bg-black/60 backdrop-blur-md rounded-full border-2 border-white/20">
              {/* Progress Circle SVG */}
              <svg className="absolute w-full h-full transform -rotate-90 p-1">
                <circle cx="50%" cy="50%" r="36" stroke="white" strokeWidth="4" fill="transparent" strokeOpacity="0.2"/>
                <circle
                  cx="50%" cy="50%" r="36"
                  stroke="#00FF00" strokeWidth="4" fill="transparent"
                  strokeDasharray="226"
                  strokeDashoffset={226 - (226 * lockProgress) / 100}
                  className="transition-all duration-75 ease-linear"
                />
              </svg>
              <span className="text-4xl font-bold text-white">{activeLetter}</span>
            </div>
            <p className="text-white/80 text-xs text-center mt-2 font-semibold">HOLD TO TYPE</p>
          </div>
        )}
      </div>

      {/* --- TRANSCRIPTION BOARD --- */}
      <div className="w-full max-w-[640px] bg-white rounded-xl shadow-lg p-6 border border-gray-200">
        <div className="flex justify-between items-end mb-2">
          <h3 className="text-gray-500 text-sm font-bold uppercase tracking-wider">Transcription</h3>
          <div className="flex gap-2">
            <button onClick={handleSpace}
                    className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm font-medium">SPACE
            </button>
            <button onClick={handleBackspace}
                    className="px-3 py-1 bg-gray-100 hover:bg-red-100 text-red-600 rounded text-sm font-medium">⌫
            </button>
          </div>
        </div>

        <div
          className="min-h-[80px] bg-gray-50 rounded-lg p-4 text-2xl font-mono text-gray-800 break-words border-2 border-dashed border-gray-200 flex items-center">
          {transcript || <span className="text-gray-300 italic">Start signing to write...</span>}
          <span className="w-2 h-8 bg-[#007f8b] ml-1 animate-pulse"></span>
        </div>

        <div className="mt-4 flex justify-between">
          <button onClick={handleClear} className="text-red-500 text-sm hover:underline">Clear All</button>
          <span className="text-xs text-gray-400">Hold a sign for 1.2s to confirm</span>
        </div>
      </div>

    </div>
  );
}