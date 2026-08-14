import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout, { Page } from './components/Layout';
import LoginPage from './pages/LoginPage';
import ConsentPage from './pages/ConsentPage';
import FoundingPilotPage from './pages/FoundingPilotPage';
import DashboardPage from './pages/DashboardPage';
import ConvazantDashboardPage from './pages/ConvazantDashboardPage';
import GCDashboardPage from './pages/GCDashboardPage';
import SubcontractorDashboardPage from './pages/SubcontractorDashboardPage';
import ClientDashboardPage from './pages/ClientDashboardPage';
import ActionBoardPage from './pages/ActionBoardPage';
import CommandCenterPage from './pages/CommandCenterPage';
import ActionCenterPage from './pages/ActionCenterPage';
import TomorrowWorkPage from './pages/TomorrowWorkPage';
import ProjectsPage from './pages/ProjectsPage';
import ClientProjectsPage from './pages/ClientProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import TasksPage from './pages/TasksPage';
import DailyUpdatesPage from './pages/DailyUpdatesPage';
import PermitsInspectionsPage from './pages/PermitsInspectionsPage';
import AlertsPage from './pages/AlertsPage';
import ReportsPage from './pages/ReportsPage';
import UsersPage from './pages/UsersPage';
import SettingsPage from './pages/SettingsPage';
import FieldModePage from './pages/FieldModePage';
import ProjectTemplatesPage from './pages/ProjectTemplatesPage';
import FileVaultPage from './pages/FileVaultPage';
import IntegrationSettingsPage from './pages/IntegrationSettingsPage';
import ClientMessagesPage from './pages/ClientMessagesPage';
import ClientSchedulePage from './pages/ClientSchedulePage';
import ClientSelectionsPage from './pages/ClientSelectionsPage';
import ClientFilesPage from './pages/ClientFilesPage';
import ClientPaymentsPage from './pages/ClientPaymentsPage';
import ClientProjectDetailPage from './pages/ClientProjectDetailPage';
import ClientPortalPreview from './components/ClientPortalPreview';
import ComingSoonPage from './pages/ComingSoonPage';
import CompanyPage from './pages/CompanyPage';
import CP360LeadsPage from './pages/CP360LeadsPage';
import AiEstimatePage from './pages/AiEstimatePage';
import SubProjectsPage from './pages/SubProjectsPage';
import SubProjectDetailPage from './pages/SubProjectDetailPage';
import CustomerDiscoveryListPage from './pages/CustomerDiscoveryListPage';
import DemoSessionFormPage from './pages/DemoSessionFormPage';
import DemoSessionDetailPage from './pages/DemoSessionDetailPage';
import { ClientPreviewProvider, useClientPreview } from './contexts/ClientPreviewContext';
import { supabase } from './lib/supabase';
import { Eye, X } from 'lucide-react';
import AdminVoiceAssistant from './components/AdminVoiceAssistant';

const CONSENT_VERSION = '1.0';

function AppContent() {
  const { user, profile, loading } = useAuth();
  const { preview, exitPreview } = useClientPreview();
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [viewingProjectId, setViewingProjectId] = useState<string | null>(null);
  const [viewingSubProjectId, setViewingSubProjectId] = useState<string | null>(null);
  const [cdView, setCdView] = useState<'list' | 'new' | 'edit' | 'detail'>('list');
  const [cdSessionId, setCdSessionId] = useState<string | null>(null);
  const [convazantInWorkspace, setConvazantInWorkspace] = useState(false);
  const [projectsStatusFilter, setProjectsStatusFilter] = useState<string | undefined>(undefined);
  const [tasksDateFilter, setTasksDateFilter] = useState<'due48' | 'missed' | undefined>(undefined);
  const [tasksStatusFilter, setTasksStatusFilter] = useState<string | undefined>(undefined);
  const [actionBoardFilter, setActionBoardFilter] = useState<'all' | 'needs-review' | 'needs-attention' | 'critical' | 'overdue' | 'due-today' | 'follow-up' | 'decisions' | undefined>(undefined);
  const [actionBoardFocusItemId, setActionBoardFocusItemId] = useState<string | undefined>(undefined);
  const [actionBoardFocusAlertTitle, setActionBoardFocusAlertTitle] = useState<string | undefined>(undefined);
  const [permitsFilter, setPermitsFilter] = useState<string | undefined>(undefined);
  const [viewingProjectTab, setViewingProjectTab]   = useState<string | undefined>(undefined);
  const [viewingTaskId, setViewingTaskId]           = useState<string | undefined>(undefined);
  const [consentLoading, setConsentLoading] = useState(true);
  const [consentRequired, setConsentRequired] = useState(false);

  // Client-only: track active project count for nav label and single-project shortcut
  const [clientProjectCount, setClientProjectCount] = useState<number | null>(null);
  const [clientSingleProjectId, setClientSingleProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !profile) {
      setConsentLoading(false);
      return;
    }
    checkConsent();
    if (profile.role === 'CLIENT') {
      fetchClientProjects();
    }
  }, [user?.id, profile?.id]);

  async function fetchClientProjects() {
    const { data } = await supabase
      .from('projects')
      .select('id')
      .eq('is_archived', false);
    const count = data?.length ?? 0;
    setClientProjectCount(count);
    setClientSingleProjectId(count === 1 ? data![0].id : null);
  }

  async function checkConsent() {
    setConsentLoading(true);
    const { data } = await supabase
      .from('user_consents')
      .select('id,consent_version,is_current')
      .eq('user_id', profile!.id)
      .eq('is_current', true)
      .eq('consent_version', CONSENT_VERSION)
      .maybeSingle();
    setConsentRequired(!data);
    setConsentLoading(false);
  }

  if (loading || consentLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (!user || !profile) {
    return <LoginPage />;
  }

  if (consentRequired) {
    return <ConsentPage onAccepted={() => setConsentRequired(false)} />;
  }

  if (!profile.is_active) {
    return (
      <div className="min-h-screen bg-concrete-50 flex items-center justify-center">
        <div className="bg-white border border-concrete-200 rounded-2xl p-8 max-w-sm text-center shadow-card">
          <p className="text-lg font-bold text-concrete-900 mb-2">Account Disabled</p>
          <p className="text-sm text-concrete-500">Your account has been deactivated. Please contact your administrator.</p>
        </div>
      </div>
    );
  }

  const role = profile.role;
  const isConvazant = role === 'CONVAZANT_SUPER_ADMIN';
  const isDeckarcAdmin = role === 'DECKARC_ADMIN';
  const isAdmin = isConvazant || isDeckarcAdmin;
  const isGCOrAbove = isAdmin || role === 'GENERAL_CONTRACTOR';
  const isFieldUser = isGCOrAbove || role === 'SUBCONTRACTOR';
  const isClient = role === 'CLIENT';

  // CONVAZANT outside workspace: these nav items accidentally route to DECKARC operational pages.
  // Block them until real platform-level pages exist.
  const CONVAZANT_BLOCKED_OUTSIDE_WORKSPACE: Page[] = [
    'action-board', 'tomorrow', 'field-mode', 'templates',
    'daily-updates', 'tasks', 'permits',
  ];

  // cp360-leads is a platform-level page — only available outside workspace (CONVAZANT context)
  const CONVAZANT_BLOCKED_IN_WORKSPACE: Page[] = ['cp360-leads'];

  function navigateTo(page: Page) {
    // Single-project clients: clicking "My Project" opens that project directly
    if (isClient && page === 'projects' && clientSingleProjectId) {
      setViewingProjectId(clientSingleProjectId);
      setCurrentPage('projects');
      return;
    }
    // Clear drill-down filters on normal navigation
    setProjectsStatusFilter(undefined);
    setTasksDateFilter(undefined);
    setTasksStatusFilter(undefined);
    setActionBoardFilter(undefined);
    setActionBoardFocusItemId(undefined);
    setActionBoardFocusAlertTitle(undefined);
    setPermitsFilter(undefined);
    setViewingProjectTab(undefined);
    setViewingTaskId(undefined);
    setCurrentPage(page);
    setViewingProjectId(null);
    setViewingSubProjectId(null);
    setCdView('list');
    setCdSessionId(null);
  }

  function navigateToPermitsFiltered(filter: string) {
    setPermitsFilter(filter);
    setCurrentPage('permits');
    setViewingProjectId(null);
  }

  function navigateToActionBoardFiltered(filter: 'all' | 'needs-review' | 'needs-attention' | 'critical' | 'overdue' | 'due-today' | 'follow-up' | 'decisions') {
    setActionBoardFilter(filter);
    setActionBoardFocusItemId(undefined);
    setActionBoardFocusAlertTitle(undefined);
    setCurrentPage('action-board');
    setViewingProjectId(null);
  }

  function navigateToActionBoardItem(params: {
    focusItemId: string;
    filter: 'all' | 'needs-review' | 'needs-attention' | 'critical' | 'overdue' | 'due-today' | 'follow-up' | 'decisions';
    alertId: string;
    alertTitle: string;
  }) {
    setActionBoardFilter(params.filter);
    setActionBoardFocusItemId(params.focusItemId);
    setActionBoardFocusAlertTitle(params.alertTitle);
    setCurrentPage('action-board');
    setViewingProjectId(null);
  }

  function navigateToProjectsFiltered(statusFilter?: string) {
    setProjectsStatusFilter(statusFilter);
    setTasksDateFilter(undefined);
    setCurrentPage('projects');
    setViewingProjectId(null);
  }

  function navigateToTasksFiltered(filter?: 'due48' | 'missed') {
    setTasksDateFilter(filter);
    setTasksStatusFilter(undefined);
    setProjectsStatusFilter(undefined);
    setCurrentPage('tasks');
    setViewingProjectId(null);
    setViewingSubProjectId(null);
  }

  function navigateToTasksWithStatusFilter(statusFilter: string) {
    setTasksStatusFilter(statusFilter);
    setTasksDateFilter(undefined);
    setProjectsStatusFilter(undefined);
    setCurrentPage('tasks');
    setViewingProjectId(null);
    setViewingSubProjectId(null);
  }

  function viewProject(id: string, tab?: string, taskId?: string) {
    setViewingProjectId(id);
    setViewingProjectTab(tab);
    setViewingTaskId(taskId);
    setCurrentPage('projects');
  }

  function renderContent() {
    // Project detail view — clients get a safe portal view; staff get the full internal view
    if (currentPage === 'projects' && viewingProjectId) {
      if (isClient) {
        const isSingle = clientProjectCount === 1;
        return (
          <ClientProjectDetailPage
            projectId={viewingProjectId}
            backLabel={isSingle ? 'Home' : 'My Projects'}
            onBack={() => {
              setViewingProjectId(null);
              // Single-project clients have no project list to go back to — send to Home
              if (isSingle) setCurrentPage('dashboard');
            }}
          />
        );
      }
      return (
        <ProjectDetailPage
          projectId={viewingProjectId}
          onBack={() => setViewingProjectId(null)}
          onViewProject={(id) => setViewingProjectId(id)}
          initialTab={viewingProjectTab}
          initialTaskId={viewingTaskId}
        />
      );
    }

    // ── CLIENT route guards ──────────────────────────────────────────────
    // Client must never reach internal operational pages.
    if (isClient && ['command-center', 'action-center', 'action-board', 'tomorrow', 'tasks', 'daily-updates', 'permits',
      'alerts', 'field-mode', 'reports', 'users', 'integrations', 'templates', 'files', 'company'].includes(currentPage)) {
      return renderDashboard();
    }

    // ── CONVAZANT outside workspace route guards ─────────────────────────
    // These nav items point to DECKARC operational pages — block until real platform pages exist.
    if (isConvazant && !convazantInWorkspace && CONVAZANT_BLOCKED_OUTSIDE_WORKSPACE.includes(currentPage)) {
      const labels: Partial<Record<Page, string>> = {
        'daily-updates': 'Support Logs',
        'tasks':         'Developer Assistant',
        'permits':       'Access & Requests',
      };
      const label = labels[currentPage] || 'This Section';
      return (
        <ComingSoonPage
          title={`${label} — Coming Soon`}
          description="This platform feature is not yet available. Use &quot;Enter Workspace&quot; on the Platform Dashboard to access DECKARC operational data."
        />
      );
    }

    // ── General role-based guards ────────────────────────────────────────
    // cp360-leads is platform-only; redirect to dashboard if in workspace or non-convazant
    if (currentPage === 'cp360-leads' && (!isConvazant || (isConvazant && convazantInWorkspace && CONVAZANT_BLOCKED_IN_WORKSPACE.includes(currentPage)))) return renderDashboard();
    if (currentPage === 'templates' && !isAdmin) return renderDashboard();
    if ((currentPage === 'reports' || currentPage === 'users' || currentPage === 'company') && !isAdmin) return renderDashboard();
    if (currentPage === 'customer-discovery' && !isConvazant) return renderDashboard();
    if (currentPage === 'field-mode' && !isFieldUser) return renderDashboard();
    if (currentPage === 'files' && isClient) return renderDashboard();
    if (currentPage === 'integrations' && !isAdmin) return renderDashboard();
    if (currentPage === 'ai-estimate' && !isAdmin) return renderDashboard();

    switch (currentPage) {
      case 'dashboard':
        return renderDashboard();
      case 'command-center':
        return <CommandCenterPage onOpenActionCenter={() => setCurrentPage('action-center')} />;
      case 'action-center':
        return <ActionCenterPage onViewProject={viewProject} />;
      case 'action-board':
        return <ActionBoardPage onViewProject={viewProject} initialFilter={actionBoardFilter} focusItemId={actionBoardFocusItemId} focusAlertTitle={actionBoardFocusAlertTitle} />;
      case 'tomorrow':
        return <TomorrowWorkPage onViewProject={viewProject} onNavigateToActionBoard={() => navigateToActionBoardFiltered('critical')} />;
      case 'projects':
        // CLIENT gets a safe project list — no internal fields, no edit controls
        if (isClient) return <ClientProjectsPage onViewProject={viewProject} />;
        return <ProjectsPage onViewProject={viewProject} initialStatusFilter={projectsStatusFilter} />;
      case 'tasks':
        return <TasksPage onViewProject={viewProject} initialDateFilter={tasksDateFilter} initialStatusFilter={tasksStatusFilter} />;
      case 'daily-updates':
        return <DailyUpdatesPage />;
      case 'ai-estimate':
        return <AiEstimatePage />;
      case 'permits':
        return <PermitsInspectionsPage initialTab="permits" initialPermitFilter={permitsFilter} />;
      case 'alerts':
        return <AlertsPage
          onNavigateToActionBoardItem={navigateToActionBoardItem}
          onOpenTaskConversation={(projectId, taskId) => viewProject(projectId, 'tasks', taskId)}
        />;
      case 'reports':
        return <ReportsPage onViewProject={viewProject} />;
      case 'users':
        return <UsersPage />;
      case 'settings':
        return <SettingsPage />;
      case 'field-mode':
        return <FieldModePage />;
      case 'templates':
        return <ProjectTemplatesPage onViewProject={viewProject} />;
      case 'files':
        return <FileVaultPage />;
      case 'integrations':
        return <IntegrationSettingsPage />;
      case 'company':
        return <CompanyPage onViewProject={viewProject} />;
      case 'cp360-leads':
        if (!isConvazant) return renderDashboard();
        return <CP360LeadsPage />;
      case 'customer-discovery': {
        if (!isConvazant) return renderDashboard();
        if (cdView === 'new') {
          return (
            <DemoSessionFormPage
              onBack={() => { setCdView('list'); setCdSessionId(null); }}
              onViewSession={(id) => { setCdSessionId(id); setCdView('detail'); }}
            />
          );
        }
        if (cdView === 'edit' && cdSessionId) {
          return (
            <DemoSessionFormPage
              sessionId={cdSessionId}
              onBack={() => { setCdView('detail'); }}
              onViewSession={(id) => { setCdSessionId(id); setCdView('detail'); }}
            />
          );
        }
        if (cdView === 'detail' && cdSessionId) {
          return (
            <DemoSessionDetailPage
              sessionId={cdSessionId}
              onBack={() => { setCdView('list'); setCdSessionId(null); }}
              onEdit={(id) => { setCdSessionId(id); setCdView('edit'); }}
            />
          );
        }
        return (
          <CustomerDiscoveryListPage
            onNewSession={() => { setCdView('new'); setCdSessionId(null); }}
            onViewSession={(id) => { setCdSessionId(id); setCdView('detail'); }}
            onEditSession={(id) => { setCdSessionId(id); setCdView('edit'); }}
          />
        );
      }
      case 'sub-projects':
        if (viewingSubProjectId) {
          return (
            <SubProjectDetailPage
              projectId={viewingSubProjectId}
              onBack={() => setViewingSubProjectId(null)}
            />
          );
        }
        return (
          <SubProjectsPage
            onViewProject={(id) => setViewingSubProjectId(id)}
          />
        );
      case 'client-messages':
        return <ClientMessagesPage />;
      case 'client-schedule':
        return <ClientSchedulePage />;
      case 'client-selections':
        return <ClientSelectionsPage />;
      case 'client-files':
        return <ClientFilesPage />;
      case 'client-payments':
        return <ClientPaymentsPage />;
      default:
        return renderDashboard();
    }
  }

  function renderDashboard() {
    if (isConvazant && !convazantInWorkspace) {
      return (
        <ConvazantDashboardPage
          onEnterWorkspace={() => setConvazantInWorkspace(true)}
        />
      );
    }
    if (isDeckarcAdmin || (isConvazant && convazantInWorkspace)) {
      return (
        <DashboardPage
          onNavigateToProjects={(statusFilter) => navigateToProjectsFiltered(statusFilter)}
          onNavigateToActionBoard={(filter) => navigateToActionBoardFiltered((filter as Parameters<typeof navigateToActionBoardFiltered>[0]) ?? 'all')}
          onNavigateToTomorrow={() => navigateTo('tomorrow')}
          onNavigateToAlerts={() => navigateTo('alerts')}
          onNavigateToTasks={(filter) => navigateToTasksFiltered(filter as 'due48' | 'missed' | undefined)}
          onNavigateToPermits={(filter) => filter ? navigateToPermitsFiltered(filter) : navigateTo('permits')}
          onViewProject={(id) => viewProject(id)}
          onNavigateToDailyUpdates={() => navigateTo('daily-updates')}
        />
      );
    }
    if (role === 'GENERAL_CONTRACTOR') {
      return (
        <GCDashboardPage
          onNavigateToProjects={() => navigateTo('projects')}
          onNavigateToField={() => navigateTo('field-mode')}
          onNavigateToActionBoard={() => navigateTo('action-board')}
          onNavigateToTomorrow={() => navigateTo('tomorrow')}
        />
      );
    }
    if (role === 'SUBCONTRACTOR') {
      return (
        <SubcontractorDashboardPage
          onNavigateToField={() => navigateTo('field-mode')}
          onNavigateToDailyUpdates={() => navigateTo('daily-updates')}
          onNavigateToActionBoard={() => navigateTo('action-board')}
          onNavigateToTomorrow={() => navigateTo('tomorrow')}
          onNavigateToTasksFiltered={navigateToTasksWithStatusFilter}
        />
      );
    }
    if (isClient) {
      return (
        <ClientDashboardPage
          onNavigateToProjects={() => navigateTo('projects')}
          onNavigateToMessages={() => navigateTo('client-messages')}
          onNavigateToPayments={() => navigateTo('client-payments')}
          onNavigateToSchedule={() => navigateTo('client-schedule')}
          onNavigateToSelections={() => navigateTo('client-selections')}
          onNavigateToFiles={() => navigateTo('client-files')}
        />
      );
    }
    return <DashboardPage onNavigateToProjects={(statusFilter) => navigateToProjectsFiltered(statusFilter)} onNavigateToActionBoard={(filter) => navigateToActionBoardFiltered((filter as Parameters<typeof navigateToActionBoardFiltered>[0]) ?? 'all')} onNavigateToTasks={(filter) => navigateToTasksFiltered(filter as 'due48' | 'missed' | undefined)} onNavigateToPermits={(filter) => filter ? navigateToPermitsFiltered(filter) : navigateTo('permits')} onViewProject={(id) => viewProject(id)} onNavigateToDailyUpdates={() => navigateTo('daily-updates')} />;
  }

  // Dynamic label: "My Project" for single-project clients, "My Projects" for multi
  const clientProjectLabel = isClient
    ? (clientProjectCount === null ? 'My Project' : clientProjectCount > 1 ? 'My Projects' : 'My Project')
    : undefined;

  // DECKARC Admin: render full client portal preview overlay when active
  if (preview.isActive && isDeckarcAdmin) {
    return (
      <ClientPortalPreview
        clientName={preview.clientName ?? 'Client'}
        clientEmail={preview.clientEmail}
        startProjectId={preview.startProjectId}
        onExit={exitPreview}
      />
    );
  }

  return (
    <Layout currentPage={currentPage} onNavigate={navigateTo} clientProjectLabel={clientProjectLabel}>
      {/* CONVAZANT workspace support banner */}
      {isConvazant && convazantInWorkspace && (
        <div className="bg-steel-800 border-b border-steel-700 px-5 py-2.5 flex items-center justify-between gap-4 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Eye className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span className="text-sm font-semibold text-white">
              Viewing DECKARC LLC workspace as CONVAZANT Super Admin
            </span>
            <span className="text-xs text-steel-400">— support/admin access only</span>
          </div>
          <button
            onClick={() => { setConvazantInWorkspace(false); navigateTo('dashboard'); }}
            className="flex items-center gap-1.5 text-xs font-semibold text-steel-300 hover:text-white transition-colors px-2 py-1 rounded hover:bg-steel-700"
          >
            <X className="w-3.5 h-3.5" />
            Exit Workspace
          </button>
        </div>
      )}
      {renderContent()}
      <AdminVoiceAssistant />
    </Layout>
  );
}

export default function App() {
  // Public route: /founding-pilot — no auth required
  if (window.location.pathname === '/founding-pilot') {
    return <FoundingPilotPage />;
  }
  return (
    <AuthProvider>
      <ClientPreviewProvider>
        <AppContent />
      </ClientPreviewProvider>
    </AuthProvider>
  );
}
