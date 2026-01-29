export default function TimeUnderTensionChart({ avgConcentric, avgEccentric }) {
  // Calculate bar widths as percentages
  const maxValue = Math.max(avgConcentric || 0, avgEccentric || 0);
  const concentricWidth = maxValue > 0 ? ((avgConcentric || 0) / maxValue) * 100 : 0;
  const eccentricWidth = maxValue > 0 ? ((avgEccentric || 0) / maxValue) * 100 : 0;

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Time Under Tension</h3>
      
      {/* Average bars */}
      <div className="space-y-4">
        {/* Concentric */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-gray-600 font-medium">Concentric</span>
            <span className="text-sm font-bold text-gray-900">{(avgConcentric || 0).toFixed(1)}s</span>
          </div>
          <div className="w-full h-8 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full transition-all duration-500 flex items-center justify-end pr-3"
              style={{ width: `${concentricWidth}%` }}
            >
              {concentricWidth > 20 && (
                <span className="text-xs font-semibold text-white">AVG</span>
              )}
            </div>
          </div>
        </div>

        {/* Eccentric */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-gray-600 font-medium">Eccentric</span>
            <span className="text-sm font-bold text-gray-900">{(avgEccentric || 0).toFixed(1)}s</span>
          </div>
          <div className="w-full h-8 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-purple-400 to-purple-500 rounded-full transition-all duration-500 flex items-center justify-end pr-3"
              style={{ width: `${eccentricWidth}%` }}
            >
              {eccentricWidth > 20 && (
                <span className="text-xs font-semibold text-white">AVG</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-center gap-6 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
          <span className="text-gray-600">Lifting (Concentric)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-purple-500"></div>
          <span className="text-gray-600">Lowering (Eccentric)</span>
        </div>
      </div>
    </div>
  );
}
