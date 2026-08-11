import { ReactNode, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getRoleLabel } from '../lib/alertUtils';
import VoiceAssistant from './VoiceAssistant';
import {
  LayoutDashboard, FolderOpen, CheckSquare, ClipboardList,
  ShieldCheck, Bell, BarChart2, Users, Settings, LogOut,
  HardHat, Menu, X, ChevronDown, Zap, Sun, Smartphone,
  Globe, Building2, Lock, FileText, Code2,
  Home, Vault, Plug, MessageSquare, Image, FileCheck, CreditCard, CalendarDays,
  ChevronLeft, ChevronRight, Inbox, Microscope,
} from 'lucide-react';

type Page =
  | 'dashboard'
  | 'action-board'
  | 'tomorrow'
  | 'projects'
  | 'tasks'
  | 'daily-updates'
  | 'permits'
  | 'alerts'
  | 'reports'
  | 'users'
  | 'settings'
  | 'field-mode'
  | 'templates'
  | 'files'
  | 'integrations'
  | 'client-messages'
  | 'client-schedule'
  | 'client-selections'
  | 'client-files'
  | 'client-payments'
  | 'company'
  | 'cp360-leads'
  | 'sub-projects'
  | 'customer-discovery';

interface LayoutProps {
  children: ReactNode;
  currentPage: Page;
  onNavigate: (page: Page) => void;
  clientProjectLabel?: string;
}

const convazantNavItems = [
  { id: 'dashboard',     label: 'Platform Dashboard',   icon: Globe },
  { id: 'projects',      label: 'Workspaces',           icon: Building2 },
  { id: 'users',         label: 'Platform Users',       icon: Users },
  { id: 'permits',       label: 'Access & Requests',    icon: Lock },
  { id: 'integrations',  label: 'Integrations',         icon: Plug },
  { id: 'alerts',        label: 'Security & Consent',   icon: ShieldCheck },
  { id: 'daily-updates', label: 'Support Logs',         icon: FileText },
  { id: 'cp360-leads',   label: 'CP360 Leads',          icon: Inbox },
  { id: 'customer-discovery', label: 'Customer Discovery', icon: Microscope },
  { id: 'tasks',         label: 'Developer Assistant',  icon: Code2 },
  { id: 'settings',      label: 'Settings',             icon: Settings },
];
const convazantNavGroups: Record<string, string> = {
  dashboard: '', projects: 'Organization', users: 'Organization', permits: 'Organization',
  integrations: 'Platform', alerts: 'Platform', 'daily-updates': 'Platform',
  'cp360-leads': 'Marketing',
  'customer-discovery': 'Research',
  tasks: 'Developer', settings: 'Developer',
};

const adminNavItems = [
  { id: 'dashboard',     label: 'Company Dashboard',    icon: LayoutDashboard },
  { id: 'action-board',  label: 'Action Board',         icon: Zap },
  { id: 'tomorrow',      label: "Tomorrow's Plan",      icon: Sun },
  { id: 'projects',      label: 'Projects',             icon: FolderOpen },
  { id: 'tasks',         label: 'Tasks & Milestones',   icon: CheckSquare },
  { id: 'daily-updates', label: 'Daily Updates',        icon: ClipboardList },
  { id: 'permits',       label: 'Permits & Inspections',icon: ShieldCheck },
  { id: 'files',         label: 'File Vault',           icon: Vault },
  { id: 'alerts',        label: 'Alert Center',         icon: Bell },
  { id: 'reports',       label: 'Reports',              icon: BarChart2 },
  { id: 'company',       label: 'Company',              icon: Building2 },
  { id: 'settings',      label: 'Settings',             icon: Settings },
];
const adminNavGroups: Record<string, string> = {
  dashboard: '', 'action-board': 'Today', tomorrow: 'Today',
  projects: 'Operations', tasks: 'Operations', 'daily-updates': 'Operations',
  permits: 'Compliance', files: 'Compliance', alerts: 'Compliance',
  reports: 'Management', company: 'Management', settings: 'Management',
};

const gcNavItems = [
  { id: 'dashboard',     label: 'Dashboard',            icon: LayoutDashboard },
  { id: 'action-board',  label: 'Action Board',         icon: Zap },
  { id: 'tomorrow',      label: "Tomorrow's Plan",      icon: Sun },
  { id: 'field-mode',    label: 'Field Mode',           icon: Smartphone },
  { id: 'projects',      label: 'Projects',             icon: FolderOpen },
  { id: 'tasks',         label: 'Tasks & Milestones',   icon: CheckSquare },
  { id: 'daily-updates', label: 'Daily Updates',        icon: ClipboardList },
  { id: 'permits',       label: 'Permits & Inspections',icon: ShieldCheck },
  { id: 'alerts',        label: 'Alert Center',         icon: Bell },
];
const gcNavGroups: Record<string, string> = {
  dashboard: '', 'action-board': 'Today', tomorrow: 'Today', 'field-mode': 'Today',
  projects: 'My Work', tasks: 'My Work', 'daily-updates': 'My Work',
  permits: 'Compliance', alerts: 'Compliance',
};

const subNavItems = [
  { id: 'dashboard',     label: 'My Dashboard',         icon: LayoutDashboard },
  { id: 'field-mode',    label: 'Field Mode',           icon: Smartphone },
  { id: 'action-board',  label: 'Action Board',         icon: Zap },
  { id: 'tomorrow',      label: "Tomorrow's Plan",      icon: Sun },
  { id: 'sub-projects',  label: 'My Projects',          icon: FolderOpen },
  { id: 'tasks',         label: 'My Tasks',             icon: CheckSquare },
  { id: 'daily-updates', label: 'Daily Updates',        icon: ClipboardList },
];
const subNavGroups: Record<string, string> = {
  dashboard: '', 'field-mode': 'Field', 'action-board': 'Field', tomorrow: 'Field',
  'sub-projects': 'My Work', tasks: 'My Work', 'daily-updates': 'My Work',
};

const clientNavItems = [
  { id: 'dashboard',          label: 'Home',             icon: Home },
  { id: 'projects',           label: 'My Project',       icon: FolderOpen },
  { id: 'client-messages',    label: 'Messages',         icon: MessageSquare },
  { id: 'client-payments',    label: 'Payments',         icon: CreditCard },
  { id: 'settings',           label: 'Settings',         icon: Settings },
];
const clientNavGroups: Record<string, string> = {
  dashboard: '', projects: '', 'client-messages': '', 'client-payments': '', settings: '',
};

export default function Layout({ children, currentPage, onNavigate, clientProjectLabel }: LayoutProps) {
  const { profile, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const role = profile?.role || 'SUBCONTRACTOR';

  let navItems: typeof adminNavItems;
  let navGroups: Record<string, string>;
  let workspaceLabel: string;
  let workspaceBadge: string | null = null;

  if (role === 'CONVAZANT_SUPER_ADMIN') {
    navItems = convazantNavItems; navGroups = convazantNavGroups;
    workspaceLabel = 'CONVAZANT Platform'; workspaceBadge = 'Super Admin';
  } else if (role === 'DECKARC_ADMIN') {
    navItems = adminNavItems; navGroups = adminNavGroups;
    workspaceLabel = 'DECKARC LLC';
  } else if (role === 'GENERAL_CONTRACTOR') {
    navItems = gcNavItems; navGroups = gcNavGroups;
    workspaceLabel = 'General Contractor';
  } else if (role === 'SUBCONTRACTOR') {
    navItems = subNavItems; navGroups = subNavGroups;
    workspaceLabel = 'Field Team';
  } else {
    navItems = clientNavItems; navGroups = clientNavGroups;
    workspaceLabel = 'Homeowner Portal';
  }

  const isClient = navItems === clientNavItems;

  // Apply dynamic "My Project" / "My Projects" label for client nav
  const resolvedNavItems = isClient && clientProjectLabel
    ? navItems.map(item => item.id === 'projects' ? { ...item, label: clientProjectLabel } : item)
    : navItems;

  const grouped: { group: string; items: typeof navItems }[] = [];
  const groupMap = new Map<string, typeof navItems>();
  resolvedNavItems.forEach(item => {
    const g = navGroups[item.id] ?? '';
    if (!groupMap.has(g)) { groupMap.set(g, []); grouped.push({ group: g, items: groupMap.get(g)! }); }
    groupMap.get(g)!.push(item);
  });

  const initials = (profile?.full_name || 'U').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  const c = isClient ? {
    bg:          'bg-steel-950',
    border:      'border-steel-900',
    divider:     'bg-steel-800',
    iconBox:     'bg-steel-500',
    subtitle:    'text-steel-600',
    chipBg:      'bg-steel-900/60 border-steel-800/50',
    chipText:    'text-steel-300',
    sectionLabel:'text-steel-700',
    activeItem:  'bg-steel-400/15 text-steel-300',
    inactiveItem:'text-steel-500 hover:bg-steel-900/70 hover:text-steel-200',
    activeIcon:  'text-steel-300',
    inactiveIcon:'text-steel-600 group-hover:text-steel-400',
    footerDivider:'bg-steel-800',
    avatarBox:   'bg-steel-800 border-steel-700',
    avatarText:  'text-steel-200',
    userName:    'text-steel-200',
    userRole:    'text-steel-600',
    chevron:     'text-steel-700',
    menuBg:      'bg-steel-950 border-steel-800',
    menuDivider: 'border-steel-900',
    menuEmail:   'text-steel-500',
    menuHover:   'hover:bg-steel-900',
    mobileHamburger: 'hover:bg-steel-900 text-steel-300',
    overlayBg:   'bg-steel-950',
    collapseBtn: 'bg-steel-800 hover:bg-steel-700 text-steel-400',
  } : {
    bg:          'bg-slate-900',
    border:      'border-slate-800',
    divider:     'bg-slate-800',
    iconBox:     'bg-blue-600',
    subtitle:    'text-slate-500',
    chipBg:      'bg-slate-800/60 border-slate-700/50',
    chipText:    'text-slate-300',
    sectionLabel:'text-slate-600',
    activeItem:  'bg-slate-700/50 text-slate-100',
    inactiveItem:'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200',
    activeIcon:  'text-slate-100',
    inactiveIcon:'text-slate-500 group-hover:text-slate-300',
    footerDivider:'bg-slate-800',
    avatarBox:   'bg-slate-700 border-slate-600',
    avatarText:  'text-slate-200',
    userName:    'text-slate-200',
    userRole:    'text-slate-500',
    chevron:     'text-slate-600',
    menuBg:      'bg-slate-900 border-slate-700',
    menuDivider: 'border-slate-800',
    menuEmail:   'text-slate-400',
    menuHover:   'hover:bg-slate-800',
    mobileHamburger: 'hover:bg-slate-800 text-slate-300',
    overlayBg:   'bg-slate-900',
    collapseBtn: 'bg-slate-800 hover:bg-slate-700 text-slate-400',
  };

  const SidebarContent = ({ collapsed }: { collapsed: boolean }) => (
    <div className="flex flex-col h-full overflow-hidden relative">
      {isClient && (
        <>
          <div
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{ backgroundImage: `repeating-linear-gradient(-45deg, transparent, transparent 20px, rgba(255,255,255,0.015) 20px, rgba(255,255,255,0.015) 21px)` }}
          />
          <div
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{
              backgroundImage: `linear-gradient(rgba(56,114,188,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(56,114,188,0.08) 1px, transparent 1px)`,
              backgroundSize: '48px 48px',
            }}
          />
        </>
      )}

      {/* Brand header */}
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
            <div className="flex-1 min-w-0">
              <p className={`text-[11px] font-semibold ${c.chipText} truncate leading-tight`}>{workspaceLabel}</p>
            </div>
            {workspaceBadge && (
              <span className="text-[9px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded flex-shrink-0">{workspaceBadge}</span>
            )}
          </div>
        )}
      </div>

      <div className={`h-px ${c.divider} mx-3 mb-1 flex-shrink-0 relative z-10`} />

      {/* Nav */}
      <nav className={`flex-1 py-2 overflow-y-auto scrollbar-hide relative z-10 ${collapsed ? 'px-1.5' : 'px-2'}`}>
        {grouped.map(({ group, items }) => (
          <div key={group} className={group ? 'mt-4' : ''}>
            {group && !collapsed && (
              <p className={`text-[11px] font-medium ${c.sectionLabel} px-3 pb-1 pt-0.5`}>
                {group}
              </p>
            )}
            {group && collapsed && <div className={`h-px ${c.divider} mx-1 mb-2 mt-1`} />}
            <div className="space-y-0.5">
              {items.map(item => {
                const Icon = item.icon;
                const active = currentPage === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { onNavigate(item.id as Page); setSidebarOpen(false); }}
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
                    {!collapsed && (
                      <>
                        <span className="flex-1 text-left leading-tight">{item.label}</span>
                        {item.id === 'alerts' && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                        )}
                      </>
                    )}
                    {collapsed && item.id === 'alerts' && (
                      <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="flex-shrink-0 pb-3 pt-1 relative z-10 px-2">
        <div className={`h-px ${c.footerDivider} mx-1 mb-2`} />
        {collapsed ? (
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              title={profile?.full_name || 'User'}
              className={`w-full flex justify-center p-2 rounded-xl ${c.menuHover} transition-colors`}
            >
              <div className={`w-8 h-8 rounded-xl ${c.avatarBox} border flex items-center justify-center text-[11px] font-bold ${c.avatarText}`}>
                {initials}
              </div>
            </button>
            {userMenuOpen && (
              <div className={`absolute bottom-full left-0 mb-1 w-52 ${c.menuBg} border rounded-xl shadow-xl py-1.5 overflow-hidden z-20`}>
                <div className={`px-4 py-2 border-b ${c.menuDivider}`}>
                  <p className={`text-xs font-semibold text-slate-200`}>{profile?.full_name}</p>
                  <p className={`text-xs ${c.menuEmail} truncate`}>{profile?.email}</p>
                </div>
                <button
                  onClick={() => { signOut(); setUserMenuOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 ${c.menuHover} hover:text-red-300 transition-colors font-medium`}
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl ${c.menuHover} transition-colors group`}
            >
              <div className={`w-8 h-8 rounded-xl ${c.avatarBox} border flex items-center justify-center text-[11px] font-bold ${c.avatarText} flex-shrink-0`}>
                {initials}
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className={`text-[13px] font-semibold ${c.userName} truncate leading-tight`}>{profile?.full_name || 'User'}</p>
                <p className={`text-[11px] ${c.userRole} truncate leading-tight`}>{getRoleLabel(role)}</p>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 ${c.chevron} flex-shrink-0 transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {userMenuOpen && (
              <div className={`absolute bottom-full left-0 right-0 mb-1 ${c.menuBg} border rounded-xl shadow-xl py-1.5 overflow-hidden z-20`}>
                <div className={`px-4 py-2 border-b ${c.menuDivider}`}>
                  <p className={`text-xs ${c.menuEmail} truncate`}>{profile?.email}</p>
                </div>
                <button
                  onClick={() => { signOut(); setUserMenuOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 ${c.menuHover} hover:text-red-300 transition-colors font-medium`}
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      {/* Desktop sidebar */}
      <div
        className={`hidden lg:flex flex-col ${c.bg} border-r ${c.border} flex-shrink-0 transition-all duration-200 relative ${
          sidebarCollapsed ? 'w-[56px]' : 'w-56'
        }`}
      >
        <SidebarContent collapsed={sidebarCollapsed} />
        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className={`absolute -right-3 top-[60px] z-30 w-6 h-6 rounded-full ${c.collapseBtn} border border-slate-700 flex items-center justify-center shadow-md transition-colors`}
        >
          {sidebarCollapsed
            ? <ChevronRight className="w-3 h-3" />
            : <ChevronLeft className="w-3 h-3" />
          }
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

      {/* Main content */}
      <div className={`flex-1 flex flex-col min-w-0 overflow-hidden${isClient ? ' client-portal' : ''}`}>
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
          {children}
        </main>
      </div>

      {/* Admin-only voice assistant (renders nothing for non-admins) */}
      <VoiceAssistant onNavigate={(page) => onNavigate(page as Page)} />
    </div>
  );
}

export type { Page };
