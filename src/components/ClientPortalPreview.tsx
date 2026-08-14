import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  Eye, X, Home, FolderOpen, MessageSquare, CreditCard, Settings,
  HardHat, Menu, ChevronRight, ChevronLeft,
} from 'lucide-react';

import ClientDashboardPage from '../pages/ClientDashboardPage';
import ClientProjectsPage from '../pages/ClientProjectsPage';
import ClientProjectDetailPage from '../pages/ClientProjectDetailPage';
import ClientMessagesPage from '../pages/ClientMessagesPage';
import ClientPaymentsPage from '../pages/ClientPaymentsPage';

type PreviewPage = 'dashboard' | 'projects' | 'client-messages' | 'client-payments' | 'settings';

interface Props {
  clientName: string;
  clientEmail: string | null;
  startProjectId: string | null;
  onExit: () => void;
}

// ─── Preview Settings stub ────────────────────────────────────────────────────

function PreviewSettingsStub() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white border border-amber-200 rounded-2xl px-8 py-10 max-w-sm text-center shadow-sm">
        <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Settings className="w-6 h-6 text-amber-500" />
        </div>
        <p className="text-sm font-semibold text-slate-800 mb-2">Settings — Preview Mode</p>
        <p className="text-xs text-slate-500 leading-relaxed">
          Settings are not editable in Client Portal Preview. No changes can be made to the client's profile, password, or notification preferences.
        </p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ClientPortalPreview({ clientName, clientEmail, startProjectId, onExit }: Props) {
  const [currentPage, setCurrentPage] = useState<PreviewPage>(
    startProjectId ? 'projects' : 'dashboard'
  );
  const [viewingProjectId, setViewingProjectId] = useState<string | null>(startProjectId);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Determine project count so we can label the nav item correctly and handle single-project shortcut
  const [projectCount, setProjectCount] = useState<number | null>(null);
  const [singleProjectId, setSingleProjectId] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    const { data } = await supabase
      .from('projects')
      .select('id')
      .eq('is_archived', false);
    const count = data?.length ?? 0;
    setProjectCount(count);
    setSingleProjectId(count === 1 ? data![0].id : null);
  }

  function navigateTo(page: PreviewPage) {
    // Single-project shortcut: clicking "My Project" opens project directly
    if (page === 'projects' && singleProjectId) {
      setViewingProjectId(singleProjectId);
      setCurrentPage('projects');
      setSidebarOpen(false);
      return;
    }
    setCurrentPage(page);
    setViewingProjectId(null);
    setSidebarOpen(false);
  }

  function viewProject(id: string) {
    setViewingProjectId(id);
    setCurrentPage('projects');
  }

  const projectNavLabel = projectCount === null
    ? 'My Project'
    : projectCount > 1 ? 'My Projects' : 'My Project';

  const isSingleProject = projectCount === 1;

  const navItems: { id: PreviewPage; label: string; icon: React.ElementType }[] = [
    { id: 'dashboard',        label: 'Home',            icon: Home          },
    { id: 'projects',         label: projectNavLabel,   icon: FolderOpen    },
    { id: 'client-messages',  label: 'Messages',        icon: MessageSquare },
    { id: 'client-payments',  label: 'Payments',        icon: CreditCard    },
    { id: 'settings',         label: 'Settings',        icon: Settings      },
  ];

  function renderContent() {
    // Project detail
    if (currentPage === 'projects' && viewingProjectId) {
      return (
        <ClientProjectDetailPage
          projectId={viewingProjectId}
          previewMode={true}
          backLabel={isSingleProject ? 'Home' : 'My Projects'}
          onBack={() => {
            setViewingProjectId(null);
            if (isSingleProject) setCurrentPage('dashboard');
          }}
        />
      );
    }

    switch (currentPage) {
      case 'dashboard':
        return (
          <ClientDashboardPage
            onNavigateToProjects={() => navigateTo('projects')}
            onNavigateToMessages={() => navigateTo('client-messages')}
            onNavigateToPayments={() => navigateTo('client-payments')}
            onNavigateToSchedule={() => navigateTo('projects')}
            onNavigateToSelections={() => navigateTo('projects')}
            onNavigateToFiles={() => navigateTo('projects')}
            previewMode={true}
          />
        );
      case 'projects':
        return <ClientProjectsPage onViewProject={viewProject} />;
      case 'client-messages':
        return <ClientMessagesPage previewMode={true} />;
      case 'client-payments':
        return <ClientPaymentsPage />;
      case 'settings':
        return <PreviewSettingsStub />;
    }
  }

  // Sidebar colors — same steel theme as real client portal
  const c = {
    bg:           'bg-steel-950',
    border:       'border-steel-900',
    divider:      'bg-steel-800',
    iconBox:      'bg-steel-500',
    subtitle:     'text-steel-600',
    chipBg:       'bg-steel-900/60 border-steel-800/50',
    chipText:     'text-steel-300',
    activeItem:   'bg-steel-400/15 text-steel-300',
    inactiveItem: 'text-steel-500 hover:bg-steel-900/70 hover:text-steel-200',
    activeIcon:   'text-steel-300',
    inactiveIcon: 'text-steel-600 group-hover:text-steel-400',
    footerDivider:'bg-steel-800',
    avatarBox:    'bg-steel-800 border-steel-700',
    userName:     'text-steel-200',
    collapseBtn:  'bg-steel-800 hover:bg-steel-700 text-steel-400',
    overlayBg:    'bg-steel-950',
    mobileHamburger: 'hover:bg-steel-900 text-steel-300',
  };

  const activeNavId: PreviewPage = currentPage;

  const SidebarContent = ({ collapsed }: { collapsed: boolean }) => (
    <div className="flex flex-col h-full overflow-hidden relative">
      {/* Decorative grid */}
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(56,114,188,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(56,114,188,0.08) 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }}
      />

      {/* Brand */}
      <div className={`pt-5 pb-4 flex-shrink-0 relative z-10 ${collapsed ? 'px-2' : 'px-4'}`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <div className={`w-9 h-9 ${c.iconBox} rounded-xl flex items-center justify-center flex-shrink-0 shadow-md`}>
            <HardHat className="w-[18px] h-[18px] text-white" strokeWidth={2.2} />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[15px] font-bold text-white leading-tight tracking-tight">CP360</span>
                <span className="text-[8px] font-bold bg-amber-400 text-slate-900 px-1.5 py-0.5 rounded-md leading-none tracking-wide">AI</span>
              </div>
              <p className={`text-[10px] ${c.subtitle} leading-tight mt-0.5`}>ConstructionProgress360</p>
            </div>
          )}
        </div>
        {!collapsed && (
          <div className={`mt-3 flex items-center gap-2 px-2.5 py-1.5 ${c.chipBg} rounded-lg border`}>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
            <p className={`text-[11px] font-semibold ${c.chipText} truncate leading-tight flex-1 min-w-0`}>
              Homeowner Portal
            </p>
          </div>
        )}
      </div>

      <div className={`h-px ${c.divider} mx-3 mb-1 flex-shrink-0 relative z-10`} />

      {/* Nav */}
      <nav className={`flex-1 py-2 overflow-y-auto relative z-10 ${collapsed ? 'px-1.5' : 'px-2'}`}>
        <div className="space-y-0.5">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = activeNavId === item.id && !viewingProjectId ||
              (item.id === 'projects' && (activeNavId === 'projects' || !!viewingProjectId));
            return (
              <button
                key={item.id}
                onClick={() => navigateTo(item.id)}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center transition-all duration-150 group rounded-lg ${
                  collapsed
                    ? `justify-center p-2 ${active ? c.activeItem : c.inactiveItem}`
                    : `gap-2.5 px-3 py-[7px] text-[13px] font-normal ${active ? c.activeItem : c.inactiveItem}`
                }`}
              >
                <Icon
                  className={`flex-shrink-0 transition-colors ${collapsed ? 'w-[17px] h-[17px]' : 'w-[14px] h-[14px]'} ${
                    active ? c.activeIcon : c.inactiveIcon
                  }`}
                  strokeWidth={1.75}
                />
                {!collapsed && <span className="flex-1 text-left leading-tight">{item.label}</span>}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Client name in footer */}
      {!collapsed && (
        <div className="flex-shrink-0 pb-3 pt-1 relative z-10 px-2">
          <div className={`h-px ${c.footerDivider} mx-1 mb-2`} />
          <div className="px-3 py-2">
            <p className="text-[11px] font-semibold text-steel-300 truncate">{clientName}</p>
            {clientEmail && <p className="text-[10px] text-steel-600 truncate mt-0.5">{clientEmail}</p>}
            <p className="text-[10px] text-amber-400 mt-1 font-semibold">Preview Mode</p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden">
      {/* Preview banner */}
      <div className="bg-amber-500 px-4 py-2.5 flex items-center justify-between gap-4 flex-shrink-0 z-50">
        <div className="flex items-center gap-2.5 min-w-0">
          <Eye className="w-4 h-4 text-white flex-shrink-0" />
          <span className="text-sm font-semibold text-white truncate">
            Client Portal Preview — {clientName}
            {clientEmail && <span className="font-normal opacity-80"> ({clientEmail})</span>}
          </span>
          <span className="hidden sm:inline text-xs text-amber-100 bg-amber-600/50 px-2 py-0.5 rounded-full flex-shrink-0">
            Read-only
          </span>
        </div>
        <button
          onClick={onExit}
          className="flex items-center gap-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0 whitespace-nowrap"
        >
          <X className="w-3.5 h-3.5" />
          Exit Preview
        </button>
      </div>

      {/* Portal body */}
      <div className="flex flex-1 min-h-0">
        {/* Desktop sidebar */}
        <div
          className={`hidden lg:flex flex-col ${c.bg} border-r ${c.border} flex-shrink-0 transition-all duration-200 relative ${
            sidebarCollapsed ? 'w-[56px]' : 'w-56'
          }`}
        >
          <SidebarContent collapsed={sidebarCollapsed} />
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={`absolute -right-3 top-[60px] z-30 w-6 h-6 rounded-full ${c.collapseBtn} border border-slate-700 flex items-center justify-center shadow-md transition-colors`}
          >
            {sidebarCollapsed
              ? <ChevronRight className="w-3 h-3" />
              : <ChevronLeft className="w-3 h-3" />}
          </button>
        </div>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
            <div className={`absolute left-0 top-0 bottom-0 w-60 ${c.overlayBg} shadow-xl`}>
              <button
                onClick={() => setSidebarOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
              <SidebarContent collapsed={false} />
            </div>
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Mobile top bar */}
          <div className={`lg:hidden flex items-center gap-3 px-4 py-3 ${c.bg} border-b ${c.border} flex-shrink-0`}>
            <button
              onClick={() => setSidebarOpen(true)}
              className={`p-1.5 rounded-xl ${c.mobileHamburger} transition-colors`}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 ${c.iconBox} rounded-lg flex items-center justify-center`}>
                <HardHat className="w-4 h-4 text-white" strokeWidth={2.2} />
              </div>
              <span className="font-bold text-white text-sm tracking-tight">CP360</span>
              <span className="text-[8px] font-bold bg-amber-400 text-slate-900 px-1.5 py-0.5 rounded-md leading-none">AI</span>
            </div>
          </div>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto">
            {renderContent()}
          </main>
        </div>
      </div>
    </div>
  );
}
