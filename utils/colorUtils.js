/**
 * Color utilities for user avatars
 * Assigns a consistent random color based on user ID
 */

// Available color pairs (from, to) for gradients
const AVATAR_COLORS = [
  { from: 'from-purple-400', to: 'to-purple-600' },
  { from: 'from-blue-400', to: 'to-blue-600' },
  { from: 'from-pink-400', to: 'to-pink-600' },
  { from: 'from-green-400', to: 'to-green-600' },
  { from: 'from-orange-400', to: 'to-orange-600' },
  { from: 'from-cyan-400', to: 'to-cyan-600' },
  { from: 'from-indigo-400', to: 'to-indigo-600' },
  { from: 'from-rose-400', to: 'to-rose-600' },
  { from: 'from-amber-400', to: 'to-amber-600' },
  { from: 'from-lime-400', to: 'to-lime-600' },
];

/**
 * Generate a consistent color for a user based on their UID
 * @param {string} uid - User's Firebase UID
 * @returns {Object} Color object with from and to properties
 */
export function getUserAvatarColor(uid) {
  if (!uid) return AVATAR_COLORS[0];
  
  // Generate a number from the UID hash
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    const char = uid.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

/**
 * Get CSS class string for gradient background
 * @param {string} uid - User's Firebase UID
 * @returns {string} CSS class string for bg-gradient-to-br
 */
export function getUserAvatarColorClass(uid) {
  const colors = getUserAvatarColor(uid);
  return `bg-gradient-to-br ${colors.from} ${colors.to}`;
}

/**
 * Get inline style object for gradient background
 * @param {string} uid - User's Firebase UID
 * @returns {Object} Inline style object
 */
export function getUserAvatarColorStyle(uid) {
  const colors = getUserAvatarColor(uid);
  const colorMap = {
    'from-purple-400': 'rgb(192, 132, 250)',
    'from-blue-400': 'rgb(96, 165, 250)',
    'from-pink-400': 'rgb(244, 114, 182)',
    'from-green-400': 'rgb(74, 222, 128)',
    'from-orange-400': 'rgb(251, 146, 60)',
    'from-cyan-400': 'rgb(34, 211, 238)',
    'from-indigo-400': 'rgb(129, 140, 248)',
    'from-rose-400': 'rgb(251, 113, 133)',
    'from-amber-400': 'rgb(251, 191, 36)',
    'from-lime-400': 'rgb(163, 230, 53)',
  };
  
  const toColorMap = {
    'to-purple-600': 'rgb(147, 51, 234)',
    'to-blue-600': 'rgb(37, 99, 235)',
    'to-pink-600': 'rgb(219, 39, 119)',
    'to-green-600': 'rgb(34, 197, 94)',
    'to-orange-600': 'rgb(234, 88, 12)',
    'to-cyan-600': 'rgb(14, 165, 233)',
    'to-indigo-600': 'rgb(79, 70, 229)',
    'to-rose-600': 'rgb(225, 29, 72)',
    'to-amber-600': 'rgb(217, 119, 6)',
    'to-lime-600': 'rgb(132, 204, 22)',
  };
  
  return {
    background: `linear-gradient(135deg, ${colorMap[colors.from]} 0%, ${toColorMap[colors.to]} 100%)`,
  };
}

export default {
  getUserAvatarColor,
  getUserAvatarColorClass,
  getUserAvatarColorStyle,
};
