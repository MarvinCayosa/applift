// API route for Google OAuth sign-in
import { getAuth, signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { app } from '../../config/firebase';
import { db } from '../../config/firestore';

const auth = getAuth(app);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ error: 'Missing Google ID token' });
  }
  try {
    const credential = GoogleAuthProvider.credential(idToken);
    const userCredential = await signInWithCredential(auth, credential);
    const user = userCredential.user;
    // Check if user profile exists in Firestore
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists()) {
      // New user: return flag to redirect to survey
      await setDoc(doc(db, 'users', user.uid), {
        email: user.email,
        displayName: user.displayName,
        createdAt: new Date().toISOString(),
        provider: 'google',
      });
      return res.status(200).json({ uid: user.uid, newUser: true });
    }
    // Existing user: proceed to dashboard
    res.status(200).json({ uid: user.uid, newUser: false });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}
