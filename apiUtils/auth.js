// API route for user sign up and saving details to Firestore
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { app } from '../config/firebase';
import { db } from '../config/firestore';

const auth = getAuth(app);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { email, password, ...profile } = req.body;
  try {
    // Create user in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    // Save user profile in Firestore (under users collection)
    await setDoc(doc(db, 'users', user.uid), {
      email,
      ...profile,
      createdAt: new Date().toISOString(),
    });
    res.status(201).json({ uid: user.uid });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}
