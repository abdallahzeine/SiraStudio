import { useState, useRef, useCallback } from 'react';

interface SplashScreenProps {
  onDone: () => void;
}

interface MagnetState {
  x: number;
  y: number;
  active: boolean;
}

function useMagnet(
  ref: React.RefObject<HTMLElement | null>,
  strength = 0.35,
  radius = 120,
) {
  const [pos, setPos] = useState<MagnetState>({ x: 0, y: 0, active: false });
  const rafRef = useRef<number | null>(null);

  const onMove = useCallback((mx: number, my: number) => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = mx - cx;
      const dy = my - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < radius) {
        setPos({ x: dx * strength, y: dy * strength, active: true });
      } else {
        setPos({ x: 0, y: 0, active: false });
      }
    });
  }, [ref, strength, radius]);

  const onLeave = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setPos({ x: 0, y: 0, active: false });
  }, []);

  const style: React.CSSProperties = {
    transform: `translate(${pos.x}px, ${pos.y}px)`,
    transition: pos.active
      ? 'transform 150ms cubic-bezier(0.23, 1, 0.32, 1)'
      : 'transform 500ms cubic-bezier(0.23, 1, 0.32, 1)',
  };

  return { style, onMove, onLeave };
}

export function SplashScreen({ onDone }: SplashScreenProps) {
  const [pulling, setPulling] = useState(false);
  const creditRef = useRef<HTMLAnchorElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const credit = useMagnet(creditRef, 0.35, 270);
  const logo = useMagnet(logoRef, 0.4, 280);
  const btn = useMagnet(btnRef, 0.5, 250);

  function handleStart() {
    setPulling(true);
    setTimeout(onDone, 300);
  }

  function handleMouseMove(e: React.MouseEvent) {
    logo.onMove(e.clientX, e.clientY);
    btn.onMove(e.clientX, e.clientY);
    credit.onMove(e.clientX, e.clientY);
  }

  function handleMouseLeave() {
    logo.onLeave();
    btn.onLeave();
    credit.onLeave();
  }

  return (
    <div
      className="no-print fixed inset-0 z-[200] flex items-center justify-center bg-[#f0f2f5] splash-dots"
      style={{
        transform: pulling ? 'translateY(-100%)' : 'translateY(0)',
        transition: pulling ? 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div className="flex flex-col items-center gap-8">
        <a
          ref={creditRef}
          href="https://abdallahzeine.vercel.app"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-gray-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm backdrop-blur transition-colors hover:bg-white hover:text-gray-900"
          aria-label="Made by Abdallah Zeine Elabidine"
          style={credit.style}
        >
          Made by Abdallah Zeine Elabidine
        </a>
        <img
          ref={logoRef}
          src="/Logo.png"
          alt="Logo"
          className="h-16 drop-shadow"
          draggable={false}
          style={logo.style}
        />
        <button
          ref={btnRef}
          onClick={handleStart}
          className="px-6 py-2 rounded-full bg-white text-sm font-medium text-gray-800 border border-gray-200 shadow hover:shadow-md hover:bg-gray-50 active:scale-95"
          style={btn.style}
        >
          Start Now
        </button>
      </div>
    </div>
  );
}
