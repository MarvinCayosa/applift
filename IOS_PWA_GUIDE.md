# 📱 iOS PWA Fullscreen Guide - AppLift

This guide explains how to properly test and use AppLift as a fullscreen PWA on iPhone and iPad.

---

## ⚠️ CRITICAL: iOS PWA Limitations (Apple-Imposed)

Before testing, understand what iOS **does and does NOT allow**:

### ✅ What iOS PWAs CAN Do:
- Launch in **standalone mode** (no Safari UI)
- Hide address bar and browser chrome
- Use safe-area insets for notch/home indicator
- Cache assets and work offline
- Access most web APIs

### ❌ What iOS PWAs CANNOT Do:
- Use true `fullscreen` API (system limitation)
- Completely hide status bar (clock/battery)
- 100% disable pull-to-refresh (device-dependent)
- Prevent all iOS system gestures
- Access some hardware APIs (NFC, Bluetooth in some cases)

**This is not a bug** - this is the maximum fullscreen Apple allows for PWAs.
Apps like **Starbucks, Twitter Lite, and Notion** use the exact same setup.

---

## 🎯 What We've Implemented

### 1. **iOS-Optimized Manifest**
```json
{
  "display": "standalone",  // iOS ignores "fullscreen"
  "display_override": ["fullscreen", "standalone"],
  "background_color": "#0B0F1A",
  "theme_color": "#0B0F1A"
}
```

### 2. **Apple-Specific Meta Tags** ([_document.js](pages/_document.js))
```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
```

### 3. **iOS Safe-Area Handling** ([globals.css](styles/globals.css))
```css
:root {
  --safe-area-top: env(safe-area-inset-top, 0px);
  --safe-area-bottom: env(safe-area-inset-bottom, 0px);
  --safe-area-left: env(safe-area-inset-left, 0px);
  --safe-area-right: env(safe-area-inset-right, 0px);
}

.ios-pwa body {
  padding-top: var(--safe-area-top);
  padding-bottom: var(--safe-area-bottom);
}
```

### 4. **iOS PWA Detection** ([pwaDetection.js](utils/pwaDetection.js))
```javascript
isIOSPWA() // Returns true if running as iOS standalone PWA
isIOS()    // Detects any iOS device
```

### 5. **Rubber-Band Prevention**
```css
html, body {
  overscroll-behavior: none;
  -webkit-overflow-scrolling: touch;
}

body {
  position: fixed; /* Prevents bounce */
  overflow: hidden;
}
```

---

## 📱 How to Install on iOS (Step-by-Step)

### **iPhone Installation:**

1. **Open Safari** (must use Safari, not Chrome/Firefox)
   - Navigate to your AppLift URL (via ngrok or production domain)

2. **Tap the Share Button** 📤
   - Located at the bottom center (iPhone) or top right (iPad)

3. **Scroll down and tap "Add to Home Screen"**
   - You'll see the AppLift icon and name

4. **Tap "Add"** in the top right
   - The app icon appears on your Home Screen

5. **Launch from Home Screen** 🚀
   - Tap the AppLift icon
   - App opens in fullscreen standalone mode
   - No Safari UI visible

### **iPad Installation:**
Same steps, but Share button is at the top of Safari

---

## ✅ How to Verify iOS Fullscreen Mode

After installing, check these indicators:

### **Visual Confirmation:**
- ❌ **NO** Safari address bar
- ❌ **NO** browser tabs
- ❌ **NO** "Open in Safari" button
- ❌ **NO** share/bookmark icons
- ✅ **Status bar still visible** (clock, battery) - this is normal
- ✅ App fills entire screen below status bar
- ✅ Notch/Dynamic Island respected

### **Console Confirmation:**
1. Connect iPhone to Mac
2. Safari (Mac) → Develop → [Your iPhone] → AppLift
3. Check console for:
```
🚀 PWA Status: { isIOSPWA: true, isIOS: true, ... }
✅ Running as iOS PWA in standalone mode
✅ iOS PWA mode enabled - fullscreen layout applied
```

### **Behavioral Confirmation:**
- Navigation doesn't reload page (SPA routing)
- No white flash between pages
- Pull-down refresh mostly disabled
- App behaves like native app

---

## 🧪 Testing Checklist

### **Pre-Installation (Safari)**
- [ ] Site loads correctly in Safari
- [ ] No console errors
- [ ] "Add to Home Screen" option appears in Share menu
- [ ] Manifest icons display correctly

### **Post-Installation (Home Screen App)**
- [ ] App launches from Home Screen
- [ ] No Safari UI visible
- [ ] Status bar shows (clock/battery/signal)
- [ ] Content respects notch safe area
- [ ] Dark background matches (#0B0F1A)
- [ ] No white flash on launch
- [ ] Navigation is smooth (no page reloads)
- [ ] Pull-to-refresh mostly disabled
- [ ] Tap highlights removed
- [ ] Text selection disabled (except inputs)

### **Device-Specific Tests**
- [ ] **iPhone SE/8** (no notch) - full screen
- [ ] **iPhone 12-15** (notch) - safe-area respected
- [ ] **iPhone 14 Pro+** (Dynamic Island) - safe-area respected
- [ ] **iPad** (rounded corners) - safe-area respected
- [ ] **Landscape mode** (if applicable)

---

## 🐛 Troubleshooting

### **"I still see Safari UI"**
- ❌ You're opening it **from Safari**, not Home Screen
- ✅ Must tap the **app icon on Home Screen**
- Uninstall and reinstall if needed

### **"Pull-to-refresh still works"**
- This is an iOS limitation
- Our CSS prevents it in most cases
- Cannot be 100% disabled on all iOS versions
- This affects **all PWAs** including major apps

### **"Status bar is still visible"**
- ✅ This is **intentional and required by Apple**
- iOS does not allow hiding clock/battery/signal
- `standalone` mode is the maximum fullscreen allowed
- Native apps also show the status bar

### **"App shows white flash on launch"**
- Check `background_color` in manifest matches app background
- Ensure CSS `body { background: #0B0F1A; }` is applied
- May occur briefly on first load (iOS caching)

### **"Safe area not working (content under notch)"**
- Verify `viewport-fit=cover` in meta tag
- Check CSS variables are defined in `:root`
- Ensure body padding uses `var(--safe-area-*)`

### **"Install option not appearing"**
- Must use **Safari** (iOS ignores other browsers)
- Check manifest.json is valid (use Lighthouse)
- Ensure icons exist at specified paths
- Try hard refresh (Cmd+Shift+R)

---

## 📊 Expected Results by Device

| Device | Status Bar | Notch/Island | Bottom Indicator | Fullscreen? |
|--------|-----------|--------------|------------------|-------------|
| iPhone SE | ✅ Visible | ❌ None | ❌ None | ✅ Yes |
| iPhone 12-14 | ✅ Visible | ✅ Respected | ✅ Respected | ✅ Yes |
| iPhone 14 Pro+ | ✅ Visible | ✅ Dynamic Island | ✅ Respected | ✅ Yes |
| iPhone 15 | ✅ Visible | ✅ Dynamic Island | ✅ Respected | ✅ Yes |
| iPad Pro | ✅ Visible | ❌ None | ✅ Corners Rounded | ✅ Yes |
| iPad Air | ✅ Visible | ❌ None | ✅ Corners Rounded | ✅ Yes |

---

## 🔧 Code Usage Examples

### **Detect iOS PWA Mode in Components**
```javascript
import { isIOSPWA, isIOS } from '../utils/pwaDetection';

function MyComponent() {
  useEffect(() => {
    if (isIOSPWA()) {
      console.log('Running as iOS PWA - adjust UI accordingly');
    } else if (isIOS()) {
      console.log('iOS device detected - show install prompt');
    }
  }, []);
}
```

### **Show iOS-Specific Install Instructions**
```javascript
import { isIOS, isPWA } from '../utils/pwaDetection';

function InstallPrompt() {
  if (isPWA()) return null; // Already installed
  
  if (isIOS()) {
    return (
      <div>
        Tap <ShareIcon /> then "Add to Home Screen" to install
      </div>
    );
  }
  
  return <button onClick={installPWA}>Install App</button>;
}
```

### **Apply iOS-Specific Styles**
```css
/* Automatically applied via JavaScript */
.ios-pwa {
  height: 100vh;
  width: 100vw;
}

.ios-pwa body {
  padding-top: var(--safe-area-top);
  padding-bottom: var(--safe-area-bottom);
}
```

---

## 🎯 Real-World iOS PWA Examples

These major apps use the **exact same setup**:

- **Starbucks** - Order & pay PWA
- **Twitter Lite** - Full Twitter experience
- **Spotify Web Player** - Music streaming
- **Uber** - Ride booking (in some regions)
- **Pinterest** - Image discovery
- **Tinder** - Dating app PWA

They all have:
- ✅ Visible status bar
- ✅ Standalone mode (not true fullscreen)
- ✅ Same pull-to-refresh limitations
- ✅ Industry-standard implementation

---

## 📝 iOS PWA Best Practices

### **Do:**
- ✅ Use `display: "standalone"` in manifest
- ✅ Include all Apple meta tags
- ✅ Handle safe-area insets properly
- ✅ Test on real iOS devices
- ✅ Provide clear install instructions
- ✅ Match splash screen colors to app

### **Don't:**
- ❌ Expect true fullscreen API to work
- ❌ Try to hide status bar (impossible)
- ❌ Promise 100% pull-to-refresh disable
- ❌ Use Android-only APIs
- ❌ Forget viewport-fit=cover
- ❌ Test only in Safari browser mode

---

## 🚀 Deployment Notes

### **For Local Testing (ngrok):**
```bash
npm run build
npm start
ngrok http 3000
```
Use the ngrok HTTPS URL on your iPhone

### **For Production:**
- Ensure HTTPS is enabled
- Icons must be accessible
- Manifest must be valid
- Service Worker must register successfully

---

## 📞 Support Matrix

| iOS Version | PWA Support | Notes |
|-------------|-------------|-------|
| iOS 11-12 | ⚠️ Limited | Basic standalone mode |
| iOS 13-14 | ✅ Good | Better PWA support |
| iOS 15-16 | ✅ Great | Improved APIs |
| iOS 17+ | ✅ Excellent | Latest features |

**Recommended**: Target iOS 15+ for best experience

---

## ✨ Summary

Your AppLift PWA now has:
- ✅ **Maximum iOS fullscreen mode** (standalone)
- ✅ **Notch/Dynamic Island safe-area** handling
- ✅ **No Safari UI** when launched from Home Screen
- ✅ **Rubber-band scrolling** prevention (best effort)
- ✅ **iOS-specific detection** and styling
- ✅ **Industry-standard implementation**

**This is the best iOS PWA experience Apple allows.** 🎉

If someone shows you a PWA with no status bar on iOS, they're either:
1. Using a native app wrapper (not a true PWA)
2. Showing you an Android device
3. Using a jailbroken device

Your implementation matches **Twitter, Starbucks, and Spotify** - you're in good company! 🚀
