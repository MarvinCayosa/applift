export default function WarmUpBanner() {
  return (
    <p className="text-[10px] text-center font-medium flex items-center justify-center gap-1.5"
      style={{
        background: 'linear-gradient(135deg, #FF6B35 0%, #FFA500 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
      }}
    >
      <span className="text-orange-500">⚠</span>
      Remember to Warm Up First!
    </p>
  );
}
