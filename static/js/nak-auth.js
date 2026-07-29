import { auth, googleProvider, db } from '/static/js/firebase-config.js';
import { 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { 
  doc, 
  setDoc, 
  getDoc, 
  serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export { auth, onAuthStateChanged };

export async function nakSignIn(email, password) {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return { user: result.user, error: null };
  } catch (error) {
    return { user: null, error: error.message };
  }
}

export async function nakSignUp(email, password, username) {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    const user = result.user;
    
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      email: email.toLowerCase(),
      username: username,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    return { user, error: null };
  } catch (error) {
    return { user: null, error: error.message };
  }
}

export async function nakGoogleSignIn() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists()) {
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email.toLowerCase(),
        username: user.displayName || user.email.split('@')[0],
        photoURL: user.photoURL,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
    
    return { user, error: null };
  } catch (error) {
    return { user: null, error: error.message };
  }
}

export async function nakSignOut() {
  try {
    await firebaseSignOut(auth);
    return { error: null };
  } catch (error) {
    return { error: error.message };
  }
}

export function getCurrentUser() {
  return auth.currentUser;
}

export async function getIdToken() {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

export async function fetchWithAuth(url, options = {}) {
  const token = await getIdToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return fetch(url, {
    ...options,
    headers
  });
}
