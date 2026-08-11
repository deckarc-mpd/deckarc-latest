import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { LayoutTemplate, Plus, CheckCircle, ChevronRight } from 'lucide-react';
import Modal from '../components/Modal';

interface Template {
  id: string;
  name: string;
  description: string;
  type: string;
  tasks: string[];
  permits: string[];
  inspections: string[];
  materials: string[];
  phaseItems: Record<string, string[]>;
}

const TEMPLATES: Template[] = [
  {
    id: 'bathroom-remodel',
    name: 'Bathroom Remodel',
    description: 'Full bathroom renovation including demo, plumbing, electrical, tile, and fixtures.',
    type: 'Bathroom Remodel',
    tasks: ['Demo & Remove Existing Fixtures', 'Rough Plumbing', 'Rough Electrical', 'Waterproofing', 'Tile Installation', 'Vanity & Fixture Install', 'Punch List & Touch-Up'],
    permits: ['Building Permit', 'Plumbing Permit', 'Electrical Permit'],
    inspections: ['Rough Plumbing Inspection', 'Rough Electrical Inspection', 'Final Inspection'],
    materials: ['Tile & Grout', 'Vanity & Sink', 'Toilet', 'Shower/Tub', 'Fixtures & Hardware', 'Waterproofing Membrane', 'Cement Board'],
    phaseItems: {
      'Demo Phase': ['Permit approved', 'Demo crew confirmed', 'Dumpster on site'],
      'Rough-In Phase': ['Plumbing subcontractor confirmed', 'Electrical subcontractor confirmed', 'Waterproofing materials ready'],
      'Finish Phase': ['Tile delivered', 'Vanity/fixtures delivered', 'Inspection passed'],
    },
  },
  {
    id: 'room-addition',
    name: 'Room Addition',
    description: 'New room addition with foundation, framing, roofing, insulation, and finish work.',
    type: 'Room Addition',
    tasks: ['Site Prep & Layout', 'Foundation / Footings', 'Framing', 'Roofing', 'Windows & Exterior', 'Rough Electrical & Plumbing', 'Insulation', 'Drywall', 'Paint & Finish', 'Punch List'],
    permits: ['Building Permit', 'Electrical Permit'],
    inspections: ['Footing Inspection', 'Framing Inspection', 'Rough-In Inspection', 'Insulation Inspection', 'Final Inspection'],
    materials: ['Lumber & Framing', 'Foundation Materials', 'Roofing Materials', 'Windows & Doors', 'Insulation', 'Drywall', 'Paint'],
    phaseItems: {
      'Foundation Phase': ['Permit approved', '811 completed', 'Site access ready', 'Footing crew confirmed'],
      'Framing Phase': ['Footing inspection passed', 'Lumber delivered', 'Framing crew confirmed'],
      'Final Phase': ['All rough inspections passed', 'Drywall complete', 'Punch list reviewed'],
    },
  },
  {
    id: 'living-room-extension',
    name: 'Living Room Extension',
    description: 'Extend an existing living space with new flooring, walls, and electrical.',
    type: 'Living Room Extension',
    tasks: ['Demo Existing Wall / Area', 'Structural Work', 'Rough Electrical', 'Insulation', 'Drywall', 'Flooring', 'Paint & Trim', 'Final Clean & Punch List'],
    permits: ['Building Permit', 'Electrical Permit'],
    inspections: ['Structural Inspection', 'Rough Electrical Inspection', 'Final Inspection'],
    materials: ['Lumber', 'Drywall', 'Insulation', 'Flooring', 'Paint & Trim'],
    phaseItems: {
      'Structural Phase': ['Permit approved', 'Structural plan confirmed', 'Crew confirmed'],
      'Finish Phase': ['Inspections passed', 'Materials delivered', 'Client decisions confirmed'],
    },
  },
  {
    id: 'deck-porch',
    name: 'Deck / Porch',
    description: 'Outdoor deck or porch build with footings, framing, decking, and railing.',
    type: 'Deck / Porch',
    tasks: ['Site Layout & Footings', 'Ledger & Beam Installation', 'Joist Framing', 'Decking Installation', 'Railing & Stairs', 'Finishing & Sealing', 'Final Inspection & Punch List'],
    permits: ['Building Permit'],
    inspections: ['Footing Inspection', 'Framing Inspection', 'Final Inspection'],
    materials: ['Concrete / Footings', 'Lumber & Hardware', 'Decking Boards', 'Railing System', 'Fasteners & Sealer'],
    phaseItems: {
      'Foundation Phase': ['Permit approved', '811 completed', 'Footing crew confirmed', 'Concrete ready'],
      'Framing Phase': ['Footing inspection passed', 'Lumber delivered', 'Crew confirmed'],
      'Final Phase': ['Framing inspection passed', 'Decking materials ready', 'Client walkthrough scheduled'],
    },
  },
  {
    id: 'sunroom',
    name: 'Sunroom',
    description: 'Enclosed sunroom addition with foundation, framing, windows, and HVAC.',
    type: 'Sunroom',
    tasks: ['Site Prep & Permits', 'Foundation', 'Framing', 'Windows & Glazing', 'Roofing', 'Electrical & HVAC Rough-In', 'Insulation & Drywall', 'Paint & Finish', 'Punch List'],
    permits: ['Building Permit', 'Electrical Permit'],
    inspections: ['Foundation Inspection', 'Framing Inspection', 'HVAC/Electrical Rough-In Inspection', 'Final Inspection'],
    materials: ['Foundation Materials', 'Lumber & Hardware', 'Windows & Glazing', 'Roofing', 'Insulation', 'Drywall', 'HVAC Equipment'],
    phaseItems: {
      'Foundation Phase': ['Permit approved', '811 completed', 'Foundation materials ready'],
      'Framing Phase': ['Foundation inspection passed', 'Lumber delivered', 'Windows/glazing ordered'],
      'Final Phase': ['All inspections passed', 'Punch list reviewed', 'Client walkthrough done'],
    },
  },
  {
    id: 'custom-home',
    name: 'Custom Home',
    description: 'Full custom home build from site prep through final finish and client handover.',
    type: 'Custom Home',
    tasks: ['Site Survey & Prep', 'Foundation', 'Framing', 'Roof', 'Exterior / Windows', 'Plumbing Rough-In', 'Electrical Rough-In', 'HVAC Rough-In', 'Insulation', 'Drywall', 'Flooring', 'Kitchen & Baths', 'Paint & Finish', 'Landscaping / Cleanup', 'Final Punch List & Walkthrough'],
    permits: ['Building Permit', 'Plumbing Permit', 'Electrical Permit', 'Mechanical Permit'],
    inspections: ['Footing Inspection', 'Foundation Inspection', 'Framing Inspection', 'Plumbing Rough-In Inspection', 'Electrical Rough-In Inspection', 'HVAC Rough-In Inspection', 'Insulation Inspection', 'Final Inspection'],
    materials: ['Site Prep & Excavation', 'Foundation Concrete', 'Lumber Package', 'Roofing', 'Windows & Doors', 'Plumbing Rough', 'Electrical Rough', 'HVAC Equipment', 'Insulation', 'Drywall', 'Flooring', 'Cabinets & Countertops', 'Paint & Trim'],
    phaseItems: {
      'Foundation Phase': ['Permit approved', '811 completed', 'Site access ready', 'Excavation crew confirmed', 'Weather acceptable'],
      'Framing Phase': ['Foundation inspection passed', 'Lumber delivered', 'Framing crew confirmed', 'Plans on site'],
      'Rough-In Phase': ['Framing inspection passed', 'Electrical subcontractor confirmed', 'Plumbing subcontractor confirmed', 'HVAC confirmed'],
      'Final Phase': ['All rough inspections passed', 'Punch list complete', 'Final inspection passed', 'Client walkthrough done'],
    },
  },
];

export default function ProjectTemplatesPage({ onViewProject }: { onViewProject?: (id: string) => void }) {
  const { profile } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [form, setForm] = useState({
    project_name: '',
    client_name: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    start_date: '',
    expected_finish_date: '',
  });

  const isAdmin = ['CONVAZANT_SUPER_ADMIN', 'DECKARC_ADMIN'].includes(profile?.role || '');

  function openTemplate(t: Template) {
    setSelectedTemplate(t);
    setForm(f => ({ ...f, project_name: `New ${t.name}` }));
    setShowModal(true);
    setCreated(null);
  }

  async function createFromTemplate() {
    if (!selectedTemplate || !profile) return;
    setCreating(true);

    const { data: org } = await supabase.from('organizations').select('id').limit(1).maybeSingle();

    const { data: project } = await supabase.from('projects').insert({
      organization_id: org?.id,
      project_name: form.project_name,
      client_name: form.client_name,
      address: form.address,
      city: form.city,
      state: form.state,
      zip: form.zip,
      project_type: selectedTemplate.type,
      status: 'Planning',
      start_date: form.start_date || null,
      expected_finish_date: form.expected_finish_date || null,
      alert_status: 'green',
      progress_percentage: 0,
    }).select().maybeSingle();

    if (!project) { setCreating(false); return; }

    // Create tasks
    for (let i = 0; i < selectedTemplate.tasks.length; i++) {
      await supabase.from('tasks').insert({
        project_id: project.id,
        task_name: selectedTemplate.tasks[i],
        category: 'General',
        assigned_role: 'GENERAL_CONTRACTOR',
        status: 'Not Started',
        progress_percentage: 0,
        is_client_visible: false,
        alert_status: 'green',
        sort_order: i,
      });
    }

    // Create permits
    for (const permit of selectedTemplate.permits) {
      await supabase.from('permits').insert({
        project_id: project.id,
        permit_type: permit,
        permit_required: true,
        permit_status: 'Not Started',
        alert_status: 'yellow',
      });
    }

    // Create inspections
    for (const inspection of selectedTemplate.inspections) {
      await supabase.from('inspections').insert({
        project_id: project.id,
        inspection_type: inspection,
        result: 'Not Scheduled',
        inspection_status: 'Not Scheduled',
        alert_status: 'yellow',
      });
    }

    // Create materials
    for (let i = 0; i < selectedTemplate.materials.length; i++) {
      await supabase.from('materials').insert({
        project_id: project.id,
        material_name: selectedTemplate.materials[i],
        material_category: 'General',
        quantity_required: 1,
        quantity_ordered: 0,
        quantity_delivered: 0,
        unit: 'lot',
        order_status: 'Not Ordered',
        material_ready_status: 'Not Ready',
        alert_status: 'yellow',
      });
    }

    // Create phase checklists
    const phaseRows: any[] = [];
    Object.entries(selectedTemplate.phaseItems).forEach(([phase, items], pi) => {
      items.forEach((item, ii) => {
        phaseRows.push({
          project_id: project.id,
          phase_name: phase,
          checklist_item: item,
          status: 'Not Started',
          sort_order: pi * 100 + ii,
        });
      });
    });
    if (phaseRows.length > 0) {
      await supabase.from('phase_checklists').insert(phaseRows);
    }

    setCreating(false);
    setCreated(project.id);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <LayoutTemplate className="w-5 h-5 text-steel-600" />
            <h1 className="text-xl font-bold text-concrete-900">Project Templates</h1>
          </div>
          <p className="text-sm text-concrete-500 pl-7">Start a new project from a pre-built template with tasks, permits, inspections, and materials.</p>
        </div>
      </div>

      {!isAdmin && (
        <div className="card p-4 mb-6 text-sm text-concrete-500">
          Only admins can create projects from templates. Contact your DECKARC admin to create a new project.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TEMPLATES.map(t => (
          <div key={t.id} className="card p-5 flex flex-col">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-steel-100 flex items-center justify-center flex-shrink-0">
                <LayoutTemplate className="w-5 h-5 text-steel-600" />
              </div>
            </div>
            <h3 className="font-semibold text-concrete-900 text-base mb-1">{t.name}</h3>
            <p className="text-xs text-concrete-500 leading-relaxed mb-4 flex-1">{t.description}</p>

            <div className="space-y-1 mb-4">
              {[
                [`${t.tasks.length} tasks`, 'text-concrete-600'],
                [`${t.permits.length} permits`, 'text-amber-600'],
                [`${t.inspections.length} inspections`, 'text-steel-600'],
                [`${t.materials.length} materials`, 'text-site-600'],
              ].map(([label, color]) => (
                <div key={label} className={`text-xs font-medium ${color} flex items-center gap-1.5`}>
                  <span className="w-1 h-1 rounded-full bg-current opacity-60" />
                  {label}
                </div>
              ))}
            </div>

            {isAdmin && (
              <button onClick={() => openTemplate(t)} className="btn-primary w-full text-xs">
                <Plus className="w-3.5 h-3.5" /> Use Template
              </button>
            )}
          </div>
        ))}
      </div>

      {showModal && selectedTemplate && (
        <Modal title={`New Project from "${selectedTemplate.name}"`} onClose={() => { setShowModal(false); setCreated(null); }} size="lg">
          {created ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 bg-site-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="w-7 h-7 text-site-600" />
              </div>
              <h3 className="text-base font-semibold text-concrete-900 mb-1">Project created!</h3>
              <p className="text-sm text-concrete-500 mb-5">
                {form.project_name} has been set up with {selectedTemplate.tasks.length} tasks, {selectedTemplate.permits.length} permits, {selectedTemplate.inspections.length} inspections, and {selectedTemplate.materials.length} materials.
              </p>
              {onViewProject && (
                <button onClick={() => { setShowModal(false); onViewProject(created); }} className="btn-primary mx-auto">
                  <ChevronRight className="w-4 h-4" /> Open Project
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="label-sm">Project Name *</label>
                  <input className="input-field" value={form.project_name} onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="label-sm">Client Name</label>
                  <input className="input-field" value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="label-sm">Address</label>
                  <input className="input-field" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                </div>
                <div>
                  <label className="label-sm">City</label>
                  <input className="input-field" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label-sm">State</label>
                    <input className="input-field" value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} placeholder="FL" />
                  </div>
                  <div>
                    <label className="label-sm">ZIP</label>
                    <input className="input-field" value={form.zip} onChange={e => setForm(f => ({ ...f, zip: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="label-sm">Start Date</label>
                  <input type="date" className="input-field" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div>
                  <label className="label-sm">Expected Finish</label>
                  <input type="date" className="input-field" value={form.expected_finish_date} onChange={e => setForm(f => ({ ...f, expected_finish_date: e.target.value }))} />
                </div>
              </div>

              <div className="bg-concrete-50 rounded-lg p-3 text-xs text-concrete-600">
                This will auto-create: {selectedTemplate.tasks.length} tasks · {selectedTemplate.permits.length} permits · {selectedTemplate.inspections.length} inspections · {selectedTemplate.materials.length} materials · Phase readiness checklist
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-concrete-100">
                <button onClick={() => setShowModal(false)} className="btn-ghost">Cancel</button>
                <button onClick={createFromTemplate} disabled={creating || !form.project_name} className="btn-primary disabled:opacity-50">
                  {creating ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
