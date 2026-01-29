export default function WorkoutActionButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full max-w-md mx-auto block py-4 px-6 rounded-full font-semibold text-white transition-all duration-300 hover:scale-105"
      style={{
        background: `linear-gradient(to bottom right, #c084fc 0%, #9333ea 100%)`,
      }}
    >
      Let's Workout
    </button>
  );
}
