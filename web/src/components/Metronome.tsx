import { useState, useRef, useCallback, useEffect } from 'react';

interface MetronomeProps {
  initialBpm?: number;
  onBpmChange?: (bpm: number) => void;
}

export default function Metronome({ initialBpm = 80, onBpmChange }: MetronomeProps) {
  const [bpm, setBpm] = useState(initialBpm);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextNoteTimeRef = useRef(0);
  const timerRef = useRef<number>(0);
  const bpmRef = useRef(bpm);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  const getCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }, []);

  const playClick = useCallback(
    (time: number) => {
      const ctx = getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      gain.gain.setValueAtTime(0.3, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
      osc.start(time);
      osc.stop(time + 0.05);
    },
    [getCtx],
  );

  const scheduler = useCallback(() => {
    const ctx = getCtx();
    while (nextNoteTimeRef.current < ctx.currentTime + 0.1) {
      playClick(nextNoteTimeRef.current);
      nextNoteTimeRef.current += 60.0 / bpmRef.current;
    }
  }, [getCtx, playClick]);

  const toggle = useCallback(() => {
    if (isPlaying) {
      clearInterval(timerRef.current);
      setIsPlaying(false);
    } else {
      const ctx = getCtx();
      if (ctx.state === 'suspended') ctx.resume();
      nextNoteTimeRef.current = ctx.currentTime;
      timerRef.current = window.setInterval(scheduler, 25);
      setIsPlaying(true);
    }
  }, [isPlaying, getCtx, scheduler]);

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      audioCtxRef.current?.close();
    };
  }, []);

  const updateBpm = (newBpm: number) => {
    const clamped = Math.max(20, Math.min(300, newBpm));
    setBpm(clamped);
    onBpmChange?.(clamped);
  };

  return (
    <div
      className="rounded-xl p-5"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => updateBpm(bpm - 5)}
            className="w-10 h-10 rounded-lg font-bold text-lg transition-colors flex items-center justify-center"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
            }}
          >
            -
          </button>

          <div className="flex items-baseline gap-1.5">
            <input
              type="number"
              value={bpm}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (!isNaN(n)) updateBpm(n);
              }}
              className="w-16 text-center text-2xl font-bold bg-transparent border-b-2 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              style={{
                color: 'var(--text-primary)',
                borderColor: 'var(--border)',
              }}
              min={20}
              max={300}
            />
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>BPM</span>
          </div>

          <button
            type="button"
            onClick={() => updateBpm(bpm + 5)}
            className="w-10 h-10 rounded-lg font-bold text-lg transition-colors flex items-center justify-center"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
            }}
          >
            +
          </button>
        </div>

        <button
          type="button"
          onClick={toggle}
          className="px-5 py-2.5 rounded-lg font-medium transition-colors"
          style={{
            backgroundColor: isPlaying ? 'var(--status-struggling-border)' : 'var(--accent-primary)',
            color: isPlaying ? 'white' : 'var(--bg-deep)',
          }}
        >
          {isPlaying ? 'Stop' : 'Start'}
        </button>
      </div>
    </div>
  );
}
