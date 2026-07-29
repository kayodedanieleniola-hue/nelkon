/* =====================================================================
   SHARED AUTH MODAL — auth-modal.js
   Used by campaign.html and contact.html.

   HOW TO USE ON A PAGE:
   1. Include auth-modal.css in <head>.
   2. Include the Supabase SDK <script> tag, then this file,
      before </body>.
   3. Make sure `/static/js/supabase-config.js` loads before this script.
   4. Call AuthModal.open({ onComplete: (profile) => { ... } }) from a
      button click. onComplete fires once the person is authenticated
      AND has a complete profile (existing returning users skip straight
      to onComplete; first-time users go through profile completion
      first).
   5. AuthModal.currentUser() / AuthModal.currentProfile() are available
      any time after onComplete has fired once.

   NOTE ON AUTHORITY:
   Contact uses Supabase Auth directly for Google OAuth and email/password,
   because contact profiles, avatars, and sessions are stored in Supabase.
   ===================================================================== */

const AuthModal = (function(){
  try {

  let onCompleteCallback = null;
  let _supaUser = null;
  let _profile = null;
  let avatarFile = null;
  let avatarDataUrl = null;
  let _pendingFallbackEmail = '';
  let _pendingExistingProfile = null;

  // ---- Sanity checks up front, with visible errors instead of silent failure ----
  if(typeof window.supabase === 'undefined'){
    console.error('AuthModal: the Supabase SDK script tag did not load (window.supabase is undefined). Check the <script src> tag for supabase-js is present and loads BEFORE auth-modal.js.');
  }
  if(!window.NAK_SUPABASE_CONFIG){
    console.error('AuthModal: /static/js/supabase-config.js did not load before auth-modal.js.');
  }

  // ---- Supabase init ----
  const supabaseConfig = window.NAK_SUPABASE_CONFIG || {};
  let sb = null;
  try {
    sb = window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey);
  } catch(e){
    console.error('Supabase failed to load:', e);
  }

  // ---- Build modal DOM once ----
  const overlay = document.createElement('div');
  overlay.className = 'auth-modal-overlay';
  overlay.innerHTML = `
    <div class="auth-modal-card">
      <button class="auth-modal-close" id="amClose" aria-label="Close">✕</button>

      <!-- SCREEN: Google + Email/Password choice -->
      <div class="am-screen active" id="amScreenAuth">
        <div class="auth-modal-head">
          <span class="auth-modal-tag">Nakconel</span>
          <h3 class="auth-modal-title">Sign in to continue</h3>
          <p class="auth-modal-sub">Join the conversation or claim your spot in the campaign.</p>
        </div>

        <button type="button" class="am-google-btn" id="amGoogleBtn">
          <svg class="am-google-icon" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.5 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 18.9 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.5 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.5 0 10.5-2.1 14-5.6l-6.5-5.3C29.5 35 26.9 36 24 36c-5.3 0-9.7-3.4-11.3-8.1l-6.6 5.1C9.6 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.5 5.3C41.5 36.4 44 30.8 44 24c0-1.3-.1-2.7-.4-3.5z"/></svg>
          Continue with Google
        </button>
        <p class="am-err" id="amGoogleErr" style="text-align:center;margin-top:10px;"></p>

        <div class="am-divider">or use email</div>

        <div class="am-tabs">
          <div class="am-tab active" id="amTabSignup">Sign Up</div>
          <div class="am-tab" id="amTabLogin">Log In</div>
        </div>

        <form class="am-form" id="amEmailForm">
          <div class="am-g" id="amNameField">
            <label for="amName">Full Name</label>
            <input type="text" id="amName" placeholder="e.g., Katherine Vance">
          </div>
          <div class="am-g">
            <label for="amEmail">Email</label>
            <input type="email" id="amEmail" placeholder="kvance@enterprise.com" required>
          </div>
          <div class="am-g">
            <label for="amPassword">Password</label>
            <input type="password" id="amPassword" placeholder="••••••••" required minlength="6">
          </div>
          <p class="am-err" id="amEmailErr"></p>
          <button type="submit" class="am-submit" id="amEmailSubmitBtn">Sign Up ↗</button>
        </form>

        <p class="am-switch-line" id="amSwitchLine">Already have an account? <a id="amSwitchToLogin">Log in</a></p>
      </div>

      <!-- SCREEN: Profile completion (first-time users only) -->
      <div class="am-screen" id="amScreenProfile">
        <div class="am-step-track"><div class="am-step-dot done"></div><div class="am-step-dot"></div></div>
        <div class="auth-modal-head">
          <h3 class="auth-modal-title">Complete Your Profile</h3>
          <p class="auth-modal-sub">Just a couple quick things before you're in.</p>
        </div>

        <div class="am-avatar-upload">
          <div class="am-avatar-circle" id="amAvatarCircle">
            <span class="plus-icon">+</span>
          </div>
          <span class="am-avatar-hint">Add a profile photo (optional)</span>
          <input type="file" id="amAvatarInput" accept="image/*" style="display:none;">
        </div>

        <form class="am-form" id="amProfileForm">
          <div class="am-g" id="amProfileNameField">
            <label for="amProfileName">Full Name</label>
            <input type="text" id="amProfileName" placeholder="e.g., Katherine Vance" required>
          </div>
          <div class="am-g">
            <label for="amProfilePhone">Phone</label>
            <input type="tel" id="amProfilePhone" placeholder="+1 (555) 000-0000" required>
          </div>
          <div class="am-g" id="amBizField">
            <label for="amProfileBiz">Your Business Idea or Challenge</label>
            <textarea id="amProfileBiz" rows="3" placeholder="Tell us what you're building or what you're stuck on..."></textarea>
          </div>
          <p class="am-err" id="amProfileErr"></p>
          <button type="submit" class="am-submit" id="amProfileSubmitBtn">Continue ↗</button>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const screens = {
    auth: overlay.querySelector('#amScreenAuth'),
    profile: overlay.querySelector('#amScreenProfile')
  };
  function showScreen(name){
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
  }

  // ---- Open / close ----
  function open(opts){
    opts = opts || {};
    onCompleteCallback = opts.onComplete || null;

    // Already authenticated this session with a complete profile — just fire the callback.
    if(_supaUser && _profile){
      if(onCompleteCallback) onCompleteCallback(_profile);
      return;
    }
    showScreen('auth');
    setMode('signup');
    document.getElementById('amGoogleErr').textContent = '';
    document.getElementById('amEmailErr').textContent = '';
    overlay.classList.add('show');
    document.body.classList.add('auth-modal-open');
  }
  function close(){
    overlay.classList.remove('show');
    document.body.classList.remove('auth-modal-open');
  }
  overlay.querySelector('#amClose').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if(e.target === overlay) close(); });

  // ---- Sign Up / Log In tab toggle ----
  let mode = 'signup';
  function setMode(m){
    mode = m;
    document.getElementById('amTabSignup').classList.toggle('active', m === 'signup');
    document.getElementById('amTabLogin').classList.toggle('active', m === 'login');
    document.getElementById('amNameField').style.display = m === 'signup' ? 'flex' : 'none';
    document.getElementById('amEmailSubmitBtn').textContent = m === 'signup' ? 'Sign Up ↗' : 'Log In ↗';
    document.getElementById('amSwitchLine').innerHTML = m === 'signup'
      ? 'Already have an account? <a id="amSwitchToLogin">Log in</a>'
      : "Don't have an account? <a id=\"amSwitchToLogin\">Sign up</a>";
    document.getElementById('amEmailErr').textContent = '';
    bindSwitchLink();
  }
  function bindSwitchLink(){
    const link = document.getElementById('amSwitchToLogin');
    if(link) link.addEventListener('click', () => setMode(mode === 'signup' ? 'login' : 'signup'));
  }
  document.getElementById('amTabSignup').addEventListener('click', () => setMode('signup'));
  document.getElementById('amTabLogin').addEventListener('click', () => setMode('login'));
  bindSwitchLink();

  // ---- Shared: after we have a Supabase user, check/create profile ----
  async function handlePostAuth(supaUserObj, fallbackName, fallbackEmail, fallbackPhoto){
    _supaUser = supaUserObj;

    const { data: existingProfile } = await sb.from('profiles').select('*').eq('id', supaUserObj.id).maybeSingle();

    if(existingProfile && existingProfile.name && existingProfile.phone){
      // Returning user with a complete profile — done.
      _profile = existingProfile;
      close();
      if(onCompleteCallback) onCompleteCallback(_profile);
      return;
    }

    // First-time user, or a profile that's missing required fields — collect them.
    document.getElementById('amProfileName').value = (existingProfile && existingProfile.name) || fallbackName || '';
    document.getElementById('amProfilePhone').value = (existingProfile && existingProfile.phone) || '';
    document.getElementById('amProfileBiz').value = (existingProfile && existingProfile.business_idea) || '';
    if(fallbackPhoto){
      document.getElementById('amAvatarCircle').innerHTML = `<img src="${fallbackPhoto}" alt="">`;
    }
    _pendingFallbackEmail = (existingProfile && existingProfile.email) || fallbackEmail || '';
    _pendingExistingProfile = existingProfile || null;

    showScreen('profile');
  }

  // ---- Google sign-in through Supabase Auth ----
  document.getElementById('amGoogleBtn').addEventListener('click', async () => {
    const btn = document.getElementById('amGoogleBtn');
    const err = document.getElementById('amGoogleErr');
    err.textContent = '';

    if(!sb){
      err.textContent = 'Could not connect to the server. Please check your connection and try again.';
      return;
    }

    btn.disabled = true;
    try {
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.href.split('#')[0] }
      });
      if(error){
        err.textContent = error.message || 'Google sign-in failed. Please try again.';
      }
    } catch(ex){
      console.error('Google sign-in failed:', ex);
      err.textContent = 'Could not sign in with Google. Please try again.';
    } finally {
      btn.disabled = false;
    }
  });

  // ---- Email/password sign-up or log-in ----
  document.getElementById('amEmailForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('amEmailErr');
    const btn = document.getElementById('amEmailSubmitBtn');
    err.textContent = '';

    const name = document.getElementById('amName').value.trim();
    const email = document.getElementById('amEmail').value.trim();
    const password = document.getElementById('amPassword').value;

    if(mode === 'signup' && !name){
      err.textContent = 'Please enter your name.';
      return;
    }
    if(!email || !password){
      err.textContent = 'Please fill in every field.';
      return;
    }
    if(!sb){
      err.textContent = 'Could not connect to the server. Please check your connection and try again.';
      return;
    }

    btn.disabled = true;
    btn.textContent = mode === 'signup' ? 'Signing up…' : 'Logging in…';

    try {
      const { data, error } = mode === 'signup'
        ? await sb.auth.signUp({
            email,
            password,
            options: { data: { name } }
          })
        : await sb.auth.signInWithPassword({ email, password });

      if(error){
        err.textContent = error.message || 'Sign-in failed. Please try again.';
        btn.disabled = false;
        btn.textContent = mode === 'signup' ? 'Sign Up ↗' : 'Log In ↗';
        return;
      }

      if(!data.user){
        err.textContent = 'Check your email to confirm your account, then log in.';
        return;
      }
      if(mode === 'signup' && !data.session){
        err.textContent = 'Check your email to confirm your account, then log in.';
        return;
      }

      await handlePostAuth(data.user, name || data.user.user_metadata?.name, email, data.user.user_metadata?.avatar_url);
    } catch(ex){
      console.error('Email auth failed:', ex);
      err.textContent = (ex && ex.message) ? ex.message : 'Something went wrong. Please try again.';
    } finally {
      btn.disabled = false;
      btn.textContent = mode === 'signup' ? 'Sign Up ↗' : 'Log In ↗';
    }
  });

  // ---- Avatar picker (profile completion step) ----
  document.getElementById('amAvatarCircle').addEventListener('click', () => {
    document.getElementById('amAvatarInput').click();
  });
  document.getElementById('amAvatarInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(!file) return;
    avatarFile = file;
    const reader = new FileReader();
    reader.onload = (ev) => {
      avatarDataUrl = ev.target.result;
      document.getElementById('amAvatarCircle').innerHTML = `<img src="${avatarDataUrl}" alt="">`;
    };
    reader.readAsDataURL(file);
  });

  // ---- Profile completion submit ----
  document.getElementById('amProfileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('amProfileErr');
    const btn = document.getElementById('amProfileSubmitBtn');
    err.textContent = '';

    const name = document.getElementById('amProfileName').value.trim();
    const phone = document.getElementById('amProfilePhone').value.trim();
    const business_idea = document.getElementById('amProfileBiz').value.trim();

    if(!name || !phone){
      err.textContent = 'Please fill in your name and phone.';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      let avatarUrl = (_pendingExistingProfile && _pendingExistingProfile.avatar_url) || null;

      if(avatarFile || avatarDataUrl){
        try {
          let uploadBlob = avatarFile;
          let ext = avatarFile ? (avatarFile.name.split('.').pop() || 'jpg').toLowerCase() : 'jpg';
          if(!uploadBlob && avatarDataUrl){
            const res = await fetch(avatarDataUrl);
            uploadBlob = await res.blob();
            ext = (uploadBlob.type || 'image/jpeg').split('/')[1] || 'jpg';
          }
          const storagePath = _supaUser.id + '.' + ext;
          const { error: uploadErr } = await sb.storage.from('avatars').upload(storagePath, uploadBlob, { upsert: true, contentType: uploadBlob.type || 'image/jpeg' });
          if(!uploadErr){
            const { data: pub } = sb.storage.from('avatars').getPublicUrl(storagePath);
            avatarUrl = pub.publicUrl;
          } else {
            console.warn('Avatar upload failed:', uploadErr.message);
          }
        } catch(uploadEx){
          console.warn('Avatar upload exception:', uploadEx);
        }
      }

      const profileRow = {
        id: _supaUser.id,
        name,
        phone,
        email: _pendingFallbackEmail,
        avatar_url: avatarUrl,
        business_idea: business_idea || null
      };

      const { error: upsertErr } = await sb.from('profiles').upsert(profileRow);
      if(upsertErr){
        err.textContent = upsertErr.message;
        btn.disabled = false;
        btn.textContent = 'Continue ↗';
        return;
      }

      const { data: savedProfile } = await sb.from('profiles').select('*').eq('id', _supaUser.id).maybeSingle();
      _profile = savedProfile || profileRow;

      avatarFile = null;
      avatarDataUrl = null;
      close();
      if(onCompleteCallback) onCompleteCallback(_profile);
    } catch(ex){
      console.error('Profile save failed:', ex);
      err.textContent = 'Something went wrong saving your profile. Please try again.';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Continue ↗';
    }
  });

  return {
    open,
    close,
    resumeSession: async (callback) => {
      onCompleteCallback = callback || onCompleteCallback;
      if(!sb) return null;
      const { data } = await sb.auth.getSession();
      if(!data.session) return null;
      const user = data.session.user;
      await handlePostAuth(
        user,
        user.user_metadata?.name || user.user_metadata?.full_name,
        user.email,
        user.user_metadata?.avatar_url || user.user_metadata?.picture
      );
      return user;
    },
    currentUser: () => _supaUser,
    currentProfile: () => _profile,
    supabaseClient: () => sb
  };

  } catch(buildError){
    // If anything above failed to build (missing SDK, bad config, etc.), AuthModal
    // still exists, but open() shows a visible alert instead of doing nothing —
    // so a broken setup is obvious instead of a dead button.
    console.error('AuthModal failed to initialize:', buildError);
    return {
      open: () => alert('Sign-in is not set up correctly on this page yet (' + buildError.message + '). Check the browser console for details.'),
      close: () => {},
      resumeSession: async () => null,
      currentUser: () => null,
      currentProfile: () => null,
      supabaseClient: () => null
    };
  }
})();
