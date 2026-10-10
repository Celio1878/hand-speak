import * as THREE from "three";
import {
  HAND_CONNECTIONS,
  type Point3D,
  interpolateHandPoses,
} from "./anatomical-hand-poses";

export class AnatomicalHandScene {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private animFrameId: number | null = null;

  // Malhas 3D
  private jointMeshes: THREE.Mesh[] = [];
  private boneMeshes: THREE.Mesh[] = [];
  private palmMesh: THREE.Mesh | null = null;

  // Materiais reutilizáveis
  private jointMaterialNormal: THREE.MeshStandardMaterial;
  private jointMaterialActive: THREE.MeshStandardMaterial;
  private boneMaterial: THREE.MeshStandardMaterial;
  private sharedSphereGeo: THREE.SphereGeometry;
  private sharedCylinderGeo: THREE.CylinderGeometry;

  // Estado de pose e animação
  private currentLandmarks: Point3D[];
  private targetLandmarks: Point3D[];
  private activeJoints: Set<number> = new Set();
  private transitionProgress: number = 1.0;
  private transitionSpeed: number = 3.5; // Velocidade do lerp

  // Controle de Órbita e Interação do Usuário
  private isDragging = false;
  private previousMousePosition = { x: 0, y: 0 };
  private cameraDistance = 3.6;
  private theta = 0; // Rotação horizontal em radianos
  private phi = Math.PI / 2.3; // Elevação vertical em radianos
  private autoRotate = false;

  constructor(container: HTMLElement, initialLandmarks: Point3D[]) {
    this.container = container;
    this.currentLandmarks = [...initialLandmarks];
    this.targetLandmarks = [...initialLandmarks];

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 400;

    // 1. Cena
    this.scene = new THREE.Scene();
    this.scene.background = null; // Fundo transparente para combinar com a UI do tema

    // 2. Câmera
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.updateCameraPosition();

    // 3. Renderer WebGL com antialias e cores vibrantes
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    container.appendChild(this.renderer.domElement);

    // 4. Iluminação Cibernética Estilizada
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x00e5ff, 2.2); // Luz Ciano
    dirLight1.position.set(3, 5, 4);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x10b981, 1.4); // Luz Esmeralda de Contorno
    dirLight2.position.set(-3, -2, -3);
    this.scene.add(dirLight2);

    const pointLight = new THREE.PointLight(0xffffff, 1.0, 10);
    pointLight.position.set(0, 0, 3);
    this.scene.add(pointLight);

    // 5. Materiais Compartilhados
    this.jointMaterialNormal = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: 0x00838f,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.8,
    });

    this.jointMaterialActive = new THREE.MeshStandardMaterial({
      color: 0xffd600, // Amarelo luminoso em juntas ativas
      emissive: 0xff9100,
      emissiveIntensity: 1.0,
      roughness: 0.1,
      metalness: 0.9,
    });

    this.boneMaterial = new THREE.MeshStandardMaterial({
      color: 0x374151, // Grafite metálico moderno
      roughness: 0.35,
      metalness: 0.75,
    });

    this.sharedSphereGeo = new THREE.SphereGeometry(0.07, 16, 16);
    // Cilindro com altura 1 alinhado verticalmente no eixo Y
    this.sharedCylinderGeo = new THREE.CylinderGeometry(0.038, 0.038, 1, 12);

    // 6. Construção da Malha Anatômica
    this.buildSkeleton();

    // 7. Eventos de Interação (Órbita com Mouse / Touch)
    this.setupInteractionListeners();

    // 8. Início do Loop de Renderização 60 FPS
    this.renderLoop();
  }

  private buildSkeleton() {
    // 21 Juntas Articulares (Esferas)
    for (let i = 0; i < 21; i++) {
      const jointMesh = new THREE.Mesh(this.sharedSphereGeo, this.jointMaterialNormal);
      this.scene.add(jointMesh);
      this.jointMeshes.push(jointMesh);
    }

    // 20 Conexões Ósseas / Falanges (Cilindros)
    for (let i = 0; i < HAND_CONNECTIONS.length; i++) {
      const boneMesh = new THREE.Mesh(this.sharedCylinderGeo, this.boneMaterial);
      this.scene.add(boneMesh);
      this.boneMeshes.push(boneMesh);
    }

    // Malha Translúcida da Palma (Metacarpos)
    const palmGeo = new THREE.BufferGeometry();
    // 4 triângulos conectando Wrist(0), Index(5), Middle(9), Ring(13), Pinky(17)
    const indices = [0, 5, 9, 0, 9, 13, 0, 13, 17];
    const vertices = new Float32Array(indices.length * 3);
    palmGeo.setAttribute("position", new THREE.BufferAttribute(vertices, 3));

    const palmMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.palmMesh = new THREE.Mesh(palmGeo, palmMat);
    this.scene.add(this.palmMesh);

    this.updateMeshPositions(this.currentLandmarks);
  }

  private updateMeshPositions(landmarks: Point3D[]) {
    // Atualiza Juntas
    for (let i = 0; i < 21; i++) {
      const lm = landmarks[i];
      if (lm && this.jointMeshes[i]) {
        this.jointMeshes[i].position.set(lm.x, lm.y, lm.z);
        const isActive = this.activeJoints.has(i);
        this.jointMeshes[i].material = isActive
          ? this.jointMaterialActive
          : this.jointMaterialNormal;
      }
    }

    // Atualiza Ossos (Posiciona e rotaciona cilindro entre [idxA, idxB])
    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vMid = new THREE.Vector3();
    const vDir = new THREE.Vector3();
    const upAxis = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < HAND_CONNECTIONS.length; i++) {
      const [idxA, idxB] = HAND_CONNECTIONS[i];
      const lmA = landmarks[idxA];
      const lmB = landmarks[idxB];
      const bone = this.boneMeshes[i];

      if (lmA && lmB && bone) {
        vA.set(lmA.x, lmA.y, lmA.z);
        vB.set(lmB.x, lmB.y, lmB.z);

        const length = vA.distanceTo(vB);
        vMid.addVectors(vA, vB).multiplyScalar(0.5);
        vDir.subVectors(vB, vA).normalize();

        bone.position.copy(vMid);
        bone.scale.set(1, Math.max(0.01, length), 1);
        bone.quaternion.setFromUnitVectors(upAxis, vDir);
      }
    }

    // Atualiza Triângulos da Palma
    if (this.palmMesh) {
      const palmPos = this.palmMesh.geometry.attributes.position as THREE.BufferAttribute;
      const indices = [0, 5, 9, 0, 9, 13, 0, 13, 17];
      for (let k = 0; k < indices.length; k++) {
        const pt = landmarks[indices[k]];
        if (pt) {
          palmPos.setXYZ(k, pt.x, pt.y, pt.z);
        }
      }
      palmPos.needsUpdate = true;
    }
  }

  private updateCameraPosition() {
    // Esféricas para Cartesianas
    const x = this.cameraDistance * Math.sin(this.phi) * Math.sin(this.theta);
    const y = this.cameraDistance * Math.cos(this.phi);
    const z = this.cameraDistance * Math.sin(this.phi) * Math.cos(this.theta);

    this.camera.position.set(x, y, z);
    // Olhando para o centro da mão (aproximadamente na altura dos metacarpos)
    this.camera.lookAt(0, 0, 0.1);
  }

  private setupInteractionListeners() {
    const el = this.renderer.domElement;

    const onPointerDown = (clientX: number, clientY: number) => {
      this.isDragging = true;
      this.previousMousePosition = { x: clientX, y: clientY };
    };

    const onPointerMove = (clientX: number, clientY: number) => {
      if (!this.isDragging) return;

      const deltaX = clientX - this.previousMousePosition.x;
      const deltaY = clientY - this.previousMousePosition.y;

      // Sensibilidade de rotação
      this.theta -= deltaX * 0.01;
      this.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.phi - deltaY * 0.01));

      this.previousMousePosition = { x: clientX, y: clientY };
      this.updateCameraPosition();
    };

    const onPointerUp = () => {
      this.isDragging = false;
    };

    // Eventos de Mouse
    el.addEventListener("mousedown", (e) => onPointerDown(e.clientX, e.clientY));
    window.addEventListener("mousemove", (e) => onPointerMove(e.clientX, e.clientY));
    window.addEventListener("mouseup", onPointerUp);

    // Eventos de Touch Mobile
    el.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length === 1) {
          onPointerDown(e.touches[0].clientX, e.touches[0].clientY);
        }
      },
      { passive: true }
    );
    window.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches.length === 1) {
          onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
        }
      },
      { passive: true }
    );
    window.addEventListener("touchend", onPointerUp);

    // Zoom via Scroll Wheel
    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.cameraDistance = Math.max(2.0, Math.min(6.5, this.cameraDistance + e.deltaY * 0.003));
        this.updateCameraPosition();
      },
      { passive: false }
    );
  }

  private renderLoop = () => {
    // Interpolação suave em direção ao target
    if (this.transitionProgress < 1.0) {
      this.transitionProgress = Math.min(1.0, this.transitionProgress + 0.05 * this.transitionSpeed);
      this.currentLandmarks = interpolateHandPoses(
        this.currentLandmarks,
        this.targetLandmarks,
        this.transitionProgress
      );
      this.updateMeshPositions(this.currentLandmarks);
    }

    if (this.autoRotate && !this.isDragging) {
      this.theta += 0.008;
      this.updateCameraPosition();
    }

    this.renderer.render(this.scene, this.camera);
    this.animFrameId = requestAnimationFrame(this.renderLoop);
  };

  // --- Métodos Públicos da API do Assistente ---

  public setPose(target: Point3D[], activeJoints: number[] = [], immediate = false) {
    this.targetLandmarks = [...target];
    this.activeJoints = new Set(activeJoints);

    if (immediate) {
      this.currentLandmarks = [...target];
      this.transitionProgress = 1.0;
      this.updateMeshPositions(this.currentLandmarks);
    } else {
      this.transitionProgress = 0.0;
    }
  }

  public setPlaybackSpeed(speedMultiplier: number) {
    this.transitionSpeed = Math.max(1.0, Math.min(8.0, 3.5 * speedMultiplier));
  }

  public resetView(preset: "FRONT" | "SIDE" | "TOP" = "FRONT") {
    if (preset === "FRONT") {
      this.theta = 0;
      this.phi = Math.PI / 2.3;
      this.cameraDistance = 3.6;
    } else if (preset === "SIDE") {
      this.theta = Math.PI / 2;
      this.phi = Math.PI / 2.3;
      this.cameraDistance = 3.6;
    } else if (preset === "TOP") {
      this.theta = 0;
      this.phi = 0.2;
      this.cameraDistance = 3.8;
    }
    this.updateCameraPosition();
  }

  public toggleAutoRotate() {
    this.autoRotate = !this.autoRotate;
    return this.autoRotate;
  }

  public resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public dispose() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    // Descarte de geometrias e materiais
    this.sharedSphereGeo.dispose();
    this.sharedCylinderGeo.dispose();
    this.jointMaterialNormal.dispose();
    this.jointMaterialActive.dispose();
    this.boneMaterial.dispose();

    if (this.palmMesh) {
      this.palmMesh.geometry.dispose();
      (this.palmMesh.material as THREE.Material).dispose();
    }

    this.jointMeshes.forEach((m) => {
      this.scene.remove(m);
    });
    this.boneMeshes.forEach((m) => {
      this.scene.remove(m);
    });

    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
