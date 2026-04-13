import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { LogOut, Users, Lock } from 'lucide-react';
import { getSupabaseClient } from './_app';

const useLocalStorage = (key, initialValue) => {
  const [storedValue, setStoredValue] = useState(initialValue);
  useEffect(() => {
    try {
      const item = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
      if (item) setStoredValue(JSON.parse(item));
    } catch (error) {
      console.warn('localStorage read error:', error);
    }
  }, [key]);

  const setValue = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.warn('localStorage write error:', error);
    }
  };
  return [storedValue, setValue];
};

export default function Dashboard() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [agencyUsers, setAgencyUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  const [newUserForm, setNewUserForm] = useState({
    email: '',
    username: '',
    password: '',
    role: 'viewer',
  });

  const [clients, setClients] = useLocalStorage('clients', []);

  useEffect(() => {
    const initUser = async () => {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) {
          setError('Supabase not configured');
          setLoading(false);
          return;
        }

        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
          router.push('/login');
          return;
        }

        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('*, agencies(name)')
          .eq('auth_id', session.user.id)
          .single();

        if (userError) {
          setError('Failed to load user profile');
          return;
        }

        setCurrentUser(userData);

        if (userData.role === 'admin') {
          const { data: users } = await supabase
            .from('users')
            .select('*')
            .eq('agency_id', userData.agency_id);
          setAgencyUsers(users || []);
        }

        const { data: clientsData } = await supabase
          .from('clients')
          .select('*')
          .eq('agency_id', userData.agency_id);
        if (clientsData) setClients(clientsData);

        setLoading(false);
      } catch (err) {
        console.error('Init error:', err);
        router.push('/login');
      }
    };

    initUser();
  }, [router]);

  const handleLogout = async () => {
    const supabase = getSupabaseClient();
    if (supabase) await supabase.auth.signOut();
    localStorage.clear();
    router.push('/login');
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!newUserForm.email || !newUserForm.username || !newUserForm.password) {
      setError('All fields required');
      return;
    }

    try {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('Supabase not initialized');

      const { data, error: signupError } = await supabase.auth.signUp({
        email: newUserForm.email,
        password: newUserForm.password,
      });

      if (signupError) throw signupError;

      const { error: profileError } = await supabase
        .from('users')
        .insert([
          {
            auth_id: data.user?.id,
            email: newUserForm.email,
            username: newUserForm.username,
            agency_id: currentUser.agency_id,
            role: newUserForm.role,
          },
        ]);

      if (profileError) throw profileError;

      const { data: users } = await supabase
        .from('users')
        .select('*')
        .eq('agency_id', currentUser.agency_id);
      setAgencyUsers(users || []);

      setNewUserForm({ email: '', username: '', password: '', role: 'viewer' });
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddClient = async (e) => {
    e.preventDefault();
    if (currentUser.role === 'viewer') {
      setError('Viewers cannot add clients');
      return;
    }

    const formDataObj = new FormData(e.target);
    const name = formDataObj.get('clientName');
    const rate = parseFloat(formDataObj.get('hourlyRate'));

    if (!name || !rate) {
      setError('Client name and rate required');
      return;
    }

    try {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('Supabase not initialized');

      const newClient = {
        agency_id: currentUser.agency_id,
        name,
        hourly_rate: rate,
        monthly_budget: parseFloat(formDataObj.get('monthlyBudget')) || null,
        created_at: new Date().toISOString(),
      };

      const { error: insertError } = await supabase
        .from('clients')
        .insert([newClient]);

      if (insertError) console.warn('Insert failed:', insertError);

      setClients([...clients, { ...newClient, id: Date.now().toString() }]);
      e.target.reset();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  const isAdmin = currentUser.role === 'admin';
  const canEdit = currentUser.role !== 'viewer';
  const agencyName = currentUser.agencies?.name || 'Agency';

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans">
      <header className="border-b border-slate-800 bg-slate-900 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Agency Tracker</h1>
            <p className="text-sm text-slate-400">
              {currentUser.username} • {agencyName} •{' '}
              <span className={`font-semibold ${currentUser.role === 'admin' ? 'text-yellow-400' : currentUser.role === 'manager' ? 'text-blue-400' : 'text-slate-400'}`}>
                {currentUser.role.toUpperCase()}
              </span>
            </p>
          </div>
          <div className="flex gap-3 items-center">
            {isAdmin && (
              <button
                onClick={() => setShowAdminPanel(!showAdminPanel)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm flex items-center gap-2"
              >
                <Users size={18} /> Admin
              </button>
            )}
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 flex items-center gap-2"
            >
              <LogOut size={18} /> Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {error && (
          <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {showAdminPanel && isAdmin && (
          <div className="bg-blue-900 border border-blue-700 p-6 rounded-lg mb-8">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Lock size={20} /> Admin Panel
            </h2>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-blue-800 p-4 rounded-lg">
                <h3 className="font-bold mb-4">Add User</h3>
                <form onSubmit={handleAddUser} className="space-y-3">
                  <input
                    type="email"
                    placeholder="Email"
                    value={newUserForm.email}
                    onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                    className="w-full bg-blue-700 p-2 rounded text-white text-sm"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Username"
                    value={newUserForm.username}
                    onChange={(e) => setNewUserForm({ ...newUserForm, username: e.target.value })}
                    className="w-full bg-blue-700 p-2 rounded text-white text-sm"
                    required
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={newUserForm.password}
                    onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                    className="w-full bg-blue-700 p-2 rounded text-white text-sm"
                    required
                  />
                  <select
                    value={newUserForm.role}
                    onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                    className="w-full bg-blue-700 p-2 rounded text-white text-sm"
                  >
                    <option value="viewer">Viewer (read-only)</option>
                    <option value="manager">Manager (edit)</option>
                    <option value="admin">Admin (full)</option>
                  </select>
                  <button
                    type="submit"
                    className="w-full bg-yellow-400 text-blue-900 p-2 rounded font-bold hover:bg-yellow-300 text-sm"
                  >
                    Create User
                  </button>
                </form>
              </div>

              <div>
                <h3 className="font-bold mb-4">Team Members</h3>
                <div className="space-y-2 bg-blue-800 p-4 rounded-lg max-h-64 overflow-y-auto">
                  {agencyUsers.map((user) => (
                    <div key={user.id} className="bg-blue-700 p-3 rounded flex justify-between text-sm">
                      <div>
                        <p className="font-medium">{user.username}</p>
                        <p className="text-blue-300">{user.email}</p>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        user.role === 'admin' ? 'bg-yellow-400 text-slate-900' :
                        user.role === 'manager' ? 'bg-blue-500' :
                        'bg-slate-600'
                      }`}>
                        {user.role}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-slate-800 p-6 rounded-lg">
          <h2 className="text-xl font-bold mb-4">Clients</h2>

          {canEdit && (
            <form onSubmit={handleAddClient} className="mb-6 space-y-3 bg-slate-700 p-4 rounded">
              <div className="grid grid-cols-3 gap-3">
                <input
                  type="text"
                  name="clientName"
                  placeholder="Client name"
                  className="bg-slate-600 p-2 rounded text-white"
                  required
                />
                <input
                  type="number"
                  name="hourlyRate"
                  placeholder="Hourly rate ($)"
                  step="0.01"
                  className="bg-slate-600 p-2 rounded text-white"
                  required
                />
                <input
                  type="number"
                  name="monthlyBudget"
                  placeholder="Monthly budget ($)"
                  step="0.01"
                  className="bg-slate-600 p-2 rounded text-white"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-yellow-400 text-slate-900 p-2 rounded font-bold hover:bg-yellow-300"
              >
                Add Client
              </button>
            </form>
          )}

          <div className="grid grid-cols-1 gap-3">
            {clients
              .filter((c) => c.agency_id === currentUser.agency_id)
              .map((client) => (
                <div key={client.id} className="bg-slate-700 p-4 rounded">
                  <h3 className="font-bold">{client.name}</h3>
                  <p className="text-sm text-slate-400">${client.hourly_rate}/hr</p>
                </div>
              ))}
            {clients.length === 0 && (
              <p className="text-slate-400 text-center py-8">No clients yet. {canEdit ? 'Add one above!' : 'Contact an admin.'}</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
