
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createClient, User } from '@supabase/supabase-js';
import { ViewType, Task, Project, TimelineItemType, Profile, AppLockSettings } from './types';
import Header from './components/Layout/Header';
import BottomNav from './components/Layout/BottomNav';
import TimelineView from './components/Timeline/TimelineView';
import BoardView from './components/Board/BoardView';
import UnplannedView from './components/Unplanned/UnplannedView';
import WorkspaceView from './components/Workspace/WorkspaceView';
import FAB from './components/UI/FAB';
import TaskModal from './components/UI/TaskModal';
import ProjectModal from './components/UI/ProjectModal';
import ProfileModal from './components/UI/ProfileModal';
import SearchBar from './components/UI/SearchBar';
import AuthScreen from './components/Auth/AuthScreen';
import ConfirmModal from './components/UI/ConfirmModal';
import ReminderPopup from './components/UI/ReminderPopup';

const supabaseUrl = 'https://vvqkjwuzlygdzpvpgcos.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2cWtqd3V6bHlnZHpwdnBnY29zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3OTUzMDUsImV4cCI6MjA4NTM3MTMwNX0.NbQXsnja0Vg4EOLOtO8VdoRkbkffMfcZbzrccibAVnM';
export const supabase = createClient(supabaseUrl, supabaseKey);

const getLocalDateString = (date = new Date()) => {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [activeView, setActiveView] = useState<ViewType>(ViewType.TIMELINE);
  
  const [tasks, setTasks] = useState<Task[]>(() => JSON.parse(localStorage.getItem('taskito_tasks') || '[]'));
  const [projects, setProjects] = useState<Project[]>(() => JSON.parse(localStorage.getItem('taskito_projects') || '[]'));
  const [profile, setProfile] = useState<Profile>(() => JSON.parse(localStorage.getItem('taskito_profile') || '{"name": "Member", "email": "", "avatar": null}'));
  
  const [appLock, setAppLock] = useState<AppLockSettings>({ enabled: false, pin: null, timeoutMinutes: 1, lastUnlockedAt: null });
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('taskito_dark') === 'true');
  const [reminderTone, setReminderTone] = useState(() => localStorage.getItem('taskito_tone') || 'louder');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(getLocalDateString());
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [newType, setNewType] = useState<TimelineItemType>('task');
  const [isBigNoteMode, setIsBigNoteMode] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'todo' | 'upcoming'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [activeReminder, setActiveReminder] = useState<Task | null>(null);
  const [confirmState, setConfirmState] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void } | null>(null);

  const alarmAudio = useRef<HTMLAudioElement | null>(null);
  const successAudio = useRef<HTMLAudioElement | null>(null);
  const firedReminders = useRef<Set<string>>(new Set());

  useEffect(() => { localStorage.setItem('taskito_tasks', JSON.stringify(tasks)); }, [tasks]);
  useEffect(() => { localStorage.setItem('taskito_projects', JSON.stringify(projects)); }, [projects]);
  useEffect(() => { localStorage.setItem('taskito_profile', JSON.stringify(profile)); }, [profile]);

  const filteredTasks = tasks.filter(t => {
    const query = searchQuery.toLowerCase();
    return (
      t.title.toLowerCase().includes(query) ||
      (t.description || '').toLowerCase().includes(query) ||
      (t.details || '').toLowerCase().includes(query)
    );
  });

  // Request Notification Permissions on start
  useEffect(() => {
    if ("Notification" in window) {
      if (Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
      }
    }
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        setActiveView(ViewType.TIMELINE);
      }
      setIsLoading(false);
    };
    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session) setActiveView(ViewType.TIMELINE);
      else { setTasks([]); setProjects([]); localStorage.clear(); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const syncWithCloud = async () => {
    if (!user || !navigator.onLine) return;
    try {
      if (tasks.length > 0) await supabase.from('tasks').upsert(tasks.map(t => ({ ...t, user_id: user.id })));
      if (projects.length > 0) await supabase.from('projects').upsert(projects.map(p => ({ ...p, user_id: user.id })));
      await supabase.from('profiles').upsert([{ ...profile, id: user.id }]);
    } catch (err) {}
  };

  useEffect(() => {
    window.addEventListener('online', syncWithCloud);
    return () => window.removeEventListener('online', syncWithCloud);
  }, [tasks, projects, profile, user]);

  const loadData = async () => {
    if (!user || !navigator.onLine) return;
    try {
      const [{ data: tData }, { data: pData }, { data: profData }] = await Promise.all([
        supabase.from('tasks').select('*').eq('user_id', user.id),
        supabase.from('projects').select('*').eq('user_id', user.id),
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      ]);
      if (tData) setTasks(tData);
      if (pData) setProjects(pData);
      if (profData) setProfile({ name: profData.name, email: profData.email, avatar: profData.avatar });
    } catch (err) {}
  };

  useEffect(() => { if (user) loadData(); }, [user]);

  useEffect(() => {
    successAudio.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3');
    alarmAudio.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    if (alarmAudio.current) alarmAudio.current.loop = true;
  }, []);

  useEffect(() => {
    const check = () => {
      const now = new Date();
      const nowDate = getLocalDateString(now);
      const nowMin = now.getHours() * 60 + now.getMinutes();
      tasks.forEach(t => {
        if (!t.date || t.completed || !t.time || t.reminderMinutes === undefined) return;
        const [h, m] = t.time.split(':').map(Number);
        const triggerMin = (h * 60 + m) - t.reminderMinutes;
        
        // Match current minute exactly
        if (t.date === nowDate && nowMin === triggerMin) {
          const key = `${t.id}-${triggerMin}-${nowDate}`;
          if (!firedReminders.current.has(key)) {
            firedReminders.current.add(key);
            triggerReminder(t);
          }
        }
      });
    };
    const interval = setInterval(check, 1000); 
    return () => clearInterval(interval);
  }, [tasks]);

  const triggerReminder = (task: Task) => {
    // Show UI Popup
    setActiveReminder(task);

    // Show System Notification (Works in background if browser process lives)
    if ("Notification" in window && Notification.permission === "granted") {
      navigator.serviceWorker.ready.then(registration => {
        // Fix for NotificationOptions: cast to any to avoid property error for 'vibrate' in certain TS environments
        registration.showNotification("Think Easy Reminder", {
          body: `${task.title} - Due at ${task.time}`,
          icon: 'https://cdn-icons-png.flaticon.com/512/906/906334.png',
          vibrate: [200, 100, 200],
          tag: task.id, // Prevent duplicate notifications for same task
          requireInteraction: true // Keep notification until user interacts
        } as any);
      });
    }

    if (alarmAudio.current) { alarmAudio.current.currentTime = 0; alarmAudio.current.play().catch(() => {}); }
    if ("vibrate" in navigator) navigator.vibrate([800, 200, 800, 200, 800, 200, 800]);
  };

  const handleDismissReminder = () => {
    setActiveReminder(null);
    if (alarmAudio.current) { alarmAudio.current.pause(); alarmAudio.current.currentTime = 0; }
    if ("vibrate" in navigator) navigator.vibrate(0);
  };

  const handleToggleTask = async (id: string) => {
    const t = tasks.find(x => x.id === id);
    if (t) {
      const newStatus = !t.completed;
      if (newStatus && successAudio.current) { successAudio.current.currentTime = 0; successAudio.current.play().catch(() => {}); }
      setTasks(prev => prev.map(item => item.id === id ? { ...item, completed: newStatus } : item));
      if (navigator.onLine) {
        await supabase.from('tasks').update({ completed: newStatus }).eq('id', id);
      }
    }
  };

  const handleSaveTask = async (data: Partial<Task>) => {
    if (!user) return;
    let newTasks;
    if (editingTask) {
      newTasks = tasks.map(t => t.id === editingTask.id ? { ...t, ...data } : t);
      if (navigator.onLine) await supabase.from('tasks').update(data).eq('id', editingTask.id);
    } else {
      const newTask = { ...data, id: crypto.randomUUID(), user_id: user.id, createdAt: Date.now(), completed: false } as Task;
      newTasks = [newTask, ...tasks];
      if (navigator.onLine) await supabase.from('tasks').insert([newTask]);
    }
    setTasks(newTasks);
    setIsTaskModalOpen(false);
    setEditingTask(null);
  };

  const handleReorderProjects = async (newOrder: Project[]) => {
    setProjects(newOrder);
    if (user && navigator.onLine) {
      await supabase.from('projects').upsert(newOrder.map(p => ({ ...p, user_id: user.id })));
    }
  };

  useEffect(() => {
    const root = window.document.documentElement;
    if (darkMode) root.classList.add('dark'); else root.classList.remove('dark');
    localStorage.setItem('taskito_dark', String(darkMode));
  }, [darkMode]);

  if (isLoading) return <div className="h-screen flex items-center justify-center bg-white dark:bg-[#0a0a0a]"><div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>;
  if (!user) return <AuthScreen initialMode={authMode} onModeChange={setAuthMode} />;

  return (
    <div className="flex flex-col h-full w-full max-w-md bg-white dark:bg-[#121212] shadow-2xl relative overflow-hidden transition-colors mx-auto">
      <Header activeView={activeView} darkMode={darkMode} onToggleDarkMode={() => setDarkMode(!darkMode)} onSearchClick={() => setIsSearchOpen(true)} />
      {isSearchOpen && <SearchBar value={searchQuery} onChange={setSearchQuery} onClose={() => {setSearchQuery(''); setIsSearchOpen(false);}} />}
      
      <main className="flex-1 overflow-y-auto scrollbar-hide pb-20">
        {activeView === ViewType.TIMELINE && <TimelineView tasks={filteredTasks} selectedDate={selectedDate} setSelectedDate={setSelectedDate} onToggle={handleToggleTask} onDelete={id => setConfirmState({ isOpen: true, title: 'Delete Item?', message: 'Permanent loss.', onConfirm: async () => { setTasks(prev => prev.filter(t => t.id !== id)); if (navigator.onLine) await supabase.from('tasks').delete().eq('id', id); setConfirmState(null); } })} onEdit={t => {setEditingTask(t); setIsTaskModalOpen(true);}} upcomingCount={tasks.filter(t => t.date && t.date > getLocalDateString() && !t.completed).length} todoCount={tasks.filter(t => t.date === selectedDate && !t.completed).length} unplannedCount={tasks.filter(t => !t.date).length} profileName={profile.name} activeFilter={timelineFilter} onFilterChange={setTimelineFilter} onSwitchToUnplanned={() => setActiveView(ViewType.UNPLANNED)} />}
        {activeView === ViewType.BOARD && <BoardView tasks={filteredTasks} projects={projects} onToggle={handleToggleTask} onEdit={t => {setEditingTask(t); setIsTaskModalOpen(true);}} onEditProject={p => {setEditingProject(p); setIsProjectModalOpen(true);}} onDeleteProject={id => setConfirmState({ isOpen: true, title: 'Delete Project?', message: 'Linked tasks will be unscheduled.', onConfirm: async () => { setProjects(prev => prev.filter(p => p.id !== id)); if (navigator.onLine) await supabase.from('projects').delete().eq('id', id); setConfirmState(null); } })} onAddProject={() => {setEditingProject(null); setIsProjectModalOpen(true);}} onReorderProjects={handleReorderProjects} />}
        {activeView === ViewType.UNPLANNED && <UnplannedView tasks={filteredTasks} onToggle={handleToggleTask} onEdit={t => {setEditingTask(t); setIsTaskModalOpen(true);}} onDelete={id => setConfirmState({ isOpen: true, title: 'Delete Item?', message: 'Permanent loss.', onConfirm: async () => { setTasks(prev => prev.filter(t => t.id !== id)); if (navigator.onLine) await supabase.from('tasks').delete().eq('id', id); setConfirmState(null); } })} onAssignDate={async (id, d) => { setTasks(prev => prev.map(t => t.id === id ? {...t, date: d} : t)); if (navigator.onLine) await supabase.from('tasks').update({ date: d }).eq('id', id); }} onAddTask={() => {setNewType('task'); setIsTaskModalOpen(true);}} onAddNote={() => {setNewType('note'); setIsTaskModalOpen(true);}} />}
        {activeView === ViewType.WORKSPACE && <WorkspaceView projects={projects} setProjects={setProjects} notesCount={tasks.filter(t => t.type === 'note').length} reminderTone={reminderTone} setReminderTone={setReminderTone} profile={profile} onEditProfile={() => setIsProfileModalOpen(true)} appLock={appLock} setAppLock={setAppLock} onSignOut={() => setConfirmState({ isOpen: true, title: 'Sign Out?', message: 'Are you sure?', onConfirm: async () => { setAuthMode('signin'); await supabase.auth.signOut(); localStorage.clear(); setConfirmState(null); } })} onDeleteAccount={() => setConfirmState({ isOpen: true, title: 'Delete Account?', message: 'Permanent loss.', onConfirm: async () => { if (user) await supabase.rpc('delete_user', { user_id: user.id }); await supabase.auth.signOut(); localStorage.clear(); } })} />}
      </main>

      <FAB onAddTask={() => {setNewType('task'); setEditingTask(null); setIsTaskModalOpen(true);}} onAddNote={() => {setNewType('note'); setEditingTask(null); setIsTaskModalOpen(true);}} onAddBigNote={() => {setNewType('note'); setIsBigNoteMode(true); setEditingTask(null); setIsTaskModalOpen(true);}} />
      <BottomNav activeView={activeView} setActiveView={setActiveView} />
      
      {isTaskModalOpen && <TaskModal task={editingTask} projects={projects} onClose={() => {setIsTaskModalOpen(false); setEditingTask(null); setIsBigNoteMode(false);}} onSave={handleSaveTask} onDelete={() => editingTask && setConfirmState({ isOpen: true, title: 'Delete?', message: 'Confirm deletion', onConfirm: async () => { setTasks(prev => prev.filter(t => t.id !== editingTask.id)); if (navigator.onLine) await supabase.from('tasks').delete().eq('id', editingTask.id); setIsTaskModalOpen(false); setConfirmState(null); } })} defaultDate={selectedDate} forceType={newType} isBigNoteInitial={isBigNoteMode} />}
      {isProjectModalOpen && <ProjectModal project={editingProject} onClose={() => setIsProjectModalOpen(false)} onSave={async p => { if(editingProject) { setProjects(prev => prev.map(x => x.id === editingProject.id ? {...x, ...p} : x)); if (navigator.onLine) await supabase.from('projects').update(p).eq('id', editingProject.id); } else { const nP = {...p, id: crypto.randomUUID(), user_id: user.id, progress: 0} as Project; setProjects(prev => [...prev, nP]); if (navigator.onLine) await supabase.from('projects').insert([nP]); } setIsProjectModalOpen(false); }} />}
      {isProfileModalOpen && <ProfileModal profile={profile} onClose={() => setIsProfileModalOpen(false)} onSave={async p => { setProfile(p); if (navigator.onLine) await supabase.from('profiles').upsert([{...p, id: user.id}]); setIsProfileModalOpen(false); }} />}
      {confirmState?.isOpen && <ConfirmModal title={confirmState.title} message={confirmState.message} onConfirm={confirmState.onConfirm} onCancel={() => setConfirmState(null)} />}
      {activeReminder && <ReminderPopup task={activeReminder} onDismiss={handleDismissReminder} onView={() => { setEditingTask(activeReminder); setIsTaskModalOpen(true); handleDismissReminder(); }} />}
    </div>
  );
};

export default App;
