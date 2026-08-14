import { useEffect, useState } from 'react';
import { supabase, WeatherRisk, Task, Project } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import Modal from '../Modal';
import { Plus, Edit2, Cloud, CloudRain, Wind, Thermometer, Zap, RefreshCw } from 'lucide-react';

const RISK_TYPES = ['Rain', 'Thunderstorm', 'High Wind', 'Freezing Temperature', 'Extreme Heat', 'Heavy Rain', 'Snow', 'Hail', 'Fog', 'Other'];
const RISK_LEVELS = ['Low', 'Medium', 'High'];

const levelColors: Record<string, string> = {
  Low: 'text-site-700 bg-site-100',
  Medium: 'text-amber-700 bg-amber-100',
  High: 'text-hazard-700 bg-hazard-100',
};

interface WeatherForecast {
  date: string; maxTemp: number; minTemp: number; maxWind: number;
  precipitationProbability: number; precipitationSum: number;
  weatherCode: number; riskLevel: string; riskTypes: string[];
}

function calcWeatherRisk(f: WeatherForecast): { level: string; types: string[] } {
  const types: string[] = [];
  if (f.weatherCode >= 95) types.push('Thunderstorm');
  if (f.precipitationProbability >= 50) types.push('Rain');
  if (f.precipitationSum >= 0.25) types.push('Heavy Rain');
  if (f.maxWind >= 20) types.push('High Wind');
  if (f.minTemp <= 32) types.push('Freezing Temperature');
  if (f.maxTemp >= 95) types.push('Extreme Heat');
  const level = types.includes('Thunderstorm') || types.includes('Heavy Rain') || types.includes('Freezing Temperature') ? 'High' : types.length > 0 ? 'Medium' : 'Low';
  return { level, types };
}

const WeatherIcon = ({ type }: { type: string }) => {
  if (type.includes('Thunder')) return <Zap className="w-4 h-4 text-hazard-500" />;
  if (type.includes('Rain') || type.includes('Snow')) return <CloudRain className="w-4 h-4 text-steel-500" />;
  if (type.includes('Wind')) return <Wind className="w-4 h-4 text-amber-500" />;
  if (type.includes('Temp') || type.includes('Heat')) return <Thermometer className="w-4 h-4 text-amber-500" />;
  return <Cloud className="w-4 h-4 text-concrete-400" />;
};

export default function WeatherRisksTab({ project }: { project: Project }) {
  const { profile } = useAuth();
  const [risks, setRisks] = useState<WeatherRisk[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editRisk, setEditRisk] = useState<WeatherRisk | null>(null);
  const [form, setForm] = useState({ risk_date: new Date().toISOString().split('T')[0], risk_type: 'Rain', risk_level: 'Medium', impacted_task_id: '', notes: '', delay_days: 0 });
  const [saving, setSaving] = useState(false);
  const [forecast, setForecast] = useState<WeatherForecast[]>([]);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState('');

  const canEdit = ['CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN', 'GENERAL_CONTRACTOR'].includes(profile?.role || '');

  useEffect(() => { load(); }, [project.id]);

  async function load() {
    setLoading(true);
    const [r, t] = await Promise.all([
      supabase.from('weather_risks').select('*').eq('project_id', project.id).order('risk_date', { ascending: false }),
      supabase.from('tasks').select('*').eq('project_id', project.id).order('task_name'),
    ]);
    setRisks(r.data || []);
    setTasks(t.data || []);
    setLoading(false);
  }

  async function checkWeather() {
    setForecastLoading(true);
    setForecastError('');
    try {
      const city = project.city || project.zip || 'New York';
      const geocodeRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
      const geocodeData = await geocodeRes.json();
      if (!geocodeData.results || geocodeData.results.length === 0) {
        setForecastError(`Could not find location: ${city}`);
        setForecastLoading(false);
        return;
      }
      const { latitude, longitude } = geocodeData.results[0];
      const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,windspeed_10m_max,weathercode&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=7`);
      const weatherData = await weatherRes.json();
      const daily = weatherData.daily;
      const days: WeatherForecast[] = daily.time.map((date: string, i: number) => {
        const raw: WeatherForecast = { date, maxTemp: daily.temperature_2m_max[i], minTemp: daily.temperature_2m_min[i], maxWind: daily.windspeed_10m_max[i], precipitationProbability: daily.precipitation_probability_max[i], precipitationSum: daily.precipitation_sum[i], weatherCode: daily.weathercode[i], riskLevel: 'Low', riskTypes: [] };
        const { level, types } = calcWeatherRisk(raw);
        return { ...raw, riskLevel: level, riskTypes: types };
      });
      setForecast(days);
    } catch {
      setForecastError('Unable to fetch weather. Check connection and try again.');
    }
    setForecastLoading(false);
  }

  function openEdit(r: WeatherRisk) {
    setEditRisk(r);
    setForm({ risk_date: r.risk_date, risk_type: r.risk_type, risk_level: r.risk_level, impacted_task_id: r.impacted_task_id || '', notes: r.notes, delay_days: r.delay_days });
    setShowModal(true);
  }

  async function save() {
    setSaving(true);
    const alertStatus = form.risk_level === 'High' ? 'red' : form.risk_level === 'Medium' ? 'yellow' : 'green';
    const payload = { project_id: project.id, ...form, impacted_task_id: form.impacted_task_id || null, alert_status: alertStatus };
    if (editRisk) { await supabase.from('weather_risks').update(payload).eq('id', editRisk.id); }
    else { await supabase.from('weather_risks').insert(payload); }
    setSaving(false);
    setShowModal(false);
    load();
  }

  async function addForecastAsRisk(day: WeatherForecast) {
    if (!canEdit) return;
    await supabase.from('weather_risks').insert({ project_id: project.id, risk_date: day.date, risk_type: day.riskTypes[0] || 'Other', risk_level: day.riskLevel, notes: `Forecast: ${day.riskTypes.join(', ')}. Max ${day.maxTemp}°F, Wind ${day.maxWind}mph, Precip ${day.precipitationProbability}%`, delay_days: day.riskLevel === 'High' ? 1 : 0, alert_status: day.riskLevel === 'High' ? 'red' : day.riskLevel === 'Medium' ? 'yellow' : 'green' });
    load();
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-concrete-700">7-Day Weather Forecast</h3>
          <button onClick={checkWeather} disabled={forecastLoading} className="btn-secondary text-xs">
            <RefreshCw className={`w-3.5 h-3.5 ${forecastLoading ? 'animate-spin' : ''}`} />
            {forecastLoading ? 'Checking...' : 'Check Weather Now'}
          </button>
        </div>
        {forecastError && <div className="bg-hazard-50 border border-hazard-200 text-hazard-700 text-xs px-3 py-2 rounded-lg mb-3">{forecastError}</div>}
        {forecast.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {forecast.map(day => (
              <div key={day.date} className={`rounded-xl p-3 border text-center ${day.riskLevel === 'High' ? 'bg-hazard-50 border-hazard-200' : day.riskLevel === 'Medium' ? 'bg-amber-50 border-amber-200' : 'bg-concrete-50 border-concrete-200'}`}>
                <p className="text-xs font-semibold text-concrete-700 mb-1">{new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                <div className="flex justify-center mb-1"><WeatherIcon type={day.riskTypes[0] || ''} /></div>
                <p className="text-xs text-concrete-600">{Math.round(day.maxTemp)}° / {Math.round(day.minTemp)}°</p>
                {day.precipitationProbability > 0 && <p className="text-xs text-steel-600">{day.precipitationProbability}% rain</p>}
                {day.maxWind > 0 && <p className="text-xs text-concrete-500">{Math.round(day.maxWind)} mph</p>}
                <span className={`inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${levelColors[day.riskLevel]}`}>{day.riskLevel}</span>
                {canEdit && day.riskLevel !== 'Low' && <button onClick={() => addForecastAsRisk(day)} className="block w-full mt-2 text-[10px] text-steel-600 hover:text-steel-800 underline">+ Log Risk</button>}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-concrete-50 border border-concrete-200 rounded-xl p-4 text-center">
            <Cloud className="w-8 h-8 mx-auto mb-2 text-concrete-300" />
            <p className="text-sm text-concrete-500">Click <strong>Check Weather Now</strong> to fetch forecast for <strong>{project.city}, {project.state}</strong></p>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-concrete-700">Logged Weather Risks ({risks.length})</h3>
          {canEdit && (
            <button onClick={() => { setEditRisk(null); setForm({ risk_date: new Date().toISOString().split('T')[0], risk_type: 'Rain', risk_level: 'Medium', impacted_task_id: '', notes: '', delay_days: 0 }); setShowModal(true); }} className="btn-primary">
              <Plus className="w-4 h-4" /> Log Risk
            </button>
          )}
        </div>
        {loading ? <div className="text-center py-8 text-concrete-400 text-sm">Loading...</div> :
          risks.length === 0 ? <div className="text-center py-8 text-concrete-400 text-sm">No weather risks logged.</div> :
          <div className="space-y-2">
            {risks.map(r => {
              const impacted = tasks.find(t => t.id === r.impacted_task_id);
              return (
                <div key={r.id} className="card p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-concrete-900">{r.risk_type}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${levelColors[r.risk_level]}`}>{r.risk_level}</span>
                        <span className="text-xs text-concrete-400">{new Date(r.risk_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                      <div className="flex flex-wrap gap-4 mt-1 text-xs text-concrete-500">
                        {impacted && <span>Impacts: <strong className="text-concrete-700">{impacted.task_name}</strong></span>}
                        {r.delay_days > 0 && <span className="text-hazard-600">Delay: {r.delay_days}d</span>}
                      </div>
                      {r.notes && <p className="text-xs text-concrete-500 mt-1">{r.notes}</p>}
                    </div>
                    {canEdit && <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-concrete-100 text-concrete-400 hover:text-concrete-600 flex-shrink-0 ml-2"><Edit2 className="w-3.5 h-3.5" /></button>}
                  </div>
                </div>
              );
            })}
          </div>
        }
      </div>

      {showModal && (
        <Modal title={editRisk ? 'Edit Weather Risk' : 'Log Weather Risk'} onClose={() => setShowModal(false)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-sm">Risk Type</label>
                <select className="input-field" value={form.risk_type} onChange={e => setForm(f => ({ ...f, risk_type: e.target.value }))}>
                  {RISK_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label-sm">Risk Level</label>
                <select className="input-field" value={form.risk_level} onChange={e => setForm(f => ({ ...f, risk_level: e.target.value }))}>
                  {RISK_LEVELS.map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="label-sm">Date</label>
                <input type="date" className="input-field" value={form.risk_date} onChange={e => setForm(f => ({ ...f, risk_date: e.target.value }))} />
              </div>
              <div>
                <label className="label-sm">Impacted Task</label>
                <select className="input-field" value={form.impacted_task_id} onChange={e => setForm(f => ({ ...f, impacted_task_id: e.target.value }))}>
                  <option value="">None</option>
                  {tasks.map(t => <option key={t.id} value={t.id}>{t.task_name}</option>)}
                </select>
              </div>
              <div>
                <label className="label-sm">Delay Days</label>
                <input type="number" min="0" className="input-field" value={form.delay_days} onChange={e => setForm(f => ({ ...f, delay_days: +e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="label-sm">Notes</label>
              <textarea rows={2} className="input-field" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t border-concrete-100">
              <button onClick={() => setShowModal(false)} className="btn-ghost">Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">{saving ? 'Saving...' : editRisk ? 'Update' : 'Log Risk'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
