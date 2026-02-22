/**
 * PerformanceInsightsCard
 *
 * Unified single-page card combining:
 *   - Consistency  (duration & amplitude variability — grounded in resegment_reps_fixed.py)
 *   - Fatigue Analysis  (velocity drop · rep slowdown · form decay)
 *   - Velocity Loss  (per-rep velocity bar chart)
 *
 * All three sections share ONE data pipeline so metrics are always coherent.
 * No more "velocity = 0 in fatigue but non-zero in velocity loss" — same
 * array of per-rep kinematic values feeds every section.
 *
 * Grounding / fitness-app standards:
 *   - Consistency: coefficient of variation (CV) of rep duration and
 *     signal amplitude — same formula used in resegment_reps_fixed.py.
 *     Apps like PUSH Band, Velocity Based Training (VBT) apps, and
 *     research (Jovanovic & Flanagan 2014) all use CV as rep consistency.
 *   - Fatigue: first-third vs last-third comparison of velocity, duration
 *     and smoothness — standard in VBT literature (Gonzalez-Badillo 2017).
 *   - Velocity: effective reps defined as <20% velocity loss from baseline
 *     (first 2 reps).  Bar chart shows per-rep velocity.
 *     Bryan Mann's VBT research recommends 20% as a general threshold.
 *
 * Data priority:
 *   1. Server analytics (from Firestore analytics doc) — most accurate
 *   2. Local repsData (from workout monitor / GCS merge) — always available
 *   The card NEVER mixes a server score with local indicators.
 */

import { useMemo } from 'react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const stdDev = (arr) => {
  if (arr.length < 2) return 0;
  const m = avg(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
};
const cv = (arr) => {
  const m = avg(arr);
  return m > 0 ? stdDev(arr) / m : 0;
};
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

// ─── Extract kinematic arrays from repsData ───────────────────────────────────

function extractRepKinematics(setsData, selectedSet) {
  const sets =
    selectedSet === 'all'
      ? setsData || []
      : (setsData || []).filter((s) => s.setNumber === parseInt(selectedSet));

  const reps = [];

  sets.forEach((set) =>
    (set.repsData || []).forEach((rep, i) => {
      const duration = parseFloat(rep.time) || (rep.durationMs ? rep.durationMs / 1000 : 0);
      const velocity = parseFloat(rep.peakVelocity) || 0;
      const smoothness = rep.smoothnessScore ?? 70;
      const chartData = rep.chartData || [];

      // Amplitude = peak − trough of the chart signal (like resegment_reps_fixed.py)
      let amplitude = 0;
      if (chartData.length > 0) {
        const absData = chartData.map((v) => Math.abs(v));
        amplitude = Math.max(...absData) - Math.min(...absData);
      }

      reps.push({
        repNumber: rep.repNumber || i + 1,
        setNumber: set.setNumber,
        duration,
        velocity,
        smoothness,
        amplitude,
        chartData,
      });
    })
  );

  return reps;
}

// ─── Consistency (grounded in resegment_reps_fixed.py) ────────────────────────
// consistency_score = 100 - min(100, (duration_std/avg_duration + amplitude_std/avg_amplitude) * 50)

function computeConsistency(reps, serverScore) {
  if (reps.length < 2) {
    return {
      score: serverScore ?? 100,
      durationVariability: 0,
      amplitudeVariability: 0,
      durationCV: 0,
      amplitudeCV: 0,
      label: 'N/A',
    };
  }

  const durations = reps.map((r) => r.duration).filter((d) => d > 0);
  const amplitudes = reps.map((r) => r.amplitude).filter((a) => a > 0);

  const durationStd = stdDev(durations);
  const amplitudeStd = stdDev(amplitudes);
  const avgDur = avg(durations);
  const avgAmp = avg(amplitudes);

  const durationCV = avgDur > 0 ? durationStd / avgDur : 0;
  const amplitudeCV = avgAmp > 0 ? amplitudeStd / avgAmp : 0;

  // Same formula as resegment_reps_fixed.py line 1264
  const score = clamp(100 - Math.min(100, (durationCV + amplitudeCV) * 50));

  return {
    score: Math.round(score * 10) / 10,
    durationVariability: Math.round(durationStd * 100) / 100,
    amplitudeVariability: Math.round(amplitudeStd * 100) / 100,
    durationCV: Math.round(durationCV * 1000) / 10,   // as %
    amplitudeCV: Math.round(amplitudeCV * 1000) / 10,  // as %
    label:
      score >= 90 ? 'Excellent' :
      score >= 75 ? 'Good' :
      score >= 60 ? 'Fair' : 'Needs Work',
  };
}

// ─── Fatigue (VBT first-third / last-third comparison) ────────────────────────

function computeFatigue(reps, serverScore, serverLevel) {
  if (reps.length < 3) {
    return {
      score: serverScore ?? 0,
      level: serverLevel || 'N/A',
      velocityDrop: 0,
      durationIncrease: 0,
      smoothnessDrop: 0,
      hasData: false,
    };
  }

  const third = Math.max(1, Math.floor(reps.length / 3));

  const velocities = reps.map((r) => r.velocity);
  const durations = reps.map((r) => r.duration);
  const smoothness = reps.map((r) => r.smoothness);

  const vFirst = avg(velocities.slice(0, third));
  const vLast = avg(velocities.slice(-third));
  const velocityDrop = vFirst > 0 ? ((vFirst - vLast) / vFirst) * 100 : 0;

  const dFirst = avg(durations.slice(0, third));
  const dLast = avg(durations.slice(-third));
  const durationIncrease = dFirst > 0 ? ((dLast - dFirst) / dFirst) * 100 : 0;

  const sFirst = avg(smoothness.slice(0, third));
  const sLast = avg(smoothness.slice(-third));
  const smoothnessDrop = sFirst > 0 ? ((sFirst - sLast) / sFirst) * 100 : 0;

  // Composite fatigue score: same weights as analyze-workout.js
  const D = Math.max(0, velocityDrop) / 100;
  const T = Math.max(0, durationIncrease) / 100;
  const S = Math.max(0, smoothnessDrop) / 100;
  const score = clamp((0.40 * D + 0.30 * T + 0.30 * S) * 100);

  const level =
    score < 10 ? 'Minimal' :
    score < 20 ? 'Low' :
    score < 35 ? 'Moderate' :
    score < 55 ? 'High' : 'Severe';

  return {
    score: Math.round(score * 10) / 10,
    level,
    velocityDrop: Math.round(Math.max(0, velocityDrop) * 10) / 10,
    durationIncrease: Math.round(Math.max(0, durationIncrease) * 10) / 10,
    smoothnessDrop: Math.round(Math.max(0, smoothnessDrop) * 10) / 10,
    hasData: true,
  };
}

// ─── Velocity (per-rep VBT analysis) ──────────────────────────────────────────

function computeVelocity(reps) {
  if (reps.length === 0) {
    return { bars: [], baseline: 0, drop: 0, effective: 0, total: 0, max: 0 };
  }

  const baseSize = Math.min(2, reps.length);
  const baseline = avg(reps.slice(0, baseSize).map((r) => r.velocity));
  const lastV = reps[reps.length - 1]?.velocity || 0;
  const drop = baseline > 0 ? ((baseline - lastV) / baseline) * 100 : 0;

  const bars = reps.map((r) => {
    const d = baseline > 0 ? ((baseline - r.velocity) / baseline) * 100 : 0;
    return {
      rep: r.repNumber,
      set: r.setNumber,
      v: Math.round(r.velocity * 100) / 100,
      dropPct: Math.round(d * 10) / 10,
      isEffective: d < 20, // 20% threshold (Bryan Mann's VBT recommendation)
    };
  });

  return {
    bars,
    baseline: Math.round(baseline * 100) / 100,
    drop: Math.round(Math.max(0, drop) * 10) / 10,
    effective: bars.filter((b) => b.isEffective).length,
    total: bars.length,
    max: Math.max(...bars.map((b) => b.v), 0.5),
  };
}

// ─── Color helpers ────────────────────────────────────────────────────────────

const consistencyColor = (score) => {
  if (score >= 85) return { text: 'text-emerald-400', ring: '#22c55e', bg: 'bg-emerald-500/10' };
  if (score >= 65) return { text: 'text-yellow-400', ring: '#eab308', bg: 'bg-yellow-500/10' };
  return { text: 'text-red-400', ring: '#ef4444', bg: 'bg-red-500/10' };
};

const fatigueColor = (level) => {
  const l = level?.toLowerCase();
  if (l === 'minimal' || l === 'low') return { text: 'text-green-400', ring: '#22c55e', bg: 'bg-green-500/10' };
  if (l === 'moderate') return { text: 'text-yellow-400', ring: '#eab308', bg: 'bg-yellow-500/10' };
  if (l === 'high') return { text: 'text-orange-400', ring: '#f97316', bg: 'bg-orange-500/10' };
  return { text: 'text-red-400', ring: '#ef4444', bg: 'bg-red-500/10' };
};

const indicatorColor = (value, good, warn) => {
  if (value <= good) return 'text-green-400';
  if (value <= warn) return 'text-yellow-400';
  return 'text-red-400';
};

// ─── Ring (SVG donut) ─────────────────────────────────────────────────────────

function MiniRing({ value, max = 100, size = 72, stroke = 5, color }) {
  const R = (size - stroke * 2) / 2;
  const C = 2 * Math.PI * R;
  const progress = clamp(value / max, 0, 1);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={R}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - progress)}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[18px] font-bold text-white leading-none">{Math.round(value)}</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PerformanceInsightsCard({
  setsData,
  // Server-computed values (from analytics API / Firestore)
  serverFatigueScore,
  serverFatigueLevel,
  serverConsistencyScore,
  selectedSet = 'all',
}) {
  // Single extraction — all three sections use the same arrays
  const reps = useMemo(() => extractRepKinematics(setsData, selectedSet), [setsData, selectedSet]);

  const consistency = useMemo(() => computeConsistency(reps, serverConsistencyScore), [reps, serverConsistencyScore]);
  const fatigue = useMemo(() => computeFatigue(reps, serverFatigueScore, serverFatigueLevel), [reps, serverFatigueScore, serverFatigueLevel]);
  const velocity = useMemo(() => computeVelocity(reps), [reps]);

  const cColor = consistencyColor(consistency.score);
  const fColor = fatigueColor(fatigue.level);

  // Velocity bar chart dimensions
  const BAR_H = 130;
  const P = { t: 8, b: 22, l: 4, r: 4 };
  const plotH = BAR_H - P.t - P.b;

  return (
    <div className="rounded-2xl bg-[#1a1a1a] p-5 space-y-5 content-fade-up-3">

      {/* ═══════════════════════════ 1. CONSISTENCY ═══════════════════════════ */}
      <section>
        <h3 className="text-[15px] font-bold text-white mb-3">Consistency</h3>

        <div className="flex items-center gap-4">
          {/* Ring */}
          <MiniRing value={consistency.score} color={cColor.ring} />

          {/* Metrics */}
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-400">Duration variability</span>
              <span className={`text-[13px] font-semibold ${consistency.durationCV > 15 ? 'text-yellow-400' : 'text-green-400'}`}>
                ±{consistency.durationVariability}s
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-400">Amplitude variability</span>
              <span className={`text-[13px] font-semibold ${consistency.amplitudeCV > 15 ? 'text-yellow-400' : 'text-green-400'}`}>
                ±{consistency.amplitudeVariability}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-400">Rating</span>
              <span className={`text-[13px] font-bold ${cColor.text}`}>{consistency.label}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="h-px bg-white/[0.06]" />

      {/* ═══════════════════════════ 2. FATIGUE ═══════════════════════════════ */}
      <section>
        <h3 className="text-[15px] font-bold text-white mb-3">Fatigue Analysis</h3>

        <div className="flex items-center gap-4">
          {/* Ring */}
          <div className="flex flex-col items-center">
            <MiniRing value={fatigue.score} color={fColor.ring} />
            <span className={`text-[11px] font-semibold mt-1 ${fColor.text} lowercase`}>{fatigue.level}</span>
          </div>

          {/* 3 indicator rows */}
          <div className="flex-1 space-y-2">
            {[
              {
                label: 'Velocity drop',
                value: `−${fatigue.velocityDrop}%`,
                color: indicatorColor(fatigue.velocityDrop, 10, 20),
                hint: 'first ⅓ → last ⅓',
              },
              {
                label: 'Rep slowdown',
                value: `+${fatigue.durationIncrease}%`,
                color: indicatorColor(fatigue.durationIncrease, 15, 30),
                hint: 'duration increase',
              },
              {
                label: 'Form decay',
                value: `${fatigue.smoothnessDrop}%`,
                color: indicatorColor(fatigue.smoothnessDrop, 10, 25),
                hint: 'smoothness loss',
              },
            ].map((ind, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2">
                <div className="flex flex-col">
                  <span className="text-[12px] text-gray-300 font-medium">{ind.label}</span>
                  <span className="text-[9px] text-gray-600">{ind.hint}</span>
                </div>
                <span className={`text-[14px] font-bold ${ind.color}`}>{ind.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="h-px bg-white/[0.06]" />

      {/* ═══════════════════════════ 3. VELOCITY LOSS ═════════════════════════ */}
      <section>
        <h3 className="text-[15px] font-bold text-white mb-3">Velocity Loss</h3>

        {velocity.bars.length === 0 ? (
          <div className="flex items-center justify-center rounded-xl bg-white/[0.03] h-20">
            <p className="text-sm text-gray-500">No velocity data</p>
          </div>
        ) : (
          <>
            {/* Stats row */}
            <div className="flex gap-2 mb-3">
              {[
                { label: 'Baseline', value: `${velocity.baseline}`, unit: 'm/s', color: 'text-cyan-400' },
                { label: 'Total drop', value: velocity.drop > 0 ? `−${velocity.drop}` : '0', unit: '%',
                  color: velocity.drop < 10 ? 'text-green-400' : velocity.drop < 25 ? 'text-yellow-400' : 'text-red-400' },
                { label: 'Effective', value: `${velocity.effective}`, unit: `/${velocity.total}`, color: 'text-white' },
              ].map((m, i) => (
                <div key={i} className="flex-1 rounded-xl bg-white/[0.04] px-3 py-2.5 text-center">
                  <p className="text-[9px] text-gray-500 mb-0.5">{m.label}</p>
                  <p className={`text-base font-bold ${m.color}`}>
                    {m.value}<span className="text-[9px] text-gray-500 ml-0.5">{m.unit}</span>
                  </p>
                </div>
              ))}
            </div>

            {/* Bar chart */}
            <div className="relative rounded-xl bg-white/[0.03] overflow-hidden" style={{ height: `${BAR_H}px` }}>
              <svg className="w-full h-full" viewBox={`0 0 320 ${BAR_H}`} preserveAspectRatio="xMidYMid meet">
                {/* Grid lines */}
                {[0.25, 0.5, 0.75].map((f) => {
                  const y = P.t + plotH * (1 - f);
                  return <line key={f} x1="0" y1={y} x2="320" y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />;
                })}

                {/* Baseline dashed line */}
                {velocity.max > 0 && (() => {
                  const baseY = P.t + plotH * (1 - velocity.baseline / velocity.max);
                  return <line x1="0" y1={baseY} x2="320" y2={baseY} stroke="#22d3ee" strokeWidth="1" strokeDasharray="4,3" opacity="0.4" />;
                })()}

                {/* Bars */}
                {velocity.bars.map((d, i) => {
                  const count = velocity.bars.length;
                  const gap = Math.max(3, Math.min(6, 80 / count));
                  const totalGaps = gap * (count + 1);
                  const barW = Math.max(14, (320 - P.l - P.r - totalGaps) / count);
                  const x = P.l + gap + i * (barW + gap);
                  const hFrac = velocity.max > 0 ? d.v / velocity.max : 0;
                  const barH = Math.max(4, hFrac * plotH);
                  const y = P.t + plotH - barH;
                  const color = d.isEffective ? '#22d3ee' : '#475569';
                  const op = d.isEffective ? 0.9 : 0.5;

                  return (
                    <g key={i}>
                      <rect x={x} y={y} width={barW} height={barH} fill={color} opacity={op} rx="4" ry="4" />
                      <text x={x + barW / 2} y={y - 4} fill={d.isEffective ? '#22d3ee' : '#64748b'} fontSize="8" fontWeight="600" textAnchor="middle">
                        {d.v.toFixed(2)}
                      </text>
                      <text x={x + barW / 2} y={BAR_H - 4} fill="#4b5563" fontSize="8" textAnchor="middle">
                        R{d.rep}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-4 mt-2">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm bg-cyan-400 opacity-90" />
                <span className="text-[9px] text-gray-500">Effective (&lt;20% loss)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm bg-slate-600 opacity-50" />
                <span className="text-[9px] text-gray-500">Fatigued (&ge;20% loss)</span>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
