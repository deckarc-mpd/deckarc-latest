import React, { useEffect, useRef } from 'react';

export interface VoiceOrbProps {
  status?: 'idle' | 'listening' | 'speaking';
  className?: string;
}

interface Point3D {
  x: number;
  y: number;
  z: number;
}

const DOT_COUNT = 280;
const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;
const GOLDEN_ANGLE = 2 * Math.PI * (1 - 1 / GOLDEN_RATIO);

// Pre-generate ~280 Fibonacci sphere points
const SPHERE_POINTS: Point3D[] = (() => {
  const points: Point3D[] = [];
  for (let i = 0; i < DOT_COUNT; i++) {
    // y goes from 1 to -1
    const y = 1 - (i / (DOT_COUNT - 1)) * 2;
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = GOLDEN_ANGLE * i;

    const x = Math.cos(theta) * radiusAtY;
    const z = Math.sin(theta) * radiusAtY;
    points.push({ x, y, z });
  }
  return points;
})();

export const VoiceOrb: React.FC<VoiceOrbProps> = ({
  status = 'idle',
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Check prefers-reduced-motion
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let prefersReducedMotion = mediaQuery.matches;

    const handleMotionPreferenceChange = (e: MediaQueryListEvent) => {
      prefersReducedMotion = e.matches;
    };
    mediaQuery.addEventListener('change', handleMotionPreferenceChange);

    let animationFrameId: number;
    const angleX = 0.35; // Slight tilt
    let angleY = 0;

    const render = (time: number) => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // Base radius of sphere in canvas coordinates
      const baseRadius = Math.min(canvas.width, canvas.height) * 0.35;

      // Calculate breathing scale
      // Idle: slow breathing. Listening: faster pulse.
      let breathScale = 1.0;
      if (!prefersReducedMotion) {
        const speed = status === 'listening' ? 0.005 : 0.0018;
        const amplitude = status === 'listening' ? 0.07 : 0.035;
        breathScale = 1.0 + Math.sin(time * speed) * amplitude;

        // Update rotation angles
        const rotSpeed = status === 'listening' ? 0.012 : 0.005;
        angleY += rotSpeed;
      }

      const sphereRadius = baseRadius * breathScale;

      // Rotate and project points
      const cosX = Math.cos(angleX);
      const sinX = Math.sin(angleX);
      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);

      // Map transformed points with calculated z-depth
      const projected = SPHERE_POINTS.map((p) => {
        // Rotate around Y axis
        const rx1 = p.x * cosY + p.z * sinY;
        const ry1 = p.y;
        const rz1 = -p.x * sinY + p.z * cosY;

        // Rotate around X axis (tilt)
        const rx = rx1;
        const ry = ry1 * cosX - rz1 * sinX;
        const rz = ry1 * sinX + rz1 * cosX;

        return { rx, ry, rz };
      });

      // Sort points by z-index (back to front) for accurate depth layering
      projected.sort((a, b) => a.rz - b.rz);

      // Render dots
      for (const pt of projected) {
        // Screen projection
        const sx = centerX + pt.rx * sphereRadius;
        const sy = centerY + pt.ry * sphereRadius;

        // Depth fraction: rz range approx [-1, 1] -> normalized to [0, 1]
        const depth = (pt.rz + 1) / 2;

        // Fake depth styling: front dots bigger & brighter
        const dotRadius = 1.1 + depth * 2.4;
        const alpha = 0.18 + depth * 0.77;

        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(0.5, dotRadius), 0, Math.PI * 2);

        if (depth > 0.82) {
          // Extra bright front core
          ctx.fillStyle = `rgba(165, 243, 252, ${alpha})`; // cyan-200
        } else if (depth > 0.4) {
          ctx.fillStyle = `rgba(34, 211, 238, ${alpha})`; // cyan-400
        } else {
          ctx.fillStyle = `rgba(6, 182, 212, ${alpha})`; // cyan-500
        }

        ctx.fill();

        // Subtle glow halo for prominent front dots
        if (depth > 0.88 && !prefersReducedMotion) {
          ctx.beginPath();
          ctx.arc(sx, sy, dotRadius * 2.2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(6, 182, 212, ${alpha * 0.25})`;
          ctx.fill();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      mediaQuery.removeEventListener('change', handleMotionPreferenceChange);
    };
  }, [status]);

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* Background cyan radial glow */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none transition-opacity duration-700"
        style={{
          background:
            'radial-gradient(circle, rgba(6, 182, 212, 0.18) 0%, rgba(6, 182, 212, 0.05) 45%, transparent 70%)',
          filter: 'blur(20px)',
        }}
      />
      <canvas
        ref={canvasRef}
        width={360}
        height={360}
        className="w-[280px] h-[280px] sm:w-[320px] sm:h-[320px] relative z-10"
        aria-label="DECKARC AI Voice Orb Visualizer"
      />
    </div>
  );
};

export default VoiceOrb;
