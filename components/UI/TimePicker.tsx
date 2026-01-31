
import React, { useState, useRef, useEffect } from 'react';

interface TimePickerProps {
  initialTime: string; // HH:mm
  onSelect: (time: string) => void;
}

const TimePicker: React.FC<TimePickerProps> = ({ initialTime, onSelect }) => {
  const [h, m] = initialTime.split(':').map(Number);
  const [hour, setHour] = useState(h % 12 || 12);
  const [minute, setMinute] = useState(m);
  const [isPm, setIsPm] = useState(h >= 12);
  const [mode, setMode] = useState<'hour' | 'minute'>('hour');
  const clockRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const updateTime = (newHour: number, newMin: number, newIsPm: boolean) => {
    let adjustedH = newHour % 12;
    if (newIsPm) adjustedH += 12;
    const timeStr = `${adjustedH.toString().padStart(2, '0')}:${newMin.toString().padStart(2, '0')}`;
    onSelect(timeStr);
  };

  const handleInteraction = (clientX: number, clientY: number) => {
    if (!clockRef.current) return;
    const rect = clockRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Calculate angle in radians, then degrees
    const angleRad = Math.atan2(clientY - centerY, clientX - centerX);
    let angleDeg = (angleRad * 180) / Math.PI + 90;
    if (angleDeg < 0) angleDeg += 360;

    if (mode === 'hour') {
      // 360 / 12 = 30 degrees per hour
      let hVal = Math.round(angleDeg / 30);
      if (hVal === 0) hVal = 12;
      if (hVal > 12) hVal = 12;
      setHour(hVal);
      updateTime(hVal, minute, isPm);
    } else {
      // 360 / 60 = 6 degrees per minute
      let mVal = Math.round(angleDeg / 6);
      if (mVal === 60) mVal = 0;
      setMinute(mVal);
      updateTime(hour, mVal, isPm);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    handleInteraction(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    isDragging.current = true;
    handleInteraction(e.touches[0].clientX, e.touches[0].clientY);
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging.current) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      handleInteraction(clientX, clientY);
    };

    const handleEnd = () => {
      if (isDragging.current && mode === 'hour') {
        setMode('minute');
      }
      isDragging.current = false;
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [mode, hour, minute, isPm]);

  const toggleAmPm = () => {
    const nextIsPm = !isPm;
    setIsPm(nextIsPm);
    updateTime(hour, minute, nextIsPm);
  };

  const hourPositions = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutePositions = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  return (
    <div className="flex flex-col items-center bg-white dark:bg-slate-800 p-4 rounded-3xl shadow-inner border dark:border-slate-700 animate-fadeIn select-none">
      <div className="flex items-center space-x-4 mb-6">
        <button 
          onClick={() => setMode('hour')}
          className={`text-3xl font-bold p-2 rounded-xl transition-all ${mode === 'hour' ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/30' : 'text-slate-400'}`}
        >
          {hour.toString().padStart(2, '0')}
        </button>
        <span className="text-3xl font-bold text-slate-300">:</span>
        <button 
          onClick={() => setMode('minute')}
          className={`text-3xl font-bold p-2 rounded-xl transition-all ${mode === 'minute' ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/30' : 'text-slate-400'}`}
        >
          {minute.toString().padStart(2, '0')}
        </button>
        <button 
          onClick={toggleAmPm}
          className="bg-slate-100 dark:bg-slate-700 px-3 py-1.5 rounded-xl text-xs font-black text-slate-600 dark:text-slate-300 active:scale-95 transition-transform"
        >
          {isPm ? 'PM' : 'AM'}
        </button>
      </div>

      <div 
        ref={clockRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        className="relative w-56 h-56 rounded-full border-4 border-slate-100 dark:border-slate-700 flex items-center justify-center bg-slate-50 dark:bg-slate-900/50 cursor-pointer touch-none"
      >
        <div className="absolute w-2 h-2 bg-blue-600 rounded-full z-10 shadow-md"></div>
        
        {/* The Rotating Hand */}
        <div 
          className="absolute w-1 bg-blue-600 origin-bottom rounded-full transition-transform duration-200 ease-out"
          style={{ 
            height: '42%', 
            bottom: '50%', 
            transform: `rotate(${mode === 'hour' ? (hour * 30) : (minute * 6)}deg)` 
          }}
        >
           <div className="absolute top-0 -left-2 w-5 h-5 bg-blue-600 rounded-full border-2 border-white dark:border-slate-800 shadow-lg"></div>
        </div>

        {/* Static Markers */}
        {mode === 'hour' ? hourPositions.map(h => {
          const angle = (h * 30) - 90;
          const rad = (angle * Math.PI) / 180;
          const x = 85 * Math.cos(rad);
          const y = 85 * Math.sin(rad);
          return (
            <div
              key={h}
              className={`absolute text-xs font-black transition-all ${hour === h ? 'text-blue-600 scale-125' : 'text-slate-400 opacity-60'}`}
              style={{ transform: `translate(${x}px, ${y}px)` }}
            >
              {h}
            </div>
          );
        }) : minutePositions.map(m => {
          const angle = (m * 6) - 90;
          const rad = (angle * Math.PI) / 180;
          const x = 85 * Math.cos(rad);
          const y = 85 * Math.sin(rad);
          return (
            <div
              key={m}
              className={`absolute text-[10px] font-black transition-all ${minute === m ? 'text-blue-600 scale-125' : 'text-slate-400 opacity-60'}`}
              style={{ transform: `translate(${x}px, ${y}px)` }}
            >
              {m.toString().padStart(2, '0')}
            </div>
          );
        })}
      </div>
      
      <p className="mt-6 text-[9px] font-black text-slate-400 uppercase tracking-widest opacity-60">
        Drag to rotate the hand
      </p>
    </div>
  );
};

export default TimePicker;
