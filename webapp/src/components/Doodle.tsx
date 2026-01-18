/* --------------------------------------------------------------------------
   DOODLES - Hand-drawn organic elements
   -------------------------------------------------------------------------- */
import { useEffect, useState } from 'react';

const COLORS = ['var(--text-secondary)', 'var(--accent-primary)', 'var(--warning)'];

export function DoodleSpiral({ style }: { style?: React.CSSProperties }) {
  const [pathLength, setPathLength] = useState(0);

  return (
    <svg
      viewBox="0 0 100 100"
      style={{
        width: 60, height: 60,
        fill: 'none', stroke: 'currentColor', strokeWidth: 2,
        strokeLinecap: 'round',
        ...style
      }}
    >
      <path d="M50,50 m-2,0 a2,2 0 1,0 4,0 a4,4 0 1,0 -8,0 a8,8 0 1,0 16,0 a16,16 0 1,0 -32,0 a24,24 0 1,0 48,0"
        style={{
          strokeDasharray: 200,
          strokeDashoffset: 200,
          animation: 'drawStroke 3s ease-out forwards'
        }}
      />
    </svg>
  );
}

export function DoodleStar({ style }: { style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 40 40" style={{ width: 30, height: 30, ...style }}>
      <path
        d="M20,2 L24,14 L38,14 L26,22 L30,36 L20,28 L10,36 L14,22 L2,14 L16,14 Z"
        fill="currentColor"
        style={{ animation: 'popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards' }}
      />
    </svg>
  );
}

export function DoodleArrow({ style }: { style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 100 50" style={{ width: 80, height: 40, fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', ...style }}>
      <path d="M10,25 Q30,5 50,25 T90,25 M80,15 L90,25 L80,35"
        style={{ animation: 'drawStroke 1s ease-out forwards' }}
      />
    </svg>
  );
}

export function DoodleScribble({ style }: { style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 200 40" style={{ width: 120, height: 20, fill: 'none', stroke: 'currentColor', strokeWidth: 2, ...style }}>
      <path d="M10,20 Q20,5 30,20 T50,20 T70,20 T90,20 T110,20"
        style={{ animation: 'drawStroke 2s ease-out forwards' }}
      />
    </svg>
  );
}

/* --------------------------------------------------------------------------
   RANDOM DOODLE PLACEMENT
   -------------------------------------------------------------------------- */
export function DoodleUnderline({ style }: { style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 100 20" style={{ width: 100, height: 20, fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round', ...style }}>
      <path d="M5,10 Q25,15 50,5 T95,10"
        style={{ animation: 'drawStroke 1.5s ease-out forwards' }}
      />
    </svg>
  );
}

export function DoodleCircle({ style }: { style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 100 100" style={{ width: 80, height: 80, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', ...style }}>
      <path d="M90,50 A40,40 0 1,1 10,50 A40,40 0 1,1 90,50 M85,50 A35,35 0 1,0 15,50"
        style={{
          strokeDasharray: 300,
          strokeDashoffset: 300,
          animation: 'drawStroke 2s ease-out forwards, wiggle 4s ease-in-out infinite'
        }}
      />
    </svg>
  );
}

export function DoodleAnchor({ style }: { style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 100 100" style={{ width: 60, height: 60, fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', ...style }}>
      {/* Ring, Shank, Hook, Stock */}
      <path d="M50,20 A6,6 0 1,0 50,8 A6,6 0 1,0 50,20 M50,20 L50,80 M20,55 Q50,95 80,55 M30,35 L70,35"
        style={{ animation: 'drawStroke 2s ease-out forwards' }}
      />
    </svg>
  );
}

export function DoodleZigzag({ style }: { style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 100 30" style={{ width: 80, height: 24, fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', ...style }}>
      <path d="M5,15 L15,5 L25,25 L35,5 L45,25 L55,5 L65,25 L75,5 L85,25 L95,15"
        style={{ animation: 'drawStroke 1.2s ease-out forwards' }}
      />
    </svg>
  );
}

/* --------------------------------------------------------------------------
   RANDOM DOODLE PLACEMENT
   -------------------------------------------------------------------------- */
const DOODLE_TYPES = [
  'spiral', 'star', 'arrow', 'scribble',
  'underline', 'circle', 'anchor', 'zigzag'
] as const;

export function RandomDoodles() {
  const [doodles, setDoodles] = useState<{
    id: number;
    type: typeof DOODLE_TYPES[number];
    x: number;
    y: number;
    rotate: number;
    scale: number;
    color: string;
    delay: number;
    floatDuration: number;
  }[]>([]);

  useEffect(() => {
    // Generate 6-10 random doodles for more flair
    const count = Math.floor(Math.random() * 5) + 6;
    const newDoodles = Array.from({ length: count }).map((_, i) => ({
      id: i,
      type: DOODLE_TYPES[Math.floor(Math.random() * DOODLE_TYPES.length)],
      x: Math.random() * 90,
      y: Math.random() * 90,
      rotate: Math.random() * 60 - 30,
      scale: 0.8 + Math.random() * 0.5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      delay: Math.random() * 1000,
      floatDuration: 5 + Math.random() * 5
    }));
    setDoodles(newDoodles);
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
      {doodles.map((d) => {
        const style: React.CSSProperties = {
          position: 'absolute',
          left: `${d.x}%`,
          top: `${d.y}%`,
          transform: `rotate(${d.rotate}deg) scale(${d.scale})`,
          color: d.color,
          opacity: 0.18,
          animation: `float ${d.floatDuration}s ease-in-out infinite`,
          animationDelay: `${d.delay}ms`
        };

        let Component;
        switch (d.type) {
          case 'spiral': Component = DoodleSpiral; break;
          case 'star': Component = DoodleStar; break;
          case 'arrow': Component = DoodleArrow; break;
          case 'scribble': Component = DoodleScribble; break;
          case 'underline': Component = DoodleUnderline; break;
          case 'circle': Component = DoodleCircle; break;
          case 'anchor': Component = DoodleAnchor; break;
          case 'zigzag': Component = DoodleZigzag; break;
          default: Component = DoodleSpiral;
        }

        return <Component key={d.id} style={style} />;
      })}
    </div>
  );
}
