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
  collection,
  query,
  where,
  getDocs,
  serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export { auth, googleProvider, db, onAuthStateChanged };

// Map Firebase error codes to friendly messages
export function getErrorMessage(errorCode) {
  if (!errorCode) return 'An error occurred. Please try again.';
  const code = String(errorCode);
  switch (code) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in instead.';
    case 'auth/weak-password':
      return 'Password is too weak. Please use a stronger password.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in popup was closed before completing.';
    case 'auth/cancelled-popup-request':
      return 'Sign-in popup was cancelled.';
    case 'auth/unauthorized-domain':
      return 'Domain not authorized in Firebase. Please add your Vercel domain in Firebase Console -> Auth -> Settings -> Authorized Domains.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your internet connection.';
    default:
      if (code.startsWith('auth/')) {
        return code.replace('auth/', '').replace(/-/g, ' ');
      }
      return code;
  }
}

// Display helpers
export function getDisplayName(user) {
  if (!user) return 'Guest';
  return user.displayName || user.email?.split('@')[0] || 'User';
}

export function getUserInitials(user) {
  const name = getDisplayName(user);
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function getProviderLabel(user) {
  if (!user || !user.providerData || user.providerData.length === 0) return 'Email / Password';
  const providerId = user.providerData[0].providerId;
  if (providerId === 'google.com') return 'Google Auth';
  if (providerId === 'password') return 'Email & Password';
  return providerId;
}

// Auth state helper for protected client pages
export function requireAuth(redirectUrl = '/login') {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      if (!user) {
        window.location.href = redirectUrl;
        resolve(null);
      } else {
        resolve(user);
      }
    });
  });
}

// Core Auth Methods (throwing errors as expected by async try/catch callers in login.html & register.html)
export async function signInWithEmail(emailOrUsername, password) {
  let email = emailOrUsername.trim();
  if (!email.includes('@')) {
    try {
      const q = query(collection(db, 'users'), where('username', '==', email));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        email = querySnapshot.docs[0].data().email;
      }
    } catch (e) {
      console.warn('Username lookup notice:', e);
    }
  }
  const result = await signInWithEmailAndPassword(auth, email, password);
  await syncAdminDirectory(result.user);
  return result.user;
}

async function syncAdminDirectory(user, username) {
  if (!user) return;
  try {
    const token = await user.getIdToken();
    await fetch('/api/users/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ username: username || user.displayName || user.email?.split('@')[0], photoURL: user.photoURL || '' })
    });
  } catch (e) {
    console.warn('Admin directory sync notice:', e);
  }
}

export async function signUpWithEmail(email, password, username) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  const user = result.user;
  await syncAdminDirectory(user, username || email.split('@')[0]);
  
  return user;
}

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;
  
  await syncAdminDirectory(user);
  
  return user;
}

// Aliases for compatibility
export async function nakSignIn(email, password) {
  try {
    const user = await signInWithEmail(email, password);
    return { user, error: null };
  } catch (err) {
    return { user: null, error: err.message };
  }
}

export async function nakSignUp(email, password, username) {
  try {
    const user = await signUpWithEmail(email, password, username);
    return { user, error: null };
  } catch (err) {
    return { user: null, error: err.message };
  }
}

export async function nakGoogleSignIn() {
  try {
    const user = await signInWithGoogle();
    return { user, error: null };
  } catch (err) {
    return { user: null, error: err.message };
  }
}

export async function nakSignOut() {
  try {
    await firebaseSignOut(auth);
    return { error: null };
  } catch (err) {
    return { error: err.message };
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
