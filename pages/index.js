import React, { useState, useEffect } from 'react';
import { ChevronDown, Plus, X, Download, AlertCircle, Check } from 'lucide-react';

const SUPABASE_URL = 'https://uzmbzvnswhhdtsmdbelg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_3vIOU3JXjXJIjpx-7GLRYA_2qmKCHCf';

export default function Home() {
  const [view, setView] = useState('dashboard');
  const [currentUser] = useState({ id: '1', name: 'Carson', role: 'owner' });
  const [isOwner] = useState(currentUser.role === 'owner');

  const [clients, setClients] = useState([]);
  const [employees, setEmployees] = useState([]);
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

  const calculateDashboard = () => {
    const currentMonth = selectedMonth;
    const thisMonthEntries = timeEntries.filter(e => 
      e.date.startsWith(currentMonth)
    );
    
    const totalHours = thisMonthEntries.reduce((sum, e) => sum + e.duration, 0);
    const invoicedLastMonth = invoices.find(i => i.month === getPreviousMonth(currentMonth))?.total_amount || 0;
    const overBudgetClients = clients.filter(c => {
      const clientHours = thisMonthEntries
        .filter(e => e.client_id === c.id)
        .reduce((sum, e) => sum + e.duration, 0);
      return c.monthly_budget && (clientHours * c.hourly_rate) > c.monthly_budget;
    });

    return { totalHours, invoicedLastMonth, overBudgetClients };
  };

  const getPreviousMonth = (month) => {
    const [year, m] = month.split('-');
    const prev = parseInt(m) - 1;
    if (prev === 0) return `${parseInt(year) - 1}-12`;
    return `${year}-${String(prev).padStart(2, '0')}`;
  };

  const handleTimeEntry = async (e) => {
    e.preventDefault();
    if (!formData.clientId || !formData.startTime || !formData.endTime) return;

    const start = new Date(formData.startTime);
    const end = new Date(formData.endTime);
    const duration = (end - start) / (1000 * 60 * 60);

    const entry = {
      id: Math.random(),
      client_id: formData.clientId,
      employee_id: formData.employeeId,
      date: start.toISOString().split('T')[0],
      start_time: formData.startTime,
      end_time: formData.endTime,
      duration,
      work_description: formData.workDescription,
    };

    setTimeEntries([...timeEntries, entry]);
    setFormData({ ...formData, startTime: '', endTime: '', workDescription: '' });
  };

  const exportPDF = (clientId) => {
    const client = clients.find(c => c.id === clientId);
    const entries = timeEntries.filter(e => e.client_id === clientId && e.date.startsWith(selectedMonth));
    
    const totalHours = entries.reduce((sum, e) => sum + e.duration, 0);
    const totalValue = totalHours * client.hourly_rate;

    let pdf = `CLIENT REPORT: ${client.name}\nMonth: ${selectedMonth}\n\n`;
    pdf += `TIME BREAKDOWN:\n`;
    entries.forEach(e => {
      pdf += `${e.date} | ${e.start_time} - ${e.end_time} | ${e.duration.toFixed(2)}h | ${e.work_description}\n`;
    });
    pdf += `\nTOTAL HOURS: ${totalHours.toFixed(2)}\nTOTAL VALUE: $${totalValue.toFixed(2)}`;

    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(pdf));
    element.setAttribute('download', `${client.name.replace(/\s/g, '_')}_${selectedMonth}.txt`);
    element.click();
  };

  const { totalHours, invoicedLastMonth, overBudgetClients } = calculateDashboard();

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Agency Tracker</h1>
            <p className="text-slate-400 text-sm">Carson • {selectedMonth}</p>
          </div>
          <div className="flex gap-2">
            {['dashboard', 'time-entry', 'clients', 'flat-projects', 'invoices'].map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-4 py-2 rounded text-sm font-medium transition ${
                  view === v
                    ? 'bg-yellow-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {v.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* DASHBOARD */}
        {view === 'dashboard' && (
          <div className="space-y-8">
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <p className="text-slate-400 text-sm mb-2">Hours Logged This Month</p>
                <p className="text-4xl font-bold">{totalHours.toFixed(1)}</p>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <p className="text-slate-400 text-sm mb-2">Invoiced Last Month</p>
                <p className="text-4xl font-bold">${invoicedLastMonth.toFixed(0)}</p>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <p className="text-slate-400 text-sm mb-2">Clients Over Budget</p>
                <p className="text-4xl font-bold text-red-400">{overBudgetClients.length}</p>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <p className="text-slate-400 text-sm mb-2">Outstanding Revenue</p>
                <p className="text-4xl font-bold text-yellow-400">
                  ${invoices
                    .filter(i => i.status === 'outstanding' || i.status === 'overdue')
                    .reduce((sum, i) => sum + (i.total_amount || 0), 0)
                    .toFixed(0)}
                </p>
              </div>
            </div>

            {overBudgetClients.length > 0 && (
              <div className="bg-red-950 border border-red-800 rounded-lg p-4 flex gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-300">Clients Over Budget</p>
                  <p className="text-red-200 text-sm">{overBudgetClients.map(c => c.name).join(', ')}</p>
                </div>
              </div>
            )}

            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h3 className="font-bold text-lg mb-4">Outstanding Invoices</h3>
              <div className="space-y-3">
                {invoices.filter(i => i.status !== 'paid').map(inv => (
                  <div key={inv.id} className="flex justify-between items-center p-3 bg-slate-700 rounded">
                    <div>
                      <p className="font-medium">{clients.find(c => c.id === inv.client_id)?.name}</p>
                      <p className="text-sm text-slate-400">{inv.month}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">${inv.total_amount?.toFixed(0)}</p>
                      <p className={`text-xs ${inv.status === 'overdue' ? 'text-red-400' : 'text-yellow-400'}`}>
                        {inv.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TIME ENTRY */}
        {view === 'time-entry' && (
          <div className="max-w-2xl space-y-6">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h2 className="text-xl font-bold mb-6">Log Time</h2>
              <form onSubmit={handleTimeEntry} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Client</label>
                  <select
                    value={formData.clientId}
                    onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
                  >
                    <option value="">Select a client...</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Start Time</label>
                    <input
                      type="datetime-local"
                      value={formData.startTime}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                      className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">End Time</label>
                    <input
                      type="datetime-local"
                      value={formData.endTime}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                      className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">What Work Was Done?</label>
                  <textarea
                    value={formData.workDescription}
                    onChange={(e) => setFormData({ ...formData, workDescription: e.target.value })}
                    placeholder="E.g., Homepage design iteration, email campaign setup..."
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white h-20"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-yellow-500 text-slate-950 font-bold py-3 rounded hover:bg-yellow-400 transition"
                >
                  Log Time
                </button>
              </form>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h3 className="font-bold mb-4">Today's Entries</h3>
              <div className="space-y-2">
                {timeEntries
                  .filter(e => e.date === new Date().toISOString().split('T')[0])
                  .map(e => (
                    <div key={e.id} className="p-3 bg-slate-700 rounded text-sm">
                      <p className="font-medium">{clients.find(c => c.id === e.client_id)?.name}</p>
                      <p className="text-slate-400">{e.duration.toFixed(2)}h • {e.work_description}</p>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* CLIENTS */}
        {view === 'clients' && (
          <div className="space-y-6">
            {isOwner && (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <h2 className="text-xl font-bold mb-4">Add Client</h2>
                <form className="space-y-4" onSubmit={(e) => {
                  e.preventDefault();
                  const name = e.target.clientName.value;
                  const rate = e.target.hourlyRate.value;
                  const budget = e.target.monthlyBudget.value;
                  setClients([...clients, { id: Math.random(), name, hourly_rate: rate, monthly_budget: budget }]);
                  e.target.reset();
                }}>
                  <input
                    name="clientName"
                    placeholder="Client name"
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
                  />
                  <input
                    name="hourlyRate"
                    type="number"
                    placeholder="Hourly rate ($)"
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
                  />
                  <input
                    name="monthlyBudget"
                    type="number"
                    placeholder="Monthly budget ($)"
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
                  />
                  <button type="submit" className="w-full bg-yellow-500 text-slate-950 font-bold py-2 rounded">
                    Add Client
                  </button>
                </form>
              </div>
            )}

            <div className="grid gap-4">
              {clients.map(client => {
                const thisMonthHours = timeEntries
                  .filter(e => e.client_id === client.id && e.date.startsWith(selectedMonth))
                  .reduce((sum, e) => sum + e.duration, 0);
                const value = thisMonthHours * client.hourly_rate;
                const over = client.monthly_budget && value > client.monthly_budget;

                return (
                  <div key={client.id} className={`border rounded-lg p-6 ${over ? 'bg-red-950 border-red-800' : 'bg-slate-800 border-slate-700'}`}>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-bold text-lg">{client.name}</h3>
                        <p className="text-sm text-slate-400">${client.hourly_rate}/hr</p>
                      </div>
                      {over && <AlertCircle className="w-5 h-5 text-red-400" />}
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-slate-400">Hours This Month</p>
                        <p className="font-bold">{thisMonthHours.toFixed(1)}h</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Value</p>
                        <p className="font-bold">${value.toFixed(0)}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Budget</p>
                        <p className={`font-bold ${over ? 'text-red-300' : ''}`}>
                          ${client.monthly_budget || 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* FLAT PROJECTS */}
        {view === 'flat-projects' && (
          <div className="space-y-6">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h2 className="text-xl font-bold mb-4">Add Flat Project</h2>
              <form className="space-y-4" onSubmit={(e) => {
                e.preventDefault();
                setFlatProjects([...flatProjects, {
                  id: Math.random(),
                  client_id: e.target.clientId.value,
                  project_name: e.target.projectName.value,
                  flat_rate: e.target.flatRate.value,
                  status: 'quoted'
                }]);
                e.target.reset();
              }}>
                <select name="clientId" className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white">
                  <option value="">Select client...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input name="projectName" placeholder="Project name" className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
                <input name="flatRate" type="number" placeholder="Flat rate ($)" className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
                <button type="submit" className="w-full bg-yellow-500 text-slate-950 font-bold py-2 rounded">Add Project</button>
              </form>
            </div>

            <div className="grid gap-4">
              {flatProjects.map(project => (
                <div key={project.id} className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-lg">{project.project_name}</h3>
                      <p className="text-sm text-slate-400">{clients.find(c => c.id === project.client_id)?.name}</p>
                    </div>
                    <select
                      value={project.status}
                      onChange={(e) => {
                        const updated = flatProjects.map(p => p.id === project.id ? { ...p, status: e.target.value } : p);
                        setFlatProjects(updated);
                      }}
                      className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm"
                    >
                      <option value="quoted">Quoted</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                  <p className="font-bold text-xl">${project.flat_rate}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* INVOICES */}
        {view === 'invoices' && (
          <div className="space-y-6">
            <div className="flex gap-4">
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
              />
            </div>

            <div className="grid gap-4">
              {clients.map(client => {
                const monthEntries = timeEntries.filter(e => e.client_id === client.id && e.date.startsWith(selectedMonth));
                const totalHours = monthEntries.reduce((sum, e) => sum + e.duration, 0);
                const totalAmount = totalHours * client.hourly_rate;
                const invoice = invoices.find(i => i.client_id === client.id && i.month === selectedMonth);

                return (
                  <div key={client.id} className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-bold text-lg">{client.name}</h3>
                        <p className="text-sm text-slate-400">{selectedMonth}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => exportPDF(client.id)}
                          className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded text-sm"
                        >
                          <Download className="w-4 h-4" /> Export
                        </button>
                        {isOwner && invoice && (
                          <select
                            value={invoice.status}
                            onChange={(e) => {
                              const updated = invoices.map(i => i.id === invoice.id ? { ...i, status: e.target.value } : i);
                              setInvoices(updated);
                            }}
                            className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm"
                          >
                            <option value="outstanding">Outstanding</option>
                            <option value="overdue">Overdue</option>
                            <option value="paid">Paid</option>
                          </select>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div>
                        <p className="text-slate-400 text-sm">Hours</p>
                        <p className="font-bold">{totalHours.toFixed(1)}h</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-sm">Rate</p>
                        <p className="font-bold">${client.hourly_rate}/hr</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-sm">Total</p>
                        <p className="font-bold text-yellow-400">${totalAmount.toFixed(0)}</p>
                      </div>
                    </div>

                    {totalAmount === 0 ? (
                      <p className="text-slate-400 text-sm italic">No time logged this month</p>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-400">Work completed:</p>
                        {monthEntries.map(e => (
                          <div key={e.id} className="bg-slate-700 p-2 rounded text-sm">
                            <p className="font-medium">{e.work_description}</p>
                            <p className="text-slate-400 text-xs">{e.date} • {e.duration.toFixed(2)}h</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {isOwner && !invoice && totalAmount > 0 && (
                      <button
                        onClick={() => {
                          setInvoices([...invoices, {
                            id: Math.random(),
                            client_id: client.id,
                            month: selectedMonth,
                            total_hours: totalHours,
                            total_amount: totalAmount,
                            status: 'outstanding'
                          }]);
                        }}
                        className="mt-4 w-full bg-yellow-500 text-slate-950 font-bold py-2 rounded hover:bg-yellow-400"
                      >
                        Create Invoice
                      </button>
                    )}
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
