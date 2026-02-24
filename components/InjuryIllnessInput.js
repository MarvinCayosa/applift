/**
 * InjuryIllnessInput
 * 
 * Dynamic multi-field input for injuries and illnesses.
 * Used in both signup (step 5) and settings pages.
 * Starts with one field, user can add more dynamically.
 */

import { useState } from 'react';

export default function InjuryIllnessInput({ 
  injuries = [], 
  onChange, 
  maxFields = 10,
  variant = 'default' // 'default' | 'compact'
}) {
  // Initialize with at least one empty field
  const [fields, setFields] = useState(() => {
    if (injuries.length > 0) return injuries;
    return [''];
  });

  const updateField = (index, value) => {
    const updated = [...fields];
    updated[index] = value;
    setFields(updated);
    onChange(updated.filter(f => f.trim()));
  };

  const addField = () => {
    if (fields.length >= maxFields) return;
    setFields([...fields, '']);
  };

  const removeField = (index) => {
    if (fields.length <= 1) {
      // Clear the last field instead of removing
      setFields(['']);
      onChange([]);
      return;
    }
    const updated = fields.filter((_, i) => i !== index);
    setFields(updated);
    onChange(updated.filter(f => f.trim()));
  };

  const isCompact = variant === 'compact';

  return (
    <div className="space-y-3">
      {/* Context explanation */}
      {!isCompact && (
        <div className="flex items-start gap-2 px-1 mb-2">
          <svg className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z"/>
          </svg>
          <p className="text-xs text-white/50 leading-relaxed">
            This information helps the system generate safe initial recommendations aligned with 
            your current capabilities and established strength and conditioning guidelines.
          </p>
        </div>
      )}

      {/* Fields */}
      <div className="space-y-2">
        {fields.map((field, index) => (
          <div key={index} className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={field}
                onChange={(e) => updateField(index, e.target.value)}
                placeholder={index === 0 ? 'e.g., Lower back pain, Knee injury...' : 'Add another condition...'}
                className="w-full px-4 py-3 rounded-xl bg-white/10 text-white text-sm placeholder-white/30 border border-white/10 focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 outline-none transition-all"
                maxLength={100}
              />
              {field.trim() && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <svg className="w-3.5 h-3.5 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 16.17L5.53 12.7a.996.996 0 1 0-1.41 1.41l4.18 4.18c.39.39 1.02.39 1.41 0L20.29 7.71a.996.996 0 1 0-1.41-1.41L9 16.17z"/>
                  </svg>
                </div>
              )}
            </div>

            {/* Remove button */}
            <button
              onClick={() => removeField(index)}
              className="w-9 h-9 rounded-xl bg-white/5 hover:bg-red-500/20 flex items-center justify-center transition-colors flex-shrink-0 border border-white/5 hover:border-red-500/30"
              aria-label="Remove condition"
            >
              <svg className="w-4 h-4 text-white/40 hover:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Add button */}
      {fields.length < maxFields && (
        <button
          onClick={addField}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-violet-500/10 border border-dashed border-white/10 hover:border-violet-500/30 transition-all w-full justify-center group"
        >
          <svg className="w-4 h-4 text-white/40 group-hover:text-violet-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="text-xs text-white/40 group-hover:text-violet-400 transition-colors">
            Add another condition
          </span>
        </button>
      )}

      {/* Skip note */}
      <p className="text-[10px] text-white/30 text-center px-4">
        Leave blank if you have no injuries or illnesses. You can update this anytime in Settings.
      </p>
    </div>
  );
}
