# Workout Monitor Components

Reusable React components for the workout monitoring interface.

## Components

### AccelerationChart.js
Real-time line chart for IMU acceleration data visualization.

**Props:**
- `timeData` (array): Time labels for x-axis (e.g., ["0.000", "0.050", ...])
- `rawData` (array): Raw acceleration magnitude values
- `filteredData` (array): Kalman-filtered acceleration magnitude values
- `thresholdHigh` (number): Upper threshold for rep detection
- `thresholdLow` (number): Lower threshold for rep detection

**Features:**
- Uses Chart.js for rendering
- Dark theme optimized
- Animations disabled for performance
- Responsive sizing
- Shows 4 datasets: raw, filtered, high threshold, low threshold

**Usage:**
```jsx
<AccelerationChart
  timeData={timeData}
  rawData={rawAccelData}
  filteredData={filteredAccelData}
  thresholdHigh={10.5}
  thresholdLow={9.5}
/>
```

### StatCard.js
Simple card for displaying a single statistic.

**Props:**
- `title` (string): Card title
- `value` (string|number): Main value to display
- `unit` (string, optional): Unit label (e.g., "kg", "reps")
- `color` (string, optional): Tailwind color name (default: "white")

**Usage:**
```jsx
<StatCard 
  title="Rep Count" 
  value={12} 
  unit="reps"
  color="purple"
/>
```

### SensorDataCard.js
Card for displaying multiple related sensor values.

**Props:**
- `title` (string): Card title
- `data` (object): Key-value pairs of sensor readings
  - Keys: "X", "Y", "Z", "Mag" (auto-colored)
  - Values: numbers (will be formatted to 2 decimals)

**Features:**
- Auto color-coding: X=blue, Y=green, Z=purple, Mag=yellow
- Automatic unit display (m/s²) for acceleration data
- Clean grid layout

**Usage:**
```jsx
<SensorDataCard 
  title="Accelerometer (Raw)"
  data={{
    X: 0.45,
    Y: -1.23,
    Z: 9.81,
    Mag: 9.92
  }}
/>
```

## Styling

All components use Tailwind CSS and match the app's dark theme:
- Background: `bg-white/5` (5% white opacity)
- Borders: `border-white/10` (10% white opacity)
- Text: `text-white` with various opacity levels
- Rounded corners: `rounded-xl` or `rounded-2xl`

## Dependencies

- **chart.js**: ^4.5.1 (for AccelerationChart)
- **next**: 14.2.33 (for dynamic imports)
- **react**: ^18
- **tailwindcss**: ^3.4.1

## File Structure
```
components/
└── workoutMonitor/
    ├── AccelerationChart.js   # Chart component
    ├── StatCard.js            # Single stat display
    └── SensorDataCard.js      # Multi-value sensor display
```

## Notes

- **Performance**: Chart updates are optimized with `animation: false`
- **Accessibility**: All components include semantic HTML
- **Responsive**: Components adapt to different screen sizes
- **Reusable**: Can be used in other monitoring interfaces
- **Type-safe ready**: Easy to add TypeScript types if needed
