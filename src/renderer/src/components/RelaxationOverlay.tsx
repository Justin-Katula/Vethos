/* eslint-disable react/no-unknown-property */
import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { cn } from '@/lib/cn'

const vertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const fragmentShader = `
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
varying vec2 vUv;

float wave(vec2 p, float speed, float scale, float strength) {
  return sin((p.x * scale + p.y * (scale * 0.55)) + uTime * speed) * strength;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float flow =
    wave(p, 0.22, 3.0, 0.18) +
    wave(p.yx + vec2(0.12, -0.18), -0.16, 4.8, 0.11) +
    wave(p + vec2(sin(uTime * 0.08) * 0.18, cos(uTime * 0.06) * 0.14), 0.10, 7.0, 0.06);

  float mist = smoothstep(0.72, -0.18, length(p + vec2(flow * 0.24, flow * 0.12)));
  vec3 deep = vec3(0.015, 0.035, 0.075);
  vec3 blue = vec3(0.05, 0.20, 0.34);
  vec3 cyan = vec3(0.22, 0.55, 0.68);
  vec3 violet = vec3(0.10, 0.13, 0.26);

  vec3 color = mix(deep, blue, mist);
  color = mix(color, cyan, smoothstep(0.08, 0.42, flow + mist * 0.35) * 0.34);
  color = mix(color, violet, smoothstep(0.18, 0.92, uv.y) * 0.38);
  color += vec3(0.015, 0.035, 0.055) * sin((uv.x + uv.y + uTime * 0.03) * 8.0);

  float vignette = smoothstep(0.95, 0.18, length(p));
  gl_FragColor = vec4(color * vignette, 1.0);
}
`

type ShaderUniforms = {
  uTime: { value: number }
  uResolution: { value: THREE.Vector2 }
}

function ShaderPlane(): JSX.Element {
  const material = useRef<THREE.ShaderMaterial | null>(null)
  const uniforms = useMemo<ShaderUniforms>(
    () => ({
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
    }),
    [],
  )

  useFrame(({ clock, size }) => {
    if (!material.current) return
    material.current.uniforms.uTime!.value = clock.getElapsedTime()
    material.current.uniforms.uResolution!.value.set(size.width, size.height)
  })

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  )
}

type RelaxationOverlayProps = {
  isActive: boolean
  foreground?: boolean
  className?: string
}

export function RelaxationOverlay({
  isActive,
  foreground = false,
  className,
}: RelaxationOverlayProps): JSX.Element | null {
  if (!isActive) return null

  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 h-screen w-screen overflow-hidden transition-opacity duration-700',
        foreground ? 'z-50 opacity-95' : 'z-0 opacity-[0.72]',
        className,
      )}
    >
      <Canvas
        frameloop="always"
        dpr={[1, 1.25]}
        gl={{ antialias: false, alpha: false, powerPreference: 'low-power' }}
        className="h-full w-full"
      >
        <ShaderPlane />
      </Canvas>
      <div className="absolute inset-0 bg-bg-base/10" />
    </div>
  )
}

export { ShaderPlane }
