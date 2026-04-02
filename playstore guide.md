# Datta AI — Android Play Store Submission Guide

## PHASE 1: Setup Capacitor (run on your computer)

```bash
# In your project folder (where index.html is)
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android

# Initialize Capacitor
npx cap init "Datta AI" "com.datta.ai" --web-dir "."

# Add Android platform
npx cap add android

# Copy web files to Android
npx cap copy android

# Open in Android Studio
npx cap open android
```

---

## PHASE 2: Android Studio Setup

After opening Android Studio:

### Set App Name
`android/app/src/main/res/values/strings.xml`
```xml
<string name="app_name">Datta AI</string>
```

### Add Internet Permission
`android/app/src/main/AndroidManifest.xml` — already included by Capacitor.
Verify this line exists:
```xml
<uses-permission android:name="android.permission.INTERNET" />
```

### App Icons
Replace files in:
```
android/app/src/main/res/mipmap-hdpi/ic_launcher.png     (72x72)
android/app/src/main/res/mipmap-mdpi/ic_launcher.png     (48x48)
android/app/src/main/res/mipmap-xhdpi/ic_launcher.png    (96x96)
android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png   (144x144)
android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png  (192x192)
```
Use your logo.png resized to each size.

---

## PHASE 3: Build Signed AAB

### Step 1 — Create Keystore (ONE TIME ONLY — save this file forever)
```bash
keytool -genkey -v -keystore datta-ai-release.jks \
  -alias datta-ai \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```
Fill in: name, org, city, country. Set a strong password. **NEVER lose this file.**

### Step 2 — Configure signing
`android/app/build.gradle` — add inside `android {}`:
```gradle
signingConfigs {
    release {
        storeFile file("../../datta-ai-release.jks")
        storePassword "YOUR_STORE_PASSWORD"
        keyAlias "datta-ai"
        keyPassword "YOUR_KEY_PASSWORD"
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled false
        proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
    }
}
```

### Step 3 — Build AAB
In Android Studio:
`Build → Generate Signed Bundle/APK → Android App Bundle → Release`

Or via command line:
```bash
cd android
./gradlew bundleRelease
```
Output: `android/app/build/outputs/bundle/release/app-release.aab`

---

## PHASE 4: Play Console Setup

1. Go to **play.google.com/console** → Create app
2. App name: **Datta AI**
3. Default language: English
4. App or game: **App**
5. Free or paid: **Free** (with in-app purchases later)

### Required assets:
- App icon: 512×512 PNG
- Feature graphic: 1024×500 PNG
- Screenshots: at least 2 phone screenshots (min 320px wide)

### Store listing:
```
Short description (80 chars):
Your intelligent AI assistant — chat, code, search and more.

Full description (4000 chars):
Datta AI is a powerful AI assistant built for everyone.

Features:
• Smart chat with Datta 2.1 and Datta 5.4 models
• Real-time web search for live sports, news, weather
• Code generation and debugging
• Voice input support
• Multi-language support (English, Hindi, Telugu and more)
• Secure — no data sold, HTTPS encrypted
• Free plan: 40 messages/day

Plans:
• Free: 40 messages/day, Datta 2.1
• Plus ₹299/mo: 300 messages/day, Datta 5.4
• Pro ₹799/mo: 1000 messages/day, highest priority
```

---

## PHASE 5: Data Safety Form (Play Console)

Answer these in Play Console → Data Safety:

| Question | Answer |
|---|---|
| Does your app collect data? | Yes |
| Data types collected | Name, Email, Messages/chat |
| Is data encrypted in transit? | Yes |
| Can users request deletion? | Yes |
| Data shared with third parties? | Yes — AI processing (Groq), search (Tavily) |
| Purpose of data collection | App functionality |

---

## PHASE 6: Privacy Policy

Upload `privacy.html` to your GitHub Pages site.
URL will be: `https://datta-ai.com/privacy.html`

Add this URL in:
- Play Console → App content → Privacy policy
- Play Console → Data safety → Privacy policy URL

---

## PHASE 7: Content Rating

Play Console → Content rating → Fill questionnaire:
- Category: **Productivity**
- No violence, no adult content, no user-generated public content
- Result: **Everyone (E)**

---

## PHASE 8: Final Checklist Before Submit

- [ ] AAB file generated and < 150MB
- [ ] App icon 512×512 uploaded
- [ ] At least 2 screenshots uploaded
- [ ] Privacy policy URL added
- [ ] Data safety form completed
- [ ] Content rating completed
- [ ] Store listing description filled
- [ ] Target API level ≥ 33 (Android 13)
- [ ] Test on real device — chat works, streaming works, stop works

---

## IMPORTANT NOTES

1. **Keystore backup** — Copy `datta-ai-release.jks` to Google Drive + USB. If lost, you can NEVER update your app.

2. **Package name** — `com.datta.ai` is permanent. Cannot change after first publish.

3. **Play Billing** — Do NOT process payments inside the app using Razorpay/Stripe for digital goods. Use Google Play Billing for in-app purchases. Web purchases via browser are allowed.

4. **Review time** — First submission takes 3-7 days. Updates take 1-3 days.

5. **Rejection reasons to avoid:**
   - Missing privacy policy → ADDED ✅
   - Data safety incomplete → GUIDE ABOVE ✅
   - Crash on launch → Test before submit ✅
   - Missing content rating → Fill questionnaire ✅
