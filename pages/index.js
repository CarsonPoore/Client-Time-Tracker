import React, { useState, useEffect } from 'react';
import { ChevronDown, Plus, X, Download, AlertCircle, Check } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uzmbzvnswhhdtsmdbelg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_3vIOU3JXjXJIjpx-7GLRYA_2qmKCHCf';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function Home() {
  const [view, setView] = useState('dashboard');
  const [currentUser] = useState({ id: '1', name: 'Carson', role: 'owner' });
  const [isOwner] = useState(currentUser.role === 'owner');
  const [loading, setLoading] = useState(true);

  const [clients, setClients] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);
  const [flatProjects, setFlatProjects] = useState([]);
  const [invoices, setInvoices] = useState([]);

  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [formData, setFormData] = useState({
    clientId: '',
    employeeId: currentUser.id,
    startTime: '',
    endTime: '',
    workDescription: '',
  });

  // Load data from Supabase on mount
  useEffect(() => {
    const initializeAuth = async () => {
      // Sign in anonymously to get authenticated session (bypasses some RLS restrictions)
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) console.warn('Auth error (non-blocking):', error);
      await loadData();
    };
    initializeAuth();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Try to initialize RLS policies (will fail silently if already exist or not permitted)
      try {
        await supabase.rpc('setup_rls_policies');
      } catch (err) {
        // RLS setup failed, but continue anyway
        console.log('RLS setup not available, continuing...');
      }
      
      // Fetch clients
      const { data: clientsData, error: clientsError } = await supabase
        .from('clients')
        .select('*');
      if (!clientsError) setClients(clientsData || []);
      else console.error('Clients error:', clientsError);

      // Fetch time entries
      const { data: entriesData, error: entriesError } = await supabase
        .from('time_entries')
        .select('*');
      if (!entriesError) setTimeEntries(entriesData || []);
      else console.error('Time entries error:', entriesError);

      // Fetch flat projects
      const { data: projectsData, error: projectsError } = await supabase
        .from('flat_projects')
        .select('*');
      if (!projectsError) setFlatProjects(projectsData || []);
      else console.error('Projects error:', projectsError);

      // Fetch invoices
      const { data: invoicesData, error: invoicesError } = await supabase
        .from('invoices')
        .select('*');
      if (!invoicesError) setInvoices(invoicesData || []);
      else console.error('Invoices error:', invoicesError);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const calculateDashboard = () => {
    const currentMonth = selectedMonth;
    const thisMonthEntries = timeEntries.filter(e => {
      const entryDate = new Date(e.start_time).toISOString().slice(0, 7);
      return entryDate === currentMonth;
    });
    
    const totalHours = thisMonthEntries.reduce((sum, e) => {
      const start = new Date(e.start_time);
      const end = new Date(e.end_time);
      return sum + (end - start) / (1000 * 60 * 60);
    }, 0);

    const previousMonth = getPreviousMonth(currentMonth);
    const invoicedLastMonth = invoices
      .filter(i => i.month === previousMonth)
      .reduce((sum, i) => sum + (i.total_amount || 0), 0);

    const overBudgetClients = clients.filter(c => {
      const clientHours = thisMonthEntries
        .filter(e => e.client_id === c.id)
        .reduce((sum, e) => {
          const start = new Date(e.start_time);
          const end = new Date(e.end_time);
          return sum + (end - start) / (1000 * 60 * 60);
        }, 0);
      const spent = clientHours * c.hourly_rate;
      return c.monthly_budget && spent > c.monthly_budget;
    });

    return { totalHours, invoicedLastMonth, overBudgetClients };
  };

  const getPreviousMonth = (month) => {
    const [year, m] = month.split('-');
    const prev = parseInt(m) - 1;
    if (prev === 0) return `${parseInt(year) - 1}-12`;
    return `${year}-${String(prev).padStart(2, '0')}`;
  };

  const handleAddClient = async (e) => {
    e.preventDefault();
    const formDataObj = new FormData(e.target);
    const name = formDataObj.get('clientName');
    const rate = parseFloat(formDataObj.get('hourlyRate'));
    const budget = parseFloat(formDataObj.get('monthlyBudget')) || null;

    if (!name || !rate) return;

    try {
      const { data, error } = await supabase
        .from('clients')
        .insert([{ name, hourly_rate: rate, monthly_budget: budget }])
        .select();

      if (!error && data) {
        setClients([...clients, ...data]);
        e.target.reset();
      } else {
        console.error('Error adding client:', error);
      }
    } catch (err) {
      console.error('Error adding client:', err);
    }
  };

  const handleTimeEntry = async (e) => {
    e.preventDefault();
    if (!formData.clientId || !formData.startTime || !formData.endTime) return;

    const start = new Date(formData.startTime);
    const end = new Date(formData.endTime);

    try {
      const { data, error } = await supabase
        .from('time_entries')
        .insert([{
          client_id: formData.clientId,
          employee_id: formData.employeeId,
          start_time: formData.startTime,
          end_time: formData.endTime,
          work_description: formData.workDescription,
        }])
        .select();

      if (!error && data) {
        setTimeEntries([...timeEntries, ...data]);
        setFormData({ ...formData, startTime: '', endTime: '', workDescription: '' });
      } else {
        console.error('Error adding time entry:', error);
      }
    } catch (err) {
      console.error('Error adding time entry:', err);
    }
  };

  const handleAddProject = async (e) => {
    e.preventDefault();
    const formDataObj = new FormData(e.target);
    const clientId = formDataObj.get('projectClient');
    const projectName = formDataObj.get('projectName');
    const flatRate = parseFloat(formDataObj.get('flatRate'));

    if (!clientId || !projectName || !flatRate) return;

    try {
      const { data, error } = await supabase
        .from('flat_projects')
        .insert([{
          client_id: clientId,
          project_name: projectName,
          flat_rate: flatRate,
          status: 'quoted',
        }])
        .select();

      if (!error && data) {
        setFlatProjects([...flatProjects, ...data]);
        e.target.reset();
      } else {
        console.error('Error adding project:', error);
      }
    } catch (err) {
      console.error('Error adding project:', err);
    }
  };

  const updateProjectStatus = async (projectId, newStatus) => {
    try {
      const { error } = await supabase
        .from('flat_projects')
        .update({ status: newStatus })
        .eq('id', projectId);

      if (!error) {
        setFlatProjects(flatProjects.map(p => 
          p.id === projectId ? { ...p, status: newStatus } : p
        ));
      }
    } catch (err) {
      console.error('Error updating project:', err);
    }
  };

  const handleCreateInvoice = async (e) => {
    e.preventDefault();
    const month = selectedMonth;
    
    try {
      const monthInvoices = [];
      for (const client of clients) {
        const entries = timeEntries.filter(ent => {
          const entryMonth = new Date(ent.start_time).toISOString().slice(0, 7);
          return entryMonth === month && ent.client_id === client.id;
        });

        const totalHours = entries.reduce((sum, ent) => {
          const start = new Date(ent.start_time);
          const end = new Date(ent.end_time);
          return sum + (end - start) / (1000 * 60 * 60);
        }, 0);

        const totalAmount = totalHours * client.hourly_rate;

        if (totalHours > 0) {
          monthInvoices.push({
            client_id: client.id,
            month,
            total_hours: totalHours,
            total_amount: totalAmount,
            status: 'outstanding',
          });
        }
      }

      if (monthInvoices.length > 0) {
        const { data, error } = await supabase
          .from('invoices')
          .insert(monthInvoices)
          .select();

        if (!error && data) {
          setInvoices([...invoices, ...data]);
        } else {
          console.error('Error creating invoices:', error);
        }
      }
    } catch (err) {
      console.error('Error creating invoices:', err);
    }
  };

  const updateInvoiceStatus = async (invoiceId, newStatus) => {
    try {
      const { error } = await supabase
        .from('invoices')
        .update({ status: newStatus })
        .eq('id', invoiceId);

      if (!error) {
        setInvoices(invoices.map(inv =>
          inv.id === invoiceId ? { ...inv, status: newStatus } : inv
        ));
      }
    } catch (err) {
      console.error('Error updating invoice:', err);
    }
  };

  const exportPDF = (clientId) => {
    const client = clients.find(c => c.id === clientId);
    const entries = timeEntries.filter(e => {
      const entryMonth = new Date(e.start_time).toISOString().slice(0, 7);
      return entryMonth === selectedMonth && e.client_id === clientId;
    });
    
    const totalHours = entries.reduce((sum, e) => {
      const start = new Date(e.start_time);
      const end = new Date(e.end_time);
      return sum + (end - start) / (1000 * 60 * 60);
    }, 0);
    const totalValue = totalHours * client.hourly_rate;

    let pdf = `CLIENT REPORT: ${client.name}\nMonth: ${selectedMonth}\n\n`;
    pdf += `TIME BREAKDOWN:\n`;
    entries.forEach(e => {
      const start = new Date(e.start_time);
      const end = new Date(e.end_time);
      const hours = (end - start) / (1000 * 60 * 60);
      pdf += `${start.toLocaleDateString()} | ${start.toLocaleTimeString()} - ${end.toLocaleTimeString()} | ${hours.toFixed(2)}h | ${e.work_description}\n`;
    });
    pdf += `\nTOTAL HOURS: ${totalHours.toFixed(2)}\nTOTAL VALUE: $${totalValue.toFixed(2)}`;

    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(pdf));
    element.setAttribute('download', `${client.name.replace(/\s/g, '_')}_${selectedMonth}.txt`);
    element.click();
  };

  const { totalHours, invoicedLastMonth, overBudgetClients } = calculateDashboard();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Agency Tracker</h1>
            <p className="text-sm text-slate-400">{currentUser.name} • {selectedMonth}</p>
          </div>
          <nav className="flex gap-2">
            {['dashboard', 'time-entry', 'clients', 'projects', 'invoices'].map(tab => (
              <button
                key={tab}
                onClick={() => setView(tab)}
                className={`px-4 py-2 rounded font-medium transition ${
                  view === tab
                    ? 'bg-yellow-400 text-slate-900'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* DASHBOARD */}
        {view === 'dashboard' && (
          <div>
            <div className="grid grid-cols-4 gap-4 mb-8">
              <div className="bg-slate-800 p-6 rounded-lg">
                <p className="text-sm text-slate-400">Hours Logged This Month</p>
                <p className="text-4xl font-bold">{totalHours.toFixed(1)}</p>
              </div>
              <div className="bg-slate-800 p-6 rounded-lg">
                <p className="text-sm text-slate-400">Invoiced Last Month</p>
                <p className="text-4xl font-bold">${invoicedLastMonth.toFixed(2)}</p>
              </div>
              <div className="bg-slate-800 p-6 rounded-lg">
                <p className="text-sm text-slate-400">Clients Over Budget</p>
                <p className={`text-4xl font-bold ${overBudgetClients.length > 0 ? 'text-red-400' : ''}`}>
                  {overBudgetClients.length}
                </p>
              </div>
              <div className="bg-slate-800 p-6 rounded-lg">
                <p className="text-sm text-slate-400">Outstanding Revenue</p>
                <p className="text-4xl font-bold text-yellow-400">
                  ${invoices
                    .filter(i => i.status === 'outstanding')
                    .reduce((sum, i) => sum + (i.total_amount || 0), 0)
                    .toFixed(2)}
                </p>
              </div>
            </div>

            <div className="bg-slate-800 p-6 rounded-lg">
              <h2 className="text-xl font-bold mb-4">Outstanding Invoices</h2>
              <div className="space-y-3">
                {invoices
                  .filter(i => i.status === 'outstanding')
                  .map(inv => {
                    const client = clients.find(c => c.id === inv.client_id);
                    return (
                      <div key={inv.id} className="flex justify-between items-center bg-slate-700 p-4 rounded">
                        <div>
                          <p className="font-medium">{client?.name}</p>
                          <p className="text-sm text-slate-400">{inv.month}</p>
                        </div>
                        <p className="text-lg font-bold">${inv.total_amount?.toFixed(2) || '0.00'}</p>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {/* TIME ENTRY */}
        {view === 'time-entry' && (
          <div className="bg-slate-800 p-6 rounded-lg">
            <h2 className="text-xl font-bold mb-4">Log Time</h2>
            <form onSubmit={handleTimeEntry} className="space-y-4">
              <select
                value={formData.clientId}
                onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                className="w-full bg-slate-700 p-3 rounded text-white"
              >
                <option value="">Select Client</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input
                type="datetime-local"
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                className="w-full bg-slate-700 p-3 rounded text-white"
                placeholder="Start Time"
              />
              <input
                type="datetime-local"
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                className="w-full bg-slate-700 p-3 rounded text-white"
                placeholder="End Time"
              />
              <input
                type="text"
                value={formData.workDescription}
                onChange={(e) => setFormData({ ...formData, workDescription: e.target.value })}
                className="w-full bg-slate-700 p-3 rounded text-white"
                placeholder="Work Description"
              />
              <button
                type="submit"
                className="w-full bg-yellow-400 text-slate-900 p-3 rounded font-bold hover:bg-yellow-300"
              >
                Log Time
              </button>
            </form>

            <div className="mt-8">
              <h3 className="font-bold mb-4">Today's Entries</h3>
              <div className="space-y-2">
                {timeEntries
                  .filter(e => new Date(e.start_time).toDateString() === new Date().toDateString())
                  .map(e => {
                    const client = clients.find(c => c.id === e.client_id);
                    const start = new Date(e.start_time);
                    const end = new Date(e.end_time);
                    const hours = (end - start) / (1000 * 60 * 60);
                    return (
                      <div key={e.id} className="bg-slate-700 p-4 rounded">
                        <p className="font-medium">{client?.name}</p>
                        <p className="text-sm text-slate-400">{e.work_description}</p>
                        <p className="text-sm">{hours.toFixed(2)}h</p>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {/* CLIENTS */}
        {view === 'clients' && (
          <div>
            {isOwner && (
              <div className="bg-slate-800 p-6 rounded-lg mb-8">
                <h2 className="text-xl font-bold mb-4">Add Client</h2>
                <form onSubmit={handleAddClient} className="space-y-4">
                  <input
                    type="text"
                    name="clientName"
                    placeholder="Client name"
                    className="w-full bg-slate-700 p-3 rounded text-white"
                    required
                  />
                  <input
                    type="number"
                    name="hourlyRate"
                    placeholder="Hourly rate ($)"
                    className="w-full bg-slate-700 p-3 rounded text-white"
                    step="0.01"
                    required
                  />
                  <input
                    type="number"
                    name="monthlyBudget"
                    placeholder="Monthly budget ($)"
                    className="w-full bg-slate-700 p-3 rounded text-white"
                    step="0.01"
                  />
                  <button
                    type="submit"
                    className="w-full bg-yellow-400 text-slate-900 p-3 rounded font-bold hover:bg-yellow-300"
                  >
                    Add Client
                  </button>
                </form>
              </div>
            )}

            <div className="space-y-4">
              {clients.map(client => {
                const monthEntries = timeEntries.filter(e => {
                  const entryMonth = new Date(e.start_time).toISOString().slice(0, 7);
                  return entryMonth === selectedMonth && e.client_id === client.id;
                });
                const hours = monthEntries.reduce((sum, e) => {
                  const start = new Date(e.start_time);
                  const end = new Date(e.end_time);
                  return sum + (end - start) / (1000 * 60 * 60);
                }, 0);
                const spent = hours * client.hourly_rate;
                const overBudget = client.monthly_budget && spent > client.monthly_budget;

                return (
                  <div key={client.id} className={`p-6 rounded-lg ${overBudget ? 'bg-red-900 border border-red-700' : 'bg-slate-800'}`}>
                    <h3 className="text-xl font-bold">{client.name}</h3>
                    <p className="text-sm text-slate-400">${client.hourly_rate}/hr</p>
                    <div className="grid grid-cols-3 gap-4 mt-4">
                      <div>
                        <p className="text-sm text-slate-400">Hours This Month</p>
                        <p className="text-lg font-bold">{hours.toFixed(1)}h</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-400">Value</p>
                        <p className="text-lg font-bold">${spent.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-400">Budget</p>
                        <p className="text-lg font-bold">${client.monthly_budget?.toFixed(2) || '—'}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* FLAT PROJECTS */}
        {view === 'projects' && (
          <div>
            <div className="bg-slate-800 p-6 rounded-lg mb-8">
              <h2 className="text-xl font-bold mb-4">Add Flat Project</h2>
              <form onSubmit={handleAddProject} className="space-y-4">
                <select
                  name="projectClient"
                  className="w-full bg-slate-700 p-3 rounded text-white"
                  required
                >
                  <option value="">Select client...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input
                  type="text"
                  name="projectName"
                  placeholder="Project name"
                  className="w-full bg-slate-700 p-3 rounded text-white"
                  required
                />
                <input
                  type="number"
                  name="flatRate"
                  placeholder="Flat rate ($)"
                  className="w-full bg-slate-700 p-3 rounded text-white"
                  step="0.01"
                  required
                />
                <button
                  type="submit"
                  className="w-full bg-yellow-400 text-slate-900 p-3 rounded font-bold hover:bg-yellow-300"
                >
                  Add Project
                </button>
              </form>
            </div>

            <div className="space-y-4">
              {flatProjects.map(project => {
                const client = clients.find(c => c.id === project.client_id);
                return (
                  <div key={project.id} className="bg-slate-800 p-6 rounded-lg">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-bold">{project.project_name}</h3>
                        <p className="text-sm text-slate-400">{client?.name}</p>
                        <p className="text-lg font-bold mt-2">${project.flat_rate}</p>
                      </div>
                      <select
                        value={project.status}
                        onChange={(e) => updateProjectStatus(project.id, e.target.value)}
                        className="bg-slate-700 p-2 rounded text-white"
                      >
                        <option value="quoted">Quoted</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* INVOICES */}
        {view === 'invoices' && (
          <div>
            <div className="bg-slate-800 p-6 rounded-lg mb-8">
              <h2 className="text-xl font-bold mb-4">Create Invoice</h2>
              <form onSubmit={handleCreateInvoice} className="space-y-4">
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full bg-slate-700 p-3 rounded text-white"
                />
                <button
                  type="submit"
                  className="w-full bg-yellow-400 text-slate-900 p-3 rounded font-bold hover:bg-yellow-300"
                >
                  Create Invoices
                </button>
              </form>
            </div>

            <div className="space-y-4">
              {invoices
                .filter(inv => inv.month === selectedMonth)
                .map(invoice => {
                  const client = clients.find(c => c.id === invoice.client_id);
                  return (
                    <div key={invoice.id} className="bg-slate-800 p-6 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-lg font-bold">{client?.name}</h3>
                          <p className="text-sm text-slate-400">{invoice.month}</p>
                          <p className="mt-2">{invoice.total_hours?.toFixed(2) || '0'}h @ ${client?.hourly_rate || '0'}/hr</p>
                          <p className="text-xl font-bold mt-2">${invoice.total_amount?.toFixed(2) || '0.00'}</p>
                        </div>
                        <div className="flex gap-2">
                          <select
                            value={invoice.status}
                            onChange={(e) => updateInvoiceStatus(invoice.id, e.target.value)}
                            className="bg-slate-700 p-2 rounded text-white text-sm"
                          >
                            <option value="outstanding">Outstanding</option>
                            <option value="paid">Paid</option>
                            <option value="overdue">Overdue</option>
                          </select>
                          <button
                            onClick={() => exportPDF(invoice.client_id)}
                            className="bg-slate-700 p-2 rounded hover:bg-slate-600"
                          >
                            <Download size={20} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
