import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from './_app';

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState('login'); // login or signup
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Sign in with email and password
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      // Verify user profile exists
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('auth_id', data.user.id)
        .single();

      if (userError) {
        throw new Error('User profile not configured. Contact admin.');
      }

      router.push('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (!agencyName || !username) throw new Error('Agency name and username required');

      // 1. Create agency
      const { data: agencyData, error: agencyError } = await supabase
        .from('agencies')
        .insert([{ name: agencyName }])
        .select()
        .single();

      if (agencyError) throw agencyError;

      // 2. Sign up auth user
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;

      // 3. Create user profile
      const { error: profileError } = await supabase
        .from('users')
        .insert([
          {
            auth_id: data.user?.id,
            email,
            username,
            agency_id: agencyData.id,
            role: 'admin',
          },
        ]);

      if (profileError) throw profileError;

      setSuccess('✅ Account created! Check your email to confirm, then sign in.');
      setEmail('');
      setUsername('');
      setPassword('');
      setAgencyName('');
      setTimeout(() => setMode('login'), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-8">
          <h1 className="text-3xl font-bold mb-2 text-center">Agency Tracker</h1>
          <p className="text-slate-400 text-center mb-8">
            {mode === 'login' ? 'Sign in to continue' : 'Create your agency'}
          </p>

          {error && (
            <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded mb-6 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-900 border border-green-700 text-green-200 px-4 py-3 rounded mb-6 text-sm">
              {success}
            </div>
          )}

          <form onSubmit={mode === 'login' ? handleLogin : handleSignup} className="space-y-4">
            {mode === 'signup' && (
              <>
                <input
                  type="text"
                  placeholder="Agency Name"
                  value={agencyName}
                  onChange={(e) => setAgencyName(e.target.value)}
                  className="w-full bg-slate-800 text-white p-3 rounded border border-slate-700 focus:border-yellow-400 outline-none"
                  required
                />
                <input
                  type="text"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-800 text-white p-3 rounded border border-slate-700 focus:border-yellow-400 outline-none"
                  required
                />
              </>
            )}

            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-800 text-white p-3 rounded border border-slate-700 focus:border-yellow-400 outline-none"
              required
            />

            <input
              type="password"
              placeholder="Password (min 6 chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-800 text-white p-3 rounded border border-slate-700 focus:border-yellow-400 outline-none"
              required
              minLength={6}
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-yellow-400 text-slate-900 p-3 rounded font-bold hover:bg-yellow-300 disabled:opacity-50"
            >
              {loading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Create Agency'}
            </button>
          </form>

          <div className="mt-6 text-center text-slate-400">
            {mode === 'login' ? (
              <>
                No account?{' '}
                <button
                  onClick={() => {
                    setMode('signup');
                    setError('');
                  }}
                  className="text-yellow-400 hover:underline"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  onClick={() => {
                    setMode('login');
                    setError('');
                  }}
                  className="text-yellow-400 hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
