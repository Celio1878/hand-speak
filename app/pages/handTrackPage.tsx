import {Suspense, use, useEffect, useRef, useState} from "react";
import {DrawingUtils, FilesetResolver, HandLandmarker} from "@mediapipe/tasks-vision";

// --- 1. Initialize Model Resource (Cached) ---
// We initialize runningMode directly to "VIDEO" for webcam optimization.
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
        numHands: 2,
      });
    })();
  }
  return landmarkerPromise;
}


export function HandTrackPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 font-sans text-[#3d3d3d]">
      <div className="max-w-4xl w-full px-6">
        <h1 className="text-[#007f8b] text-4xl font-bold mb-2 text-center">
          Hand Tracking
        </h1>
        <p className="text-center text-gray-600 mb-8">
          Real-time hand landmark detection using MediaPipe.
        </p>

        {/* Suspense catches the Promise from the child component */}
        <Suspense
          fallback={
            <div
              className="flex flex-col items-center justify-center h-[480px] bg-gray-200 rounded-xl border-2 border-dashed border-gray-300">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#007f8b] mb-4"></div>
              <p className="font-semibold text-[#007f8b] animate-pulse">
                Loading AI Model & GPU...
              </p>
            </div>
          }
        >
          <WebcamTracker/>
        </Suspense>
      </div>
    </div>
  );
}

// --- 3. Content Component (Webcam Only) ---
function WebcamTracker() {
  // This line suspends execution until the model is ready
  const handLandmarker = use(getHandLandmarker());

  const [webcamRunning, setWebcamRunning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(null);

  // Cleanup loop on unmount
  useEffect(() => {
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      stopCamera();
    };
  }, []);

  function stopCamera() {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  }

  async function toggleWebcam() {
    if (webcamRunning) {
      setWebcamRunning(false);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      stopCamera();
    } else {
      setWebcamRunning(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {width: 1280, height: 720},
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.addEventListener("loadeddata", predictWebcam);
        }
      } catch (err) {
        console.error("Error accessing webcam:", err);
        setWebcamRunning(false);
      }
    }
  }

  async function predictWebcam() {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Safety checks
    if (!video || !canvas) return;

    // 1. Resize canvas to match video stream
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    // 2. Detect
    // We pass performance.now() as the timestamp for Video Mode
    const result = handLandmarker.detectForVideo(video, performance.now());


    // 3. Draw
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const drawingUtils = new DrawingUtils(ctx);

      if (result.landmarks) {
        for (const landmarks of result.landmarks) {
          drawingUtils.drawConnectors(
            landmarks,
            HandLandmarker.HAND_CONNECTIONS,
            {color: "#00FF00", lineWidth: 2}
          );
          drawingUtils.drawLandmarks(landmarks, {
            color: "#FF0000",
            lineWidth: 2,
          });
        }
      }
    }

    // 4. Loop if camera is still active
    if (video.srcObject) {
      requestRef.current = requestAnimationFrame(predictWebcam);
    }
  }

  return (
    <div className="flex flex-col items-center w-full">
      {/* Control Button */}
      <button
        onClick={toggleWebcam}
        className={`cursor-pointer px-8 py-3 rounded-lg font-bold text-white shadow-md transition-all duration-300 mb-6
          ${webcamRunning
          ? "bg-red-500 hover:bg-red-600 shadow-red-200"
          : "bg-emerald-400 hover:bg-emerald-500 shadow-teal-200"
        }`}
      >
        {webcamRunning ? "STOP CAMERA" : "ENABLE CAMERA"}
      </button>

      {/* Video Container */}
      <div
        className="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow">

        {/* Placeholder text when camera is off */}
        {!webcamRunning && (
          <div className="absolute inset-0 flex items-center justify-center text-white/50">
            <p>Camera is disabled</p>
          </div>
        )}

        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute top-0 left-0 w-full h-full object-cover transform -scale-x-100"
        ></video>

        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full object-cover transform -scale-x-100 pointer-events-none"
        ></canvas>
      </div>

      {webcamRunning && (
        <p className="mt-4 text-sm text-gray-500">
          Bring your hands into view to see landmarks.
        </p>
      )}
    </div>
  );
}