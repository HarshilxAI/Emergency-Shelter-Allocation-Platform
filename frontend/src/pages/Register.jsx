import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Alert, Spinner } from '../components/Ui';

export default function Register() {
  const { register, signInWithGoogle, googleEnabled, googleClientId, adminPasskeyEnabled } = useAuth();
  const navigate = useNavigate();

  const [authMethod, setAuthMethod] = useState('email'); // 'email' | 'phone'
  const [name, setName] = useState('');
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

  // Live password requirements
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

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
                navigate(user.role === 'admin' ? '/admin' : '/dashboard', { replace: true });
              } catch (err) {
                if (err.code === 'ADMIN_PASSKEY_REQUIRED') {
                  setAsAdmin(true);
                  setShowAdminModal(true);
                  setModalError('Administrator passkey is required to create an admin account.');
                } else {
                  setFormError(err.message || 'Google registration failed');
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
  }, [googleEnabled, googleClientId, asAdmin, modalPasskey, signInWithGoogle, navigate]);

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
        navigate(user.role === 'admin' ? '/admin' : '/dashboard', { replace: true });
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

  const validate = () => {
    const errs = {};
    if (authMethod === 'email') {
      if (!name.trim()) errs.name = 'Enter your name (at least 2 characters)';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
        errs.email = 'Enter a valid email address';
      }
    } else {
      const cleanDigits = phone.replace(/\D/g, '');
      if (cleanDigits.length < 10) {
        errs.phone = 'Enter a valid 10-digit mobile number';
      }
    }

    if (!hasMinLength || !hasUppercase || !hasNumber || !hasSpecial) {
      errs.password = 'Password does not meet all security requirements';
    }

    return errs;
  };

  const executeRegister = async (passkeyToUse = modalPasskey) => {
    setFormError(null);
    setFieldErrors({});

    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    setBusy(true);
    try {
      let regName = name.trim();
      let regEmail = email.trim();
      let regPhone = phone.trim();

      if (authMethod === 'phone') {
        const clean = regPhone.replace(/\D/g, '');
        regEmail = `${clean}@phone.esap.local`;
        regName = regName || `User ${clean.slice(-4)}`;
        regPhone = `+91 ${clean}`;
      }

      const payload = {
        name: regName,
        email: regEmail,
        phone: regPhone || undefined,
        password,
        confirmPassword: password,
        isAdmin: asAdmin,
        adminPasskey: passkeyToUse || undefined
      };

      const result = await register(payload);
      setShowAdminModal(false);

      if (asAdmin && result.adminRequestDenied) {
        setFormError(`Account created as a normal user: ${result.adminRequestDenied}`);
        setTimeout(() => {
          navigate('/dashboard', { replace: true });
        }, 1500);
        return;
      }

      navigate(result.user.role === 'admin' ? '/admin' : '/dashboard', { replace: true });
    } catch (err) {
      if (err.details) setFieldErrors(err.details);
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleMainSubmit = (e) => {
    e.preventDefault();
    if (asAdmin && !modalPasskey && adminPasskeyEnabled) {
      setShowAdminModal(true);
    } else {
      executeRegister();
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
            <h1>Create your access.</h1>
            <p>
              Create an account to submit emergency requests, receive ranked shelter recommendations, and track your requests.
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
            <div className="eyebrow">New account</div>
            <h2>Create account</h2>
            <p>Set up your access to the shelter allocation platform.</p>
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
              <>
                <div className="auth-field">
                  <label>Full name</label>
                  <input
                    type="text"
                    placeholder="Your full name"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setFieldErrors((errs) => ({ ...errs, name: undefined }));
                    }}
                    autoComplete="name"
                  />
                  {fieldErrors.name && (
                    <span className="field-hint" style={{ color: 'var(--danger)', marginTop: 4, display: 'block' }}>
                      {fieldErrors.name}
                    </span>
                  )}
                </div>

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
              </>
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
                  placeholder="Create a strong password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFieldErrors((errs) => ({ ...errs, password: undefined }));
                  }}
                  autoComplete="new-password"
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

            {/* Live Password Requirements */}
            <div className="rules-box">
              <div className="rules-title">Password requirements</div>
              <div className={`rule-item ${hasMinLength ? 'ok' : ''}`}>At least 8 characters</div>
              <div className={`rule-item ${hasUppercase ? 'ok' : ''}`}>At least 1 uppercase letter</div>
              <div className={`rule-item ${hasNumber ? 'ok' : ''}`}>At least 1 number</div>
              <div className={`rule-item ${hasSpecial ? 'ok' : ''}`}>At least 1 special character</div>
            </div>

            <div className="admin-checkbox-row">
              <input
                id="sa"
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
              <label htmlFor="sa">
                <strong>Create account as administrator</strong>
                <span>
                  Requires the administrator passkey ("2323").
                </span>
              </label>
            </div>

            <button type="submit" className="auth-submit-btn" disabled={busy}>
              {busy ? <Spinner /> : 'Create account'}
            </button>

            <div className="auth-switch">
              Already have an account? <Link to="/login">Log in</Link>
            </div>
          </form>
        </section>
      </div>

      {/* Admin Passkey Modal */}
      {showAdminModal && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true">
          <div className="admin-modal-content">
            <div className="admin-modal-kicker">Administrator verification</div>
            <h3>Verify administrator account</h3>
            <p>Enter the administrator passkey to continue creating this account.</p>

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
