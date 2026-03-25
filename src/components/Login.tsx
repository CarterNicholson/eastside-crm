import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, UserPlus, LogIn, ShieldCheck } from 'lucide-react';

interface LoginProps {
  onLogin: (user: { id: string; name: string; email: string; role: string }, token: string) => void;
}

type AuthMode = 'login' | 'signup';

export function Login({ onLogin }: LoginProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      localStorage.setItem('crm_token', data.token);
      localStorage.setItem('crm_user', JSON.stringify(data.user));
      onLogin(data.user, data.token);
    } catch {
      setError('Connection error. Please try again.');
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, inviteCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Signup failed');
        setLoading(false);
        return;
      }

      localStorage.setItem('crm_token', data.token);
      localStorage.setItem('crm_user', JSON.stringify(data.user));
      onLogin(data.user, data.token);
    } catch {
      setError('Connection error. Please try again.');
      setLoading(false);
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setError('');
    setEmail('');
    setPassword('');
    setName('');
    setInviteCode('');
  };

  return (
    <div className="flex h-screen items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(140deg, hsl(225, 45%, 7%) 0%, hsl(228, 48%, 12%) 40%, hsl(222, 42%, 8%) 100%)' }}>

      {/* Subtle gradient orbs */}
      <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full opacity-[0.06]"
        style={{ background: 'radial-gradient(circle, hsl(222, 70%, 50%), transparent 65%)' }} />
      <div className="absolute bottom-[-15%] left-[-10%] w-[500px] h-[500px] rounded-full opacity-[0.04]"
        style={{ background: 'radial-gradient(circle, hsl(250, 55%, 50%), transparent 65%)' }} />
      <div className="absolute top-[20%] left-[30%] w-[300px] h-[300px] rounded-full opacity-[0.03]"
        style={{ background: 'radial-gradient(circle, hsl(200, 60%, 50%), transparent 70%)' }} />

      <div className="relative z-10 w-[400px] slide-up">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
            style={{
              background: 'linear-gradient(135deg, hsl(222, 70%, 52%), hsl(250, 55%, 48%))',
              boxShadow: '0 8px 24px -4px hsla(222, 70%, 50%, 0.4), 0 0 0 1px hsla(222, 70%, 60%, 0.1)',
            }}>
            <span className="text-white text-2xl font-bold tracking-tight">EC</span>
          </div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Eastside CRM</h1>
          <p className="text-[11px] text-white/25 mt-1.5 font-medium tracking-[0.15em] uppercase">Kidder Mathews</p>
        </div>

        {/* Mode Tabs */}
        <div className="flex mb-6 rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <button
            onClick={() => switchMode('login')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              mode === 'login'
                ? 'text-white shadow-md'
                : 'text-white/40 hover:text-white/60'
            }`}
            style={mode === 'login' ? { background: 'rgba(255,255,255,0.1)' } : undefined}
          >
            <LogIn size={15} />
            Sign In
          </button>
          <button
            onClick={() => switchMode('signup')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              mode === 'signup'
                ? 'text-white shadow-md'
                : 'text-white/40 hover:text-white/60'
            }`}
            style={mode === 'signup' ? { background: 'rgba(255,255,255,0.1)' } : undefined}
          >
            <UserPlus size={15} />
            Join Team
          </button>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-8"
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            backdropFilter: 'blur(40px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
          }}>

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <Label className="text-xs font-medium text-white/40 uppercase tracking-wider">Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@kidder.com"
                  className="mt-2 h-11 bg-white/[0.06] border-white/[0.08] text-white placeholder:text-white/20 rounded-xl focus:bg-white/[0.08] focus:border-blue-500/50 focus:ring-blue-500/20"
                  autoFocus
                  required
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-white/40 uppercase tracking-wider">Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="mt-2 h-11 bg-white/[0.06] border-white/[0.08] text-white placeholder:text-white/20 rounded-xl focus:bg-white/[0.08] focus:border-blue-500/50 focus:ring-blue-500/20"
                  required
                />
              </div>

              {error && (
                <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-xl text-sm font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-200"
                style={{ background: 'linear-gradient(135deg, hsl(220, 70%, 55%), hsl(250, 60%, 50%))' }}
              >
                {loading ? <><Loader2 size={16} className="animate-spin mr-2" /> Signing in...</> : 'Sign In'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <Label className="text-xs font-medium text-white/40 uppercase tracking-wider">Full Name</Label>
                <Input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Jane Smith"
                  className="mt-2 h-11 bg-white/[0.06] border-white/[0.08] text-white placeholder:text-white/20 rounded-xl focus:bg-white/[0.08] focus:border-blue-500/50 focus:ring-blue-500/20"
                  autoFocus
                  required
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-white/40 uppercase tracking-wider">Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@kidder.com"
                  className="mt-2 h-11 bg-white/[0.06] border-white/[0.08] text-white placeholder:text-white/20 rounded-xl focus:bg-white/[0.08] focus:border-blue-500/50 focus:ring-blue-500/20"
                  required
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-white/40 uppercase tracking-wider">Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="mt-2 h-11 bg-white/[0.06] border-white/[0.08] text-white placeholder:text-white/20 rounded-xl focus:bg-white/[0.08] focus:border-blue-500/50 focus:ring-blue-500/20"
                  required
                  minLength={6}
                />
              </div>
              <div>
                <Label className="text-xs font-medium text-white/40 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck size={12} className="text-blue-400/60" />
                  Team Code
                </Label>
                <Input
                  type="text"
                  value={inviteCode}
                  onChange={e => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="KM-XXXXXX"
                  className="mt-2 h-11 bg-white/[0.06] border-white/[0.08] text-white placeholder:text-white/20 rounded-xl focus:bg-white/[0.08] focus:border-blue-500/50 focus:ring-blue-500/20 font-mono tracking-widest"
                  required
                />
                <p className="text-[11px] text-white/20 mt-1.5">Get this from your team admin</p>
              </div>

              {error && (
                <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-xl text-sm font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-200"
                style={{ background: 'linear-gradient(135deg, hsl(220, 70%, 55%), hsl(250, 60%, 50%))' }}
              >
                {loading ? <><Loader2 size={16} className="animate-spin mr-2" /> Creating account...</> : 'Join Team'}
              </Button>
            </form>
          )}
        </div>

        <p className="text-center text-[11px] text-white/15 mt-6 font-medium">
          Commercial Real Estate Intelligence Platform
        </p>
      </div>
    </div>
  );
}
