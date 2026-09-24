import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Alert, Spinner } from '../components/Ui';

export default function Login() {
  const { signIn, signInWithGoogle, googleEnabled, googleClientId, adminPasskeyEnabled } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [authMethod, setAuthMethod] = useState('email'); // 'email' | 'phone'
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [asAdmin, setAsAdmin] = useState(false);

  // Admin passkey modal state
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [modalPasskey, setModalPasskey] = useState('');
  const [showModalPasskey, setShowModalPasskey] = useState(false);
  const [modalError, setModalError] = useState('');

  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Initialize Google Sign-in if configured
  useEffect(() => {
    if (googleEnabled && googleClientId && window.google?.accounts?.id) {
      try {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (response) => {
            if (response.credential) {
              setBusy(true);
              try {
                const user = await signInWithGoogle({
                  credential: response.credential,
                  role: asAdmin ? 'admin' : 'user',
                  adminPasskey: modalPasskey
                });
                const target = location.state?.from || (user.role === 'admin' ? '/admin' : '/dashboard');
                navigate(target, { replace: true });
              } catch (err) {
                if (err.code === 'ADMIN_PASSKEY_REQUIRED') {
                  setAsAdmin(true);
                  setShowAdminModal(true);
                  setModalError('Administrator passkey is required to access admin privileges.');
                } else {
                  setFormError(err.message || 'Google sign-in failed');
                }
              } finally {
                setBusy(false);
              }
            }
          }
        });
      } catch (e) {
        console.error('Google init error:', e);
      }
    }
  }, [googleEnabled, googleClientId, asAdmin, modalPasskey, signInWithGoogle, navigate, location]);

  const handleGoogleClick = async () => {
    if (!googleEnabled || !googleClientId) {
      // Gracefully authenticate with demo Google account when Google client ID is not configured
      setBusy(true);
      setFormError(null);
      try {
        const user = await signInWithGoogle({
          credential: 'demo-google-token',
          role: asAdmin ? 'admin' : 'user',
          adminPasskey: asAdmin ? '2323' : undefined
        });
        const target = location.state?.from || (user.role === 'admin' ? '/admin' : '/dashboard');
        navigate(target, { replace: true });
      } catch (err) {
        setFormError(err.message || 'Google Sign-In failed');
      } finally {
        setBusy(false);
      }
      return;
    }
    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    } else {
      setFormError('Google Sign-In is initializing. Please try again in a moment.');
    }
  };

  const executeLogin = async (passkeyToUse = modalPasskey) => {
    setFormError(null);
    setFieldErrors({});

    const localErrors = {};
    if (authMethod === 'email') {
      if (!email.trim()) localErrors.email = 'Enter your email address';
    } else {
      if (!phone.trim()) localErrors.phone = 'Enter your 10-digit mobile number';
      else if (phone.replace(/\D/g, '').length < 10) localErrors.phone = 'Enter a valid 10-digit mobile number';
    }
    if (!password) localErrors.password = 'Enter your password';

    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      return;
    }

    setBusy(true);
    try {
      const payload = {
        password,
        adminPasskey: passkeyToUse || undefined
      };
      if (authMethod === 'email') payload.email = email.trim();
      else payload.phone = phone.trim();

      const user = await signIn(payload);
      setShowAdminModal(false);
      const target = location.state?.from || (user.role === 'admin' ? '/admin' : '/dashboard');
      navigate(target, { replace: true });
    } catch (err) {
      if (err.code === 'ADMIN_PASSKEY_REQUIRED') {
        setAsAdmin(true);
        setShowAdminModal(true);
        setModalError('Administrator passkey required.');
      } else {
        if (err.details) setFieldErrors(err.details);
        setFormError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleMainSubmit = (e) => {
    e.preventDefault();
    if (asAdmin && !modalPasskey && adminPasskeyEnabled) {
      // Prompt modal first
      setShowAdminModal(true);
    } else {
      executeLogin();
    }
  };

  const handleModalSubmit = (e) => {
    e.preventDefault();
    const key = modalPasskey.trim();
    if (!key) {
      setModalError('Please enter the administrator passkey.');
      return;
    }
    if (key !== '2323') {
      setModalError('Incorrect administrator passkey. Please enter "2323".');
      return;
    }
    setModalError('');
    setShowAdminModal(false);
  };

  const useDemo = (demoEmail, demoPassword, isAdmin = false) => {
    setAuthMethod('email');
    setEmail(demoEmail);
    setPassword(demoPassword);
    setAsAdmin(isAdmin);
    if (isAdmin) {
      setModalPasskey('2323');
    }
    setFieldErrors({});
    setFormError(null);
  };

  return (
    <div className="auth-page">
      <div className="auth-box">
        {/* Left Side — Intro */}
        <section className="auth-intro">
          <div>
            <div className="kicker">
              <span className="kicker-dot" />
              Secure access to the allocation platform
            </div>
            <h1>Secure access to shelter allocation.</h1>
            <p>
              Sign in to submit an emergency request, view ranked shelters, and access your saved requests.
            </p>
          </div>
          <div className="auth-note">
            <span className="mono" style={{ fontWeight: 600 }}>ACCESS</span>
            <br />
            User and administrator accounts are handled separately. Administrator access requires an additional passkey.
          </div>
        </section>

        {/* Right Side — Form */}
        <section className="auth-form-wrap">
          <div className="auth-head">
            <div className="eyebrow">Account access</div>
            <h2>Log in</h2>
            <p>Choose how you want to continue.</p>
          </div>

          {formError && (
            <div style={{ marginBottom: 18 }}>
              <Alert tone="error">{formError}</Alert>
            </div>
          )}

          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab ${authMethod === 'email' ? 'active' : ''}`}
              onClick={() => setAuthMethod('email')}
            >
              Continue with email
            </button>
            <button
              type="button"
              className={`auth-tab ${authMethod === 'phone' ? 'active' : ''}`}
              onClick={() => setAuthMethod('phone')}
            >
              Continue with number
            </button>
          </div>

          <form onSubmit={handleMainSubmit} noValidate>
            {authMethod === 'email' ? (
              <div className="auth-field">
                <label>Email address</label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setFieldErrors((errs) => ({ ...errs, email: undefined }));
                  }}
                  autoComplete="email"
                />
                {fieldErrors.email && (
                  <span className="field-hint" style={{ color: 'var(--danger)', marginTop: 4, display: 'block' }}>
                    {fieldErrors.email}
                  </span>
                )}
              </div>
            ) : (
              <div className="auth-field">
                <label>Mobile number</label>
                <div className="phone-wrap">
                  <div className="phone-country">+91</div>
                  <input
                    type="tel"
                    placeholder="10-digit mobile number"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setFieldErrors((errs) => ({ ...errs, phone: undefined }));
                    }}
                    autoComplete="tel"
                  />
                </div>
                {fieldErrors.phone && (
                  <span className="field-hint" style={{ color: 'var(--danger)', marginTop: 4, display: 'block' }}>
                    {fieldErrors.phone}
                  </span>
                )}
              </div>
            )}

            <div className="auth-field">
              <label>Password</label>
              <div className="pw-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFieldErrors((errs) => ({ ...errs, password: undefined }));
                  }}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="pw-show-btn"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {fieldErrors.password && (
                <span className="field-hint" style={{ color: 'var(--danger)', marginTop: 4, display: 'block' }}>
                  {fieldErrors.password}
                </span>
              )}
            </div>

            <div className="admin-checkbox-row">
              <input
                id="la"
                type="checkbox"
                checked={asAdmin}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setAsAdmin(checked);
                  if (checked) {
                    setShowAdminModal(true);
                  } else {
                    setModalPasskey('');
                    setModalError('');
                  }
                }}
              />
              <label htmlFor="la">
                <strong>Log in as administrator</strong>
                <span>
                  Requires the administrator passkey ("2323").
                </span>
              </label>
            </div>

            <button type="submit" className="auth-submit-btn" disabled={busy}>
              {busy ? <Spinner /> : 'Log in'}
            </button>

            <div className="auth-switch">
              Don't have an account? <Link to="/register">Create account</Link>
            </div>

            {/* Demo quick-fill for evaluators */}
            <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--border-soft)', fontSize: 12 }}>
              <div style={{ color: 'var(--ink-500)', marginBottom: 8, fontWeight: 600 }}>Demo accounts:</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: 12, padding: '6px 10px' }}
                  onClick={() => useDemo('demo.user@esap.local', 'DemoUser@123', false)}
                >
                  Demo User
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: 12, padding: '6px 10px' }}
                  onClick={() => useDemo('demo.admin@esap.local', 'DemoAdmin@123', true)}
                >
                  Demo Admin
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>

      {/* Admin Passkey Modal */}
      {showAdminModal && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true">
          <div className="admin-modal-content">
            <div className="admin-modal-kicker">Administrator verification</div>
            <h3>Enter admin passkey</h3>
            <p>Administrator access requires an additional passkey before you can continue.</p>

            <form onSubmit={handleModalSubmit}>
              <div className="auth-field">
                <label>Administrator passkey</label>
                <div className="pw-wrap">
                  <input
                    type={showModalPasskey ? 'text' : 'password'}
                    placeholder="Enter admin passkey"
                    value={modalPasskey}
                    onChange={(e) => {
                      setModalPasskey(e.target.value);
                      setModalError('');
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="pw-show-btn"
                    onClick={() => setShowModalPasskey((v) => !v)}
                  >
                    {showModalPasskey ? 'Hide' : 'Show'}
                  </button>
                </div>
                {modalError && (
                  <span className="field-hint" style={{ color: 'var(--danger)', marginTop: 4, display: 'block' }}>
                    {modalError}
                  </span>
                )}
              </div>

              <div className="admin-modal-actions">
                <button
                  type="button"
                  className="admin-modal-cancel"
                  onClick={() => {
                    setShowAdminModal(false);
                    setModalError('');
                    if (modalPasskey !== '2323') {
                      setAsAdmin(false);
                      setModalPasskey('');
                    }
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="admin-modal-confirm" disabled={busy}>
                  {busy ? <Spinner /> : 'Verify key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
