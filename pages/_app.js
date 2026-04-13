import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase only when needed (client-side)
let supabaseInstance = null;

export const getSupabaseClient = () => {
  if (typeof window === 'undefined') return null;
  
  if (!supabaseInstance) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (url && key) {
      supabaseInstance = createClient(url, key);
    }
  }
  
  return supabaseInstance;
};

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = getSupabaseClient();
        
        if (!supabase) {
          setError('Supabase not configured. Contact admin.');
          setIsLoading(false);
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        
        if (!session && router.pathname !== '/login') {
          router.push('/login');
        }
        setIsLoading(false);
      } catch (err) {
        console.error('Auth init error:', err);
        setError(err.message);
        setIsLoading(false);
      }
    };

    checkAuth();

    // Listen for auth changes
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        setSession(session);
        if (!session && router.pathname !== '/login') {
          router.push('/login');
        }
      });

      return () => subscription?.unsubscribe();
    }
  }, [router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="bg-red-900 border border-red-700 p-6 rounded-lg max-w-md">
          <h1 className="text-2xl font-bold mb-4">Configuration Error</h1>
          <p className="text-red-200 mb-4">{error}</p>
          <p className="text-red-300 text-sm">Check that NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in Vercel.</p>
        </div>
      </div>
    );
  }

  return <Component {...pageProps} session={session} />;
}
