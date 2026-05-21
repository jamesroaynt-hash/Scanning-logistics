/**
 * Login page — gateway to the system.
 * Industrial split layout: brand panel + form.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await login(username, password);
      navigate('/scan');
    } catch (err) {
      setError(err.message || 'Login failed');
    }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      {/* Brand panel */}
      <div className="hidden md:flex flex-col justify-between p-12 bg-ink-900 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, #fff 0 2px, transparent 2px 22px)',
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="text-accent text-4xl font-display font-bold">
              ◳
            </span>
            <h1 className="font-display font-bold text-2xl">ParcelScan</h1>
          </div>
        </div>
        <div className="relative">
          <h2 className="font-display font-bold text-4xl leading-tight">
            Scan faster.
            <br />
            <span className="text-accent">Ship smarter.</span>
          </h2>
          <p className="text-slate-400 mt-4 max-w-sm">
            High-throughput parcel scanning with live Google Sheets sync,
            built for the warehouse floor.
          </p>
        </div>
        <div className="relative flex gap-8 text-xs font-mono text-slate-500">
          <span>&lt; 1s LOOKUP</span>
          <span>OFFLINE CACHE</span>
          <span>USB + CAMERA</span>
        </div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div className="md:hidden flex items-center gap-2 justify-center mb-4">
            <span className="text-accent text-3xl font-bold">◳</span>
            <h1 className="font-display font-bold text-xl">ParcelScan</h1>
          </div>

          <div>
            <h2 className="font-display font-bold text-2xl">Sign in</h2>
            <p className="text-sm text-slate-500 mt-1">
              Enter your operator credentials
            </p>
          </div>

          {error && (
            <div className="text-sm text-signal-red bg-signal-red/10 border border-signal-red/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <input
              className="input"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
            />
            <input
              className="input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="text-xs text-slate-600 text-center">
            Demo: admin / admin123 &nbsp;·&nbsp; staff / staff123
          </p>
        </form>
      </div>
    </div>
  );
}
