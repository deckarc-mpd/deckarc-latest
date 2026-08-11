import { useRef, useState } from 'react';
import {
  Users, TrendingUp, BookOpen, Building2,
  ChevronDown, ChevronRight, Construction, Plus,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import UsersPage from './UsersPage';
import ProjectTemplatesPage from './ProjectTemplatesPage';

type CompanySection =
  | 'team-members'
  | 'clients'
  | 'contacts'
  | 'subcontractors'
  | 'vendors'
  | 'leads'
  | 'opportunities'
  | 'follow-ups'
  | 'contact-forms'
  | 'project-templates'
  | 'estimate-templates'
  | 'contract-templates'
  | 'categories'
  | 'my-items'
  | 'catalogs'
  | 'company-info'
  | 'website-info'
  | 'branding';

interface SectionItem {
  id: CompanySection;
  label: string;
  live?: boolean;
}

interface NavGroup {
  id: string;
  label: string;
  icon: React.ElementType;
  defaultOpen: boolean;
  items: SectionItem[];
}

const navGroups: NavGroup[] = [
  {
    id: 'collaborators',
    label: 'Collaborators',
    icon: Users,
    defaultOpen: true,
    items: [
      { id: 'team-members',   label: 'Team Members',   live: true },
      { id: 'clients',        label: 'Clients' },
      { id: 'contacts',       label: 'Contacts' },
      { id: 'subcontractors', label: 'Subcontractors' },
      { id: 'vendors',        label: 'Vendors' },
    ],
  },
  {
    id: 'crm',
    label: 'CRM',
    icon: TrendingUp,
    defaultOpen: true,
    items: [
      { id: 'leads',         label: 'Leads' },
      { id: 'opportunities', label: 'Opportunities' },
      { id: 'follow-ups',    label: 'Follow-Ups' },
      { id: 'contact-forms', label: 'Contact Forms' },
    ],
  },
  {
    id: 'library',
    label: 'Library',
    icon: BookOpen,
    defaultOpen: true,
    items: [
      { id: 'project-templates',  label: 'Project Templates',  live: true },
      { id: 'estimate-templates', label: 'Estimate Templates' },
      { id: 'contract-templates', label: 'Contract Templates' },
      { id: 'categories',         label: 'Categories' },
      { id: 'my-items',           label: 'My Items' },
      { id: 'catalogs',           label: 'Catalogs' },
    ],
  },
  {
    id: 'company-profile',
    label: 'Company Profile',
    icon: Building2,
    defaultOpen: true,
    items: [
      { id: 'company-info',  label: 'Company Info' },
      { id: 'website-info',  label: 'Website Info' },
      { id: 'branding',      label: 'Branding' },
    ],
  },
];

const allItems = navGroups.flatMap(g => g.items);

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({
  title, description, action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white border-b border-slate-100 px-8 py-5 flex-shrink-0">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-800 leading-tight">{title}</h2>
          <p className="text-[12px] text-slate-400 mt-0.5">{description}</p>
        </div>
        {action}
      </div>
    </div>
  );
}

function ComingSoonPanel({ label }: { label: string }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-7">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col items-center justify-center py-20 px-8 text-center">
          <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center mb-4">
            <Construction className="w-5 h-5 text-slate-300" />
          </div>
          <p className="text-sm font-semibold text-slate-700 mb-1">{label}</p>
          <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
            This section is not yet available. Check back soon.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

interface CompanyPageProps {
  onViewProject?: (id: string) => void;
}

export default function CompanyPage({ onViewProject }: CompanyPageProps) {
  const { profile } = useAuth();
  const [activeSection, setActiveSection] = useState<CompanySection>('team-members');
  const addUserFnRef = useRef<(() => void) | null>(null);

  const canManage = profile?.role === 'CONVAZANT_SUPER_ADMIN' || profile?.role === 'DECKARC_ADMIN';

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    () => Object.fromEntries(navGroups.map(g => [g.id, g.defaultOpen]))
  );

  function toggleGroup(id: string) {
    setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));
  }

  const activeItem = allItems.find(i => i.id === activeSection);

  function renderContent() {
    switch (activeSection) {
      case 'team-members':
        return (
          <div className="flex flex-col h-full min-h-0">
            <SectionHeader
              title="Team Members"
              description="Manage your organization's users and roles"
              action={
                canManage ? (
                  <button
                    onClick={() => addUserFnRef.current?.()}
                    className="btn-primary"
                  >
                    <Plus className="w-4 h-4" />
                    Add User
                  </button>
                ) : undefined
              }
            />
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-5xl mx-auto px-8 py-6">
                <UsersPage
                  hideHeader
                  noContainer
                  registerAddUser={fn => { addUserFnRef.current = fn; }}
                />
              </div>
            </div>
          </div>
        );

      case 'project-templates':
        return <ProjectTemplatesPage onViewProject={onViewProject ?? (() => {})} />;

      default:
        return <ComingSoonPanel label={activeItem?.label ?? String(activeSection)} />;
    }
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ── Tree nav sidebar ── */}
      <aside className="w-52 flex-shrink-0 bg-white border-r border-slate-100 flex flex-col overflow-y-auto">
        <div className="px-5 pt-5 pb-3 border-b border-slate-100">
          <p className="text-[13px] font-semibold text-slate-800 tracking-tight">Company</p>
        </div>

        <nav className="flex-1 py-2 pb-6">
          {navGroups.map(group => {
            const Icon = group.icon;
            const open = openGroups[group.id] ?? group.defaultOpen;

            return (
              <div key={group.id} className="mt-3 first:mt-2">
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center gap-2 px-4 py-1.5 text-left transition-colors duration-100 hover:bg-slate-50 group"
                >
                  <Icon
                    className="w-[13px] h-[13px] flex-shrink-0 text-slate-400 group-hover:text-slate-500"
                    strokeWidth={1.75}
                  />
                  <span className="flex-1 text-[12px] font-medium text-slate-500 group-hover:text-slate-700 leading-none">
                    {group.label}
                  </span>
                  {open
                    ? <ChevronDown className="w-3 h-3 text-slate-300 flex-shrink-0" />
                    : <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
                  }
                </button>

                {/* Tree children */}
                {open && (
                  <div className="relative ml-[23px] mt-0.5 mb-1">
                    {/* Vertical tree line */}
                    <span className="absolute left-0 top-1 bottom-1 w-px bg-slate-100" />

                    {group.items.map(item => {
                      const active = activeSection === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => setActiveSection(item.id)}
                          className={`w-full text-left pl-4 pr-3 py-[5px] text-[13px] transition-colors duration-100 relative ${
                            active
                              ? 'text-slate-900 font-medium'
                              : item.live
                                ? 'text-slate-500 hover:text-slate-900'
                                : 'text-slate-400 hover:text-slate-500'
                          }`}
                        >
                          {active && (
                            <span className="absolute left-0 top-[4px] bottom-[4px] w-px bg-slate-500" />
                          )}
                          <span className="leading-snug">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-slate-50">
        {renderContent()}
      </div>
    </div>
  );
}
