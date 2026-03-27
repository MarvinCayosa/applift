/**
 * ROMInfoModal — shared bottom sheet explaining Range of Motion.
 * Used in: SetRepCard, GraphBreakdownCarousel, RepInsightCard.
 *
 * Props:
 *   onClose — called when the modal should close
 */

import { useState } from 'react';
import ReactDOM from 'react-dom';

export default function ROMInfoModal({ onClose }) {
  const [isClosing, setIsClosing] = useState(false);
  const [infoSlide, setInfoSlide] = useState(0);
  const [infoSwipeStartX, setInfoSwipeStartX] = useState(null);
  const [infoSwipeX, setInfoSwipeX] = useState(0);
  const INFO_SLIDES = 2;

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => { setIsClosing(false); onClose(); }, 250);
  };

  const handleInfoSwipeStart = (e) => { setInfoSwipeStartX(e.touches[0].clientX); };
  const handleInfoSwipeMove = (e) => {
    if (infoSwipeStartX === null) return;
    const dx = e.touches[0].clientX - infoSwipeStartX;
    if ((infoSlide === 0 && dx > 0) || (infoSlide === INFO_SLIDES - 1 && dx < 0)) {
      setInfoSwipeX(dx * 0.25);
    } else {
      setInfoSwipeX(dx);
    }
  };
  const handleInfoSwipeEnd = () => {
    if (Math.abs(infoSwipeX) > 50) {
      if (infoSwipeX < 0 && infoSlide < INFO_SLIDES - 1) setInfoSlide(infoSlide + 1);
      else if (infoSwipeX > 0 && infoSlide > 0) setInfoSlide(infoSlide - 1);
    }
    setInfoSwipeX(0);
    setInfoSwipeStartX(null);
  };

  if (typeof document === 'undefined') return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end justify-center" onClick={handleClose}>
      <div className={`absolute inset-0 bg-black/60 transition-opacity duration-250 ${isClosing ? 'opacity-0' : 'opacity-100'}`} />
      <div
        className={`relative w-full max-w-lg rounded-t-2xl bg-[#1e1e1e] border-t border-white/10 pb-8 ${isClosing ? 'animate-slideDown' : 'animate-slideUp'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2 cursor-grab">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Slide content */}
        <div
          className="overflow-hidden"
          onTouchStart={handleInfoSwipeStart}
          onTouchMove={handleInfoSwipeMove}
          onTouchEnd={handleInfoSwipeEnd}
        >
          <div
            className={`flex ${infoSwipeStartX === null ? 'transition-transform duration-300 ease-out' : ''}`}
            style={{ transform: `translateX(calc(-${infoSlide * 100}% + ${infoSwipeX}px))` }}
          >
            {/* Slide 1: What This Means */}
            <div className="w-full shrink-0 px-5 overflow-y-auto" style={{ maxHeight: '65vh' }}>
              <h4 className="text-[16px] font-bold text-white mb-3">What This Means</h4>
              <p className="text-[13px] text-white/60 leading-relaxed mb-4">
                Range of Motion (ROM) measures how much movement occurs during each rep.
                It's calculated as a percentage of your calibrated benchmark movement.
              </p>
              <p className="text-[13px] font-semibold text-white/70 mb-2">ROM Categories:</p>
              <div className="space-y-2 mb-4">
                <div className="flex items-start gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-green-400 mt-1.5 shrink-0" />
                  <div>
                    <span className="text-[13px] font-semibold text-white/80">Full ROM (≥85%)</span>
                    <p className="text-[12px] text-white/40 leading-relaxed">Complete movement through the full range. Maximizes muscle engagement.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-yellow-400 mt-1.5 shrink-0" />
                  <div>
                    <span className="text-[13px] font-semibold text-white/80">Partial ROM (&lt;85%)</span>
                    <p className="text-[12px] text-white/40 leading-relaxed">Reduced movement range. Consider checking your form or reducing weight.</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl bg-white/[0.04] p-3">
                <p className="text-[12px] text-white/50 leading-relaxed">
                  <span className="text-white/70 font-medium">Tip:</span> Full ROM helps maximize muscle engagement and training effectiveness.
                  If consistently partial, consider reducing weight to maintain proper form.
                </p>
              </div>
            </div>

            {/* Slide 2: How It Works */}
            <div className="w-full shrink-0 px-5 overflow-y-auto" style={{ maxHeight: '65vh' }}>
              <h4 className="text-[16px] font-bold text-white mb-3">How It Works</h4>
              <p className="text-[13px] text-white/60 leading-relaxed mb-4">
                Your ROM is tracked by comparing each rep's movement to your calibrated benchmark established at the start of the session.
              </p>
              <p className="text-[12px] font-semibold text-white/50 mb-2">The Process:</p>
              <div className="space-y-3 mb-4">
                {[
                  { label: 'Calibration', weight: 1, color: 'bg-violet-400', textColor: 'text-violet-400', desc: 'Set your baseline ROM at session start' },
                  { label: 'Tracking',    weight: 2, color: 'bg-cyan-400',   textColor: 'text-cyan-400',   desc: 'Each rep is compared to your benchmark' },
                  { label: 'Fulfillment', weight: 3, color: 'bg-green-400',  textColor: 'text-green-400',  desc: 'Shows how close you got to full ROM' },
                ].map((item) => (
                  <div key={item.weight} className="flex items-start gap-2.5">
                    <div className={`w-6 h-6 rounded-full ${item.color}/20 flex items-center justify-center flex-shrink-0`}>
                      <span className={`text-[11px] font-bold ${item.textColor}`}>{item.weight}</span>
                    </div>
                    <div>
                      <span className={`text-[13px] font-medium ${item.textColor}`}>{item.label}</span>
                      <p className="text-[12px] text-white/40 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-xl bg-white/[0.04] p-3">
                <p className="text-[12px] text-white/50 leading-relaxed">
                  Consistent full ROM reps indicate good form and muscle control. If ROM drops significantly, you may be fatiguing — consider resting or reducing weight.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Slide dots */}
        <div className="flex items-center justify-center gap-1.5 pt-3">
          {[0, 1].map(i => (
            <button
              key={i}
              onClick={() => setInfoSlide(i)}
              className={`rounded-full transition-all duration-300 ${infoSlide === i ? 'w-5 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/25'}`}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
