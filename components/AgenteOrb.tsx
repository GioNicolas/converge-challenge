"use client";

// O rosto do entrevistador: um orb líquido em WebGL que reage à voz.
// Adaptado do Orb da ElevenLabs UI (github.com/elevenlabs/ui, licença MIT):
// - sem @react-three/drei (a textura carrega pelo próprio fiber) e com a textura local (public/agente/ruido.png);
// - estados do nosso agente: ouvindo (segue o microfone), falando, pensando e com dúvida (o plin).
import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";

export type EstadoAgente = "ouvindo" | "pensando" | "falando" | "duvida";

/** Cores do agente: [mais escura, mais clara]. Na dúvida, ficam mais vivas. */
const CORES: Record<"normal" | "duvida", [string, string]> = {
  normal: ["#2f6fd6", "#a9cdfb"],
  duvida: ["#0a64e8", "#7fd0ff"],
};

type Props = {
  estado: EstadoAgente;
  /** Volume do microfone do candidato (0 a 1), lido a cada quadro. */
  volumeEntrada?: React.RefObject<number>;
  /** Volume da voz do agente (0 a 1). Sem ele, a fala anima sozinha. */
  volumeSaida?: React.RefObject<number>;
  className?: string;
};

export default function AgenteOrb({ estado, volumeEntrada, volumeSaida, className }: Props) {
  return (
    <div className={className ?? "relative h-full w-full"}>
      <Canvas resize={{ debounce: 100 }} gl={{ alpha: true, antialias: true, premultipliedAlpha: true }}>
        <Suspense fallback={null}>
          <Cena estado={estado} volumeEntrada={volumeEntrada} volumeSaida={volumeSaida} />
        </Suspense>
      </Canvas>
    </div>
  );
}

const limitar = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

function Cena({ estado, volumeEntrada, volumeSaida }: Omit<Props, "className">) {
  const { gl } = useThree();
  const circulo = useRef<THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial>>(null);
  const ruido = useLoader(THREE.TextureLoader, "/agente/ruido.png");
  const estadoRef = useRef(estado);
  const cor1 = useRef(new THREE.Color(CORES.normal[0]));
  const cor2 = useRef(new THREE.Color(CORES.normal[1]));
  const entrada = useRef(0);
  const saida = useRef(0);
  const velocidade = useRef(0.1);

  useEffect(() => {
    estadoRef.current = estado;
    const [a, b] = estado === "duvida" ? CORES.duvida : CORES.normal;
    cor1.current.set(a);
    cor2.current.set(b);
  }, [estado]);

  const deslocamentos = useMemo(() => {
    let s = 0x2f6fd6;
    const aleatorio = () => {
      s = (s + 0x9e3779b9) | 0;
      let t = s ^ (s >>> 16);
      t = Math.imul(t, 0x21f0aaad);
      t ^= t >>> 15;
      t = Math.imul(t, 0x735a2d97);
      return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
    };
    return new Float32Array(Array.from({ length: 7 }, () => aleatorio() * Math.PI * 2));
  }, []);

  const uniforms = useMemo(() => {
    ruido.wrapS = THREE.RepeatWrapping;
    ruido.wrapT = THREE.RepeatWrapping;
    return {
      uColor1: new THREE.Uniform(new THREE.Color(CORES.normal[0])),
      uColor2: new THREE.Uniform(new THREE.Color(CORES.normal[1])),
      uOffsets: { value: deslocamentos },
      uPerlinTexture: new THREE.Uniform(ruido),
      uTime: new THREE.Uniform(0),
      uAnimation: new THREE.Uniform(0.1),
      uInverted: new THREE.Uniform(0),
      uInputVolume: new THREE.Uniform(0),
      uOutputVolume: new THREE.Uniform(0),
      uOpacity: new THREE.Uniform(0),
    };
  }, [ruido, deslocamentos]);

  useFrame((_, delta) => {
    const mat = circulo.current?.material;
    if (!mat) return;
    const u = mat.uniforms;
    u.uTime.value += delta * 0.5;
    if (u.uOpacity.value < 1) u.uOpacity.value = Math.min(1, u.uOpacity.value + delta * 2);

    // O que cada estado faz com a "entrada" (anéis) e a "saída" (fluxo) do orb.
    const t = u.uTime.value * 2;
    let alvoEntrada = 0;
    let alvoSaida = 0.3;
    switch (estadoRef.current) {
      case "ouvindo":
        alvoEntrada = limitar((volumeEntrada?.current ?? 0) * 1.8);
        alvoSaida = 0.32;
        break;
      case "falando": {
        const voz = volumeSaida?.current ?? 0;
        alvoEntrada = voz > 0.02 ? limitar(voz) : limitar(0.65 + Math.sin(t * 4.8) * 0.22);
        alvoSaida = voz > 0.02 ? limitar(0.5 + voz * 0.5) : limitar(0.75 + Math.sin(t * 3.6) * 0.22);
        break;
      }
      case "pensando":
        alvoEntrada = limitar(0.38 + 0.07 * Math.sin(t * 0.7) + 0.05 * Math.sin(t * 2.1) * Math.sin(t * 0.37 + 1.2));
        alvoSaida = limitar(0.48 + 0.12 * Math.sin(t * 1.05 + 0.6));
        break;
      case "duvida":
        // Pulsa num ritmo calmo, chamando o clique.
        alvoEntrada = limitar(0.45 + 0.4 * Math.max(0, Math.sin(t * 2.2)));
        alvoSaida = 0.6;
        break;
    }
    entrada.current += (alvoEntrada - entrada.current) * 0.2;
    saida.current += (alvoSaida - saida.current) * 0.2;
    const alvoVelocidade = 0.1 + (1 - Math.pow(saida.current - 1, 2)) * 0.9;
    velocidade.current += (alvoVelocidade - velocidade.current) * 0.12;

    u.uAnimation.value += delta * velocidade.current;
    u.uInputVolume.value = entrada.current;
    u.uOutputVolume.value = saida.current;
    u.uColor1.value.lerp(cor1.current, 0.08);
    u.uColor2.value.lerp(cor2.current, 0.08);
  });

  // Se o navegador derrubar o contexto WebGL, recupera sozinho.
  useEffect(() => {
    const canvas = gl.domElement;
    const aoPerder = (e: Event) => {
      e.preventDefault();
      setTimeout(() => gl.forceContextRestore(), 1);
    };
    canvas.addEventListener("webglcontextlost", aoPerder, false);
    return () => canvas.removeEventListener("webglcontextlost", aoPerder, false);
  }, [gl]);

  return (
    <mesh ref={circulo}>
      <circleGeometry args={[3.5, 64]} />
      <shaderMaterial uniforms={uniforms} fragmentShader={FRAGMENT} vertexShader={VERTEX} transparent />
    </mesh>
  );
}

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uAnimation;
uniform float uInverted;
uniform float uOffsets[7];
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform float uInputVolume;
uniform float uOutputVolume;
uniform float uOpacity;
uniform sampler2D uPerlinTexture;
varying vec2 vUv;

const float PI = 3.14159265358979323846;

bool drawOval(vec2 polarUv, vec2 polarCenter, float a, float b, bool reverseGradient, float softness, out vec4 color) {
  vec2 p = polarUv - polarCenter;
  float oval = (p.x * p.x) / (a * a) + (p.y * p.y) / (b * b);
  float edge = smoothstep(1.0, 1.0 - softness, oval);
  if (edge > 0.0) {
    float gradient = reverseGradient ? (1.0 - (p.x / a + 1.0) / 2.0) : ((p.x / a + 1.0) / 2.0);
    gradient = mix(0.5, gradient, 0.1);
    color = vec4(vec3(gradient), 0.85 * edge);
    return true;
  }
  return false;
}

vec3 colorRamp(float grayscale, vec3 color1, vec3 color2, vec3 color3, vec3 color4) {
  if (grayscale < 0.33) return mix(color1, color2, grayscale * 3.0);
  if (grayscale < 0.66) return mix(color2, color3, (grayscale - 0.33) * 3.0);
  return mix(color3, color4, (grayscale - 0.66) * 3.0);
}

vec2 hash2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

float noise2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float n = mix(
    mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)), dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y);
  return 0.5 + 0.5 * n;
}

float sharpRing(vec3 decomposed, float time) {
  float noise = mix(noise2D(vec2(decomposed.x, time) * 5.0), noise2D(vec2(decomposed.y, time) * 5.0), decomposed.z);
  noise = (noise - 0.5) * 2.5;
  return 1.0 + noise * 0.3 * 1.5;
}

float smoothRing(vec3 decomposed, float time) {
  float noise = mix(noise2D(vec2(decomposed.x, time) * 6.0), noise2D(vec2(decomposed.y, time) * 6.0), decomposed.z);
  noise = (noise - 0.5) * 5.0;
  return 0.9 + noise * 0.2;
}

float flow(vec3 decomposed, float time) {
  return mix(
    texture(uPerlinTexture, vec2(time, decomposed.x / 2.0)).r,
    texture(uPerlinTexture, vec2(time, decomposed.y / 2.0)).r,
    decomposed.z);
}

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  float radius = length(uv);
  float theta = atan(uv.y, uv.x);
  if (theta < 0.0) theta += 2.0 * PI;

  vec3 decomposed = vec3(theta / (2.0 * PI), mod(theta / (2.0 * PI) + 0.5, 1.0) + 1.0, abs(theta / PI - 1.0));

  float noise = flow(decomposed, radius * 0.03 - uAnimation * 0.2) - 0.5;
  theta += noise * mix(0.08, 0.25, uOutputVolume);

  vec4 color = vec4(1.0, 1.0, 1.0, 1.0);
  float originalCenters[7] = float[7](0.0, 0.5 * PI, 1.0 * PI, 1.5 * PI, 2.0 * PI, 2.5 * PI, 3.0 * PI);
  float centers[7];
  for (int i = 0; i < 7; i++) centers[i] = originalCenters[i] + 0.5 * sin(uTime / 20.0 + uOffsets[i]);

  float a, b;
  vec4 ovalColor;
  for (int i = 0; i < 7; i++) {
    float n = texture(uPerlinTexture, vec2(mod(centers[i] + uTime * 0.05, 1.0), 0.5)).r;
    a = 0.5 + n * 0.3;
    b = n * mix(3.5, 2.5, uInputVolume);
    bool reverseGradient = (i % 2 == 1);
    float distTheta = min(abs(theta - centers[i]), min(abs(theta + 2.0 * PI - centers[i]), abs(theta - 2.0 * PI - centers[i])));
    if (drawOval(vec2(distTheta, radius), vec2(0.0, 0.0), a, b, reverseGradient, 0.6, ovalColor)) {
      color.rgb = mix(color.rgb, ovalColor.rgb, ovalColor.a);
      color.a = max(color.a, ovalColor.a);
    }
  }

  float ringRadius1 = sharpRing(decomposed, uTime * 0.1);
  float ringRadius2 = smoothRing(decomposed, uTime * 0.1);
  float inputRadius1 = radius + uInputVolume * 0.2;
  float inputRadius2 = radius + uInputVolume * 0.15;
  float opacity1 = mix(0.2, 0.6, uInputVolume);
  float opacity2 = mix(0.15, 0.45, uInputVolume);
  float ringAlpha1 = (inputRadius2 >= ringRadius1) ? opacity1 : 0.0;
  float ringAlpha2 = smoothstep(ringRadius2 - 0.05, ringRadius2 + 0.05, inputRadius1) * opacity2;
  float totalRingAlpha = max(ringAlpha1, ringAlpha2);
  color.rgb = 1.0 - (1.0 - color.rgb) * (1.0 - vec3(1.0) * totalRingAlpha);

  float luminance = mix(color.r, 1.0 - color.r, uInverted);
  color.rgb = colorRamp(luminance, vec3(0.0), uColor1, uColor2, vec3(1.0));
  color.a *= uOpacity;
  gl_FragColor = color;
}
`;
