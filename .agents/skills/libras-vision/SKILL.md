---
name: libras-vision
description: "Habilidade de Visão Computacional 3D para extração de landmarks e reconhecimento de Libras com MediaPipe Tasks Vision"
---

# Libras Vision Skill

Esta skill fornece diretrizes matemáticas e algoritmos para analisar landmarks de mãos 3D extraídos pelo MediaPipe Tasks Vision.

## 1. Topologia das Mãos do MediaPipe (21 Landmarks)
- **0**: Pulso (Wrist)
- **1-4**: Polegar (CMC, MCP, IP, Tip)
- **5-8**: Indicador (MCP, PIP, DIP, Tip)
- **9-12**: Médio (MCP, PIP, DIP, Tip)
- **13-16**: Anelar (MCP, PIP, DIP, Tip)
- **17-20**: Mínimo (MCP, PIP, DIP, Tip)

## 2. Invariância de Escala e Distância
Nunca compare distâncias euclidianas absolutas entre pontos em pixels ou normalizados brutos sem referenciar a escala da mão.
Para normalizar:
```typescript
// Distância do pulso ao MCP do dedo médio define a escala da mão
export function getHandScale(landmarks: NormalizedLandmark[]): number {
  const wrist = landmarks[0];
  const middleMcp = landmarks[9];
  return Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y, (middleMcp.z || 0) - (wrist.z || 0)) || 0.1;
}
```

## 3. Vetor Normal da Palma (Orientação 3D)
A orientação da palma é obtida através do produto vetorial entre o vetor `Wrist -> Index MCP` e `Wrist -> Pinky MCP`:
```typescript
export function getPalmNormal(landmarks: NormalizedLandmark[], isRightHand: boolean) {
  const p0 = landmarks[0];
  const p5 = landmarks[5];  // Index MCP
  const p17 = landmarks[17]; // Pinky MCP

  const v1 = { x: p5.x - p0.x, y: p5.y - p0.y, z: (p5.z || 0) - (p0.z || 0) };
  const v2 = { x: p17.x - p0.x, y: p17.y - p0.y, z: (p17.z || 0) - (p0.z || 0) };

  // Cross product
  let nx = v1.y * v2.z - v1.z * v2.y;
  let ny = v1.z * v2.x - v1.x * v2.z;
  let nz = v1.x * v2.y - v1.y * v2.x;

  const len = Math.hypot(nx, ny, nz) || 1;
  const factor = isRightHand ? 1 : -1;
  return { x: (nx / len) * factor, y: (ny / len) * factor, z: (nz / len) * factor };
}
```

## 4. Cálculo de Flexão Articular dos Dedos
Para determinar se um dedo está aberto ou fechado, meça o ângulo de flexão entre as juntas ou a distância da ponta à base (MCP) dividida pelo comprimento do dedo.
- Dedo esticado: distância `Tip -> MCP` próxima do comprimento máximo (razão > 0.85).
- Dedo flexionado/fechado: ponta próxima da articulação MCP (razão < 0.50).
