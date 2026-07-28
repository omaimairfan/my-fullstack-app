import { useEffect, useMemo, useState } from 'react';
import { Bell, Check, ChevronDown, Clock3, Eye, EyeOff, LayoutDashboard, LogOut, Menu, MoreHorizontal, Plus, Search, Settings, ShieldCheck, Sparkles, Trash2, Users, X } from 'lucide-react';
import { DndContext, PointerSensor, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useSortable } from '@dnd-kit/sortable';
import { io } from 'socket.io-client';
import { validateName, validateEmail, validatePassword, validateConfirmPassword, validateRequired, validateDate, validateMaxLength, passwordStrength } from './validation.js';

const noAutofill = { autoComplete: 'off', readOnly: true, onFocus: e => e.target.removeAttribute('readonly') };
const Required = () => <span className="required-mark" title="Required">*</span>;
function PasswordInput({ value, onChange, ...rest }) {
  const [visible, setVisible] = useState(false);
  return <div className="password-field">
    <input {...rest} type={visible ? 'text' : 'password'} value={value} onChange={onChange}/>
    <button type="button" className="password-toggle" onClick={() => setVisible(v => !v)} tabIndex={-1} aria-label={visible ? 'Hide password' : 'Show password'} title={visible ? 'Hide password' : 'Show password'}>
      {visible ? <EyeOff size={17}/> : <Eye size={17}/>}
    </button>
  </div>;
}
const FieldWarning = ({ message }) => message ? <div className="field-warning">{message}</div> : null;
function PasswordStrengthMeter({ value }) {
  const { checks, label, color, percent } = passwordStrength(value);
  if (!value) return null;
  const reqs = [
    ['length', '8+ characters'],
    ['upper', 'Uppercase letter'],
    ['lower', 'Lowercase letter'],
    ['number', 'Number'],
    ['special', 'Special character']
  ];
  return <div className="password-strength">
    <div className="password-strength-bar"><div className="password-strength-fill" style={{ width: `${percent}%`, background: color }}/></div>
    <span className="password-strength-label" style={{ color }}>{label}</span>
    <ul className="password-requirements">{reqs.map(([key, text]) => <li key={key} className={checks[key] ? 'met' : ''}>{text}</li>)}</ul>
  </div>;
}

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SOCKET = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
const api = async (path, options = {}) => {
  const token = localStorage.getItem('taskflow_token');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  let res;
  try {
    res = await fetch(`${API}${path}`, { ...options, signal: controller.signal, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...options.headers } });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Server is not responding. Make sure the backend and MongoDB are running.');
    throw new Error('Cannot connect to the TaskFlow server. Start it with npm run dev.');
  } finally { clearTimeout(timeout); }
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) { const err = new Error(data?.message || 'Request failed'); err.data = data; err.status = res.status; throw err; }
  return data;
};
const initials = name => name?.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();
const columns = [{ id: 'todo', title: 'To do', color: '#858b98' }, { id: 'progress', title: 'In progress', color: '#635bff' }, { id: 'done', title: 'Done', color: '#20b486' }];
const allowedFiles = ['application/pdf', 'application/zip', 'application/x-zip-compressed', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/msword', 'application/vnd.ms-powerpoint', 'text/plain'];
const readAttachment = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, data: reader.result }); reader.onerror = () => reject(new Error(`Could not read ${file.name}.`)); reader.readAsDataURL(file); });
const validateFiles = files => files.length > 3 ? 'You can attach up to 3 files.' : (files.find(file => !allowedFiles.includes(file.type) || file.size > 4 * 1024 * 1024) ? 'Use PDF, ZIP, DOCX, PPT/PPTX, DOC, or TXT files up to 4 MB each.' : '');
function AttachmentLinks({ attachments = [] }) { return attachments.length ? <div className="attachments">{attachments.map((file, index) => <a key={`${file.name}-${index}`} href={file.data} download={file.name}>📎 {file.name}</a>)}</div> : null; }

function Auth({ onAuth }) {
  const [signup, setSignup] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [adminLogin, setAdminLogin] = useState(false);
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState({});
  const [verifyEmail, setVerifyEmail] = useState('');
  const [code, setCode] = useState('');
  const [info, setInfo] = useState('');
  const [resending, setResending] = useState(false);
  const touch = field => setTouched(t => ({ ...t, [field]: true }));
  const nameError = signup ? validateName(name) : '';
  const emailError = validateEmail(email);
  const passwordError = signup ? validatePassword(password) : validateRequired(password, 'Password');
  const confirmError = signup ? validateConfirmPassword(password, confirm) : '';
  const formValid = !emailError && !passwordError && (!signup || (!nameError && !confirmError));
  const submit = e => {
    e.preventDefault();
    setTouched({ name: true, email: true, password: true, confirm: true });
    if (!formValid) return;
    setLoading(true); setError('');
    const body = signup ? { name: name.trim(), email: email.trim(), password } : { email: email.trim(), password, asAdmin: adminLogin };
    api(`/auth/${signup ? 'signup' : 'login'}`, { method: 'POST', body: JSON.stringify(body) })
      .then(data => {
        if (data.needsVerification) { setVerifyEmail(data.email); setInfo(data.message || 'Enter the code we emailed you.'); return; }
        localStorage.setItem('taskflow_token', data.token); onAuth(data.user);
      })
      .catch(e => {
        if (e.data?.needsVerification) { setVerifyEmail(e.data.email); setInfo(''); setError(e.message); return; }
        setError(e.message);
      })
      .finally(() => setLoading(false));
  };
  const verify = e => {
    e.preventDefault();
    if (!code.trim()) { setError('Enter the 6-digit code.'); return; }
    setLoading(true); setError('');
    api('/auth/verify-email', { method: 'POST', body: JSON.stringify({ email: verifyEmail, code: code.trim() }) })
      .then(data => { localStorage.setItem('taskflow_token', data.token); onAuth(data.user); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };
  const resend = () => {
    setResending(true); setError(''); setInfo('');
    api('/auth/resend-code', { method: 'POST', body: JSON.stringify({ email: verifyEmail }) })
      .then(data => setInfo(data.message || 'A new code has been sent.'))
      .catch(e => setError(e.message))
      .finally(() => setResending(false));
  };
  const switchMode = () => { setSignup(!signup); setAdminLogin(false); setError(''); setTouched({}); setConfirm(''); };
  const backToForm = () => { setVerifyEmail(''); setCode(''); setError(''); setInfo(''); };
  const brand = <section className="auth-brand"><div className="brand"><span><Check size={18}/></span> TaskFlow</div><div className="auth-copy"><div className="eyebrow"><Sparkles size={16}/> Work beautifully</div><h1>Move work forward.<br/>Together.</h1><p>A calm, focused home for your team's projects, priorities, and progress.</p><div className="testimonial">“TaskFlow gives our team clarity without the clutter.”<footer><b>Amelia Hart</b> · Product Lead</footer></div></div><div className="orb orb-one"/><div className="orb orb-two"/></section>;
  if (verifyEmail) {
    return <div className="auth-page">{brand}<main className="auth-form"><div className="form-wrap"><div className="mobile-brand brand"><span><Check size={18}/></span> TaskFlow</div><h2>Verify your email</h2><p>We sent a 6-digit code to <b>{verifyEmail}</b>. Enter it below to activate your account.</p>
      <form onSubmit={verify} noValidate>
        <label>Verification code<Required/>
          <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" inputMode="numeric" maxLength="6" autoFocus required/>
        </label>
        {info && <div className="success">{info}</div>}
        {error && <div className="error">{error}</div>}
        <button className="primary" disabled={loading || code.trim().length !== 6}>{loading ? 'Verifying…' : 'Verify & continue'}</button>
      </form>
      <div className="switch">Didn't get a code? <button onClick={resend} disabled={resending}>{resending ? 'Sending…' : 'Resend code'}</button></div>
      <div className="switch"><button onClick={backToForm}>Back to {signup ? 'sign up' : 'sign in'}</button></div>
    </div></main></div>;
  }
  return <div className="auth-page">{brand}<main className="auth-form"><div className="form-wrap"><div className="mobile-brand brand"><span><Check size={18}/></span> TaskFlow</div><h2>{signup ? 'Create your account' : adminLogin ? 'Admin login' : 'Welcome back'}</h2><p>{signup ? 'Start organizing your team in minutes.' : adminLogin ? 'Sign in directly to manage leads and permissions. On first use, these details create the administrator account.' : 'Enter your details to access your workspace.'}</p>
    <form onSubmit={submit} noValidate>
      {signup && <label className={touched.name && nameError ? 'field-invalid' : ''}>Full name<Required/>
        {touched.name && <FieldWarning message={nameError}/>}
        <input name="name" {...noAutofill} placeholder="Alex Morgan" value={name} onChange={e => setName(e.target.value)} onBlur={() => touch('name')} required/>
      </label>}
      <label className={touched.email && emailError ? 'field-invalid' : ''}>Email address<Required/>
        {touched.email && <FieldWarning message={emailError}/>}
        <input name="email" type="email" {...noAutofill} placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} onBlur={() => touch('email')} required/>
      </label>
      <label className={touched.password && passwordError ? 'field-invalid' : ''}>Password<Required/>
        {touched.password && <FieldWarning message={passwordError}/>}
        <PasswordInput name="password" {...noAutofill} placeholder={signup ? 'At least 8 characters' : 'Your password'} value={password} onChange={e => setPassword(e.target.value)} onBlur={() => touch('password')} required/>
        {signup && <PasswordStrengthMeter value={password}/>}
        {!signup && <span className="field-hint">Enter the password for your account.</span>}
      </label>
      {signup && <label className={touched.confirm && confirmError ? 'field-invalid' : ''}>Confirm password<Required/>
        {touched.confirm && <FieldWarning message={confirmError}/>}
        <PasswordInput name="confirmPassword" {...noAutofill} placeholder="Re-enter your password" value={confirm} onChange={e => setConfirm(e.target.value)} onBlur={() => touch('confirm')} required/>
      </label>}
      {error && <div className="error">{error}</div>}
      <button className="primary" disabled={loading}>{loading ? 'Please wait…' : signup ? 'Create account' : adminLogin ? 'Sign in as admin' : 'Sign in'}</button>
    </form>
    {!signup && <div className="switch"><button className="admin-login-link" onClick={() => { setAdminLogin(value => !value); setError(''); }}>{adminLogin ? '← Back to member login' : 'Login as admin'}</button></div>}
    <div className="switch">{signup ? 'Already have an account?' : 'New to TaskFlow?'} <button onClick={switchMode}>{signup ? 'Sign in' : 'Create an account'}</button></div>
  </div></main></div>;
}

function TaskCard({ task, onEdit, onDelete, readOnly }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id: task._id, data: { task }, disabled: readOnly });
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const canAcknowledge = task.assignee?._id === document.body.dataset.taskflowUser && !task.assignmentAcknowledgedAt;
  const acknowledge = async e => { e.stopPropagation(); try { const updated = await api(`/tasks/${task._id}/acknowledge`, { method: 'POST' }); window.dispatchEvent(new CustomEvent('taskflow:task-acknowledged', { detail: updated })); } catch (error) { window.dispatchEvent(new CustomEvent('taskflow:task-acknowledged', { detail: null, error: error.message })); } };
  const onAcknowledge = () => acknowledge({ stopPropagation() {} });
  return <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), opacity: isDragging ? .45 : 1 }} className="task-card" {...attributes} {...listeners} onDoubleClick={() => onEdit(task)}><div className="card-top"><span className={`priority ${task.priority}`}>{task.priority}</span><div className="card-actions"><button onPointerDown={e => e.stopPropagation()} onClick={() => onEdit(task)}><MoreHorizontal size={18}/></button><button onPointerDown={e => e.stopPropagation()} onClick={() => onDelete(task._id)}><Trash2 size={15}/></button></div></div><h3>{task.title}</h3>{task.description && <p>{task.description}</p>}<AttachmentLinks attachments={task.attachments}/>{canAcknowledge && <button className="acknowledge" onPointerDown={e => e.stopPropagation()} onClick={() => onAcknowledge(task._id)}>Acknowledge & start</button>}{task.assignmentAcknowledgedAt && <small className="acknowledged">✓ Acknowledged {new Date(task.assignmentAcknowledgedAt).toLocaleString()}</small>}<footer><span className={due && due < new Date() && task.status !== 'done' ? 'overdue' : ''}><Clock3 size={14}/>{due ? due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'No date'}</span>{task.assignee ? <span className="avatar" title={task.assignee.name}>{initials(task.assignee.name)}</span> : <span className="unassigned">—</span>}</footer></article>;
}
function Column({ column, tasks, children, canEdit = true, onAdd }) { const { setNodeRef, isOver } = useDroppable({ id: column.id, disabled: !canEdit }); return <section className={`board-column ${isOver ? 'is-over' : ''}`}><header><div><i style={{ background: column.color }}/><b>{column.title}</b><span>{tasks.length}</span></div>{canEdit && <button onClick={() => onAdd?.(column.id)} title={`Add ${column.title} task`}><Plus size={18}/></button>}</header><div ref={setNodeRef} className="card-list">{children}{!tasks.length && <div className="empty-column">{canEdit ? 'Drop a task here' : 'No tasks'}</div>}</div></section>; }

function TaskModal({ task, workspace, onClose, onSave }) {
  const [title, setTitle] = useState(task?.title || '');
  const [dueDate, setDueDate] = useState(task?.dueDate?.slice(0, 10) || '');
  const [touched, setTouched] = useState({});
  const [files, setFiles] = useState([]);
  const [fileError, setFileError] = useState('');
  const touch = field => setTouched(t => ({ ...t, [field]: true }));
  const titleError = validateRequired(title, 'Task title') || validateMaxLength(title, 120, 'Task title');
  const dueDateError = validateDate(dueDate, { label: 'Due date' });
  const submit = async e => {
    e.preventDefault();
    setTouched({ title: true, dueDate: true });
    if (titleError || dueDateError) return;
    const fileProblem = validateFiles(files);
    if (fileProblem) { setFileError(fileProblem); return; }
    const data = Object.fromEntries(new FormData(e.currentTarget));
    data.title = title.trim();
    data.workspace = workspace._id;
    if (!data.assignee) data.assignee = null;
    if (files.length) data.attachments = await Promise.all(files.map(readAttachment));
    onSave(data);
  };
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={e => e.stopPropagation()}><div className="modal-head"><div><h2>{task ? 'Edit task' : 'Create a task'}</h2><p>Keep the details clear and actionable.</p></div><button onClick={onClose}><X/></button></div><form onSubmit={submit} noValidate><label className={touched.title && titleError ? 'field-invalid' : ''}>Task title<Required/>{touched.title && <FieldWarning message={titleError}/>}<input name="title" value={title} onChange={e => setTitle(e.target.value)} onBlur={() => touch('title')} autoFocus required placeholder="What needs to be done?"/></label><label>Description<textarea name="description" defaultValue={task?.description} rows="3" placeholder="Add helpful context…"/></label><div className="form-row"><label>Status<select name="status" defaultValue={task?.status || 'todo'}><option value="todo">To do</option><option value="progress">In progress</option><option value="done">Done</option></select></label><label>Priority<select name="priority" defaultValue={task?.priority || 'medium'}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label></div><div className="form-row"><label className={touched.dueDate && dueDateError ? 'field-invalid' : ''}>Due date{touched.dueDate && <FieldWarning message={dueDateError}/>}<input type="date" name="dueDate" value={dueDate} onChange={e => setDueDate(e.target.value)} onBlur={() => touch('dueDate')}/></label><label>Assignee<select name="assignee" defaultValue={task?.assignee?._id || ''}><option value="">Unassigned</option>{workspace.members?.map(m => <option key={m._id} value={m._id}>{m.name}</option>)}</select></label></div><label>Reference material <small>(PDF, ZIP, DOCX, PPT, DOC or TXT; max 3 files, 4 MB each)</small><input type="file" multiple accept=".pdf,.zip,.doc,.docx,.ppt,.pptx,.txt" onChange={e => { const next = [...e.target.files]; setFiles(next); setFileError(validateFiles(next)); }}/></label>{task?.attachments?.length > 0 && <AttachmentLinks attachments={task.attachments}/>} {fileError && <FieldWarning message={fileError}/>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary">{task ? 'Save changes' : 'Create task'}</button></div></form></div></div>;
}

function CreateWorkspaceForm({ onCreated }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async e => {
    e.preventDefault();
    if (!name.trim()) { setError('Workspace name is required.'); return; }
    setSaving(true); setError('');
    try { onCreated(await api('/workspaces', { method: 'POST', body: JSON.stringify({ name: name.trim() }) })); }
    catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };
  return <form className="create-workspace-form" onSubmit={submit} noValidate><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Marketing Team" required/><button className="primary" disabled={saving}>{saving ? 'Creating…' : 'Create workspace'}</button>{error && <div className="error">{error}</div>}</form>;
}

function TeamModal({ workspace, user, onClose, onUpdated }) {
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const ownerId = workspace?.owner?._id || workspace?.owner;
  const isLead = ownerId === user.id;
  const emailError = validateEmail(email);
  const addMember = async e => {
    e.preventDefault();
    setTouched(true);
    if (emailError) return;
    setSaving(true);
    setError('');
    try {
      const updated = await api(`/workspaces/${workspace._id}/members`, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() })
      });
      onUpdated(updated);
      setEmail('');
      setTouched(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal team-modal" onMouseDown={e => e.stopPropagation()}><div className="modal-head"><div><h2>Team members</h2><p>{isLead ? 'You are the team lead. Add members by their registered email.' : 'Only the team lead can add members and manage tasks.'}</p></div><button onClick={onClose}><X/></button></div>{isLead && <form className="invite-form" onSubmit={addMember} noValidate><label className={touched && emailError ? 'field-invalid' : ''}>Member email<Required/>{touched && <FieldWarning message={emailError}/>}<input type="email" value={email} onChange={e => setEmail(e.target.value)} onBlur={() => setTouched(true)} required placeholder="member@example.com"/></label>{error && <div className="error">{error}</div>}<button className="primary" disabled={saving}>{saving ? 'Adding…' : 'Add member'}</button></form>}<div className="member-list">{workspace?.members?.map(member => { const lead = ownerId === member._id; return <div className="member-row" key={member._id}><span className="avatar large">{initials(member.name)}</span><div><b>{member.name}</b><small>{member.email}</small></div><span className={`role-badge ${lead ? 'lead' : ''}`}>{lead ? 'Lead' : 'Viewer'}</span></div>; })}</div></div></div>;
}

function TeamPortal({ user }) {
  const [open, setOpen] = useState(false);
  const [workspace, setWorkspace] = useState(null);
  useEffect(() => {
    const show = async () => {
      const items = await api('/workspaces');
      const preferredWorkspace = items.find(item => (item.owner?._id || item.owner) === user.id);
      setWorkspace(preferredWorkspace || items[0] || null);
      setOpen(true);
    };
    window.addEventListener('taskflow:team-open', show);
    return () => window.removeEventListener('taskflow:team-open', show);
  }, []);
  if (!open || !workspace) return null;
  return <TeamModal workspace={workspace} user={user} onClose={() => setOpen(false)} onUpdated={setWorkspace}/>;
}

function ChatPortal({ user }) {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const selected = tasks.find(task => task._id === selectedId) || tasks[0] || null;
  useEffect(() => {
    const show = async () => {
      try {
        const items = await api('/tasks');
        setTasks(items);
        setSelectedId(current => items.some(task => task._id === current) ? current : items[0]?._id || '');
        setOpen(true);
      } catch (e) { setError(e.message); }
    };
    window.addEventListener('taskflow:chat-open', show);
    return () => window.removeEventListener('taskflow:chat-open', show);
  }, []);
  const send = async e => {
    e.preventDefault();
    if (!selected || (!text.trim() && !files.length)) return;
    const fileProblem = validateFiles(files);
    if (fileProblem) { setError(fileProblem); return; }
    setSending(true);
    setError('');
    try {
      const attachments = await Promise.all(files.map(readAttachment));
      const updated = await api(`/tasks/${selected._id}/messages`, { method: 'POST', body: JSON.stringify({ text, attachments }) });
      setTasks(items => items.map(task => task._id === updated._id ? updated : task));
      setSelectedId(updated._id);
      setText('');
      setFiles([]);
    } catch (e) { setError(e.message); }
    finally { setSending(false); }
  };
  if (!open) return null;
  return <div className="modal-backdrop" onMouseDown={() => setOpen(false)}><div className="chat-modal" onMouseDown={e => e.stopPropagation()}><div className="chat-sidebar"><div className="chat-title"><div><h2>Task chat</h2><p>Update your lead or team member.</p></div><button onClick={() => setOpen(false)}><X/></button></div>{tasks.length ? tasks.map(task => <button className={selected?._id === task._id ? 'active' : ''} key={task._id} onClick={() => setSelectedId(task._id)}><b>{task.title}</b><small>{task.assignee?.name ? `Assigned to ${task.assignee.name}` : 'Unassigned'} · {task.status}</small></button>) : <div className="empty-chat">No tasks available.</div>}</div><div className="chat-thread">{selected ? <><header><div><h3>{selected.title}</h3><p>{selected.assignee?.name ? `Assigned to ${selected.assignee.name}` : 'Unassigned'}</p></div><span className="role-badge">{selected.status}</span></header><div className="messages">{selected.messages?.length ? selected.messages.map(message => { const mine = message.sender?._id === user.id; return <div className={`message ${mine ? 'mine' : ''}`} key={message._id}><b>{mine ? 'You' : message.sender?.name || 'Member'}</b>{message.text && <p>{message.text}</p>}<AttachmentLinks attachments={message.attachments}/><small>{new Date(message.createdAt).toLocaleString()}</small></div>; }) : <div className="empty-chat">No messages yet. Start the conversation.</div>}</div><form onSubmit={send}><input value={text} onChange={e => setText(e.target.value)} maxLength="1000" placeholder="Write an update…"/><label className="chat-attach">📎<input type="file" multiple accept=".pdf,.zip,.doc,.docx,.ppt,.pptx,.txt" onChange={e => { const next = [...e.target.files]; setFiles(next); setError(validateFiles(next)); }}/></label><button className="primary" disabled={sending || (!text.trim() && !files.length)}>{sending ? 'Sending…' : 'Send'}</button></form>{files.length > 0 && <small className="chat-file-count">{files.length} file(s) ready to send</small>}{error && <div className="error">{error}</div>}</> : <div className="empty-chat">Create a task before starting a chat.</div>}</div></div></div>;
}

function SettingsPortal({ user }) {
  const [open, setOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  const [workspace, setWorkspace] = useState(null);
  const [name, setName] = useState(user.name);
  const [workspaceName, setWorkspaceName] = useState('');
  const [preferences, setPreferences] = useState(user.preferences || { taskAssigned: true, chatMessage: true, theme: 'light' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [touched, setTouched] = useState({});
  const touch = field => setTouched(t => ({ ...t, [field]: true }));
  const ownerId = workspace?.owner?._id || workspace?.owner;
  const isLead = ownerId === currentUser.id;
  const nameError = validateName(name);
  const workspaceNameError = validateRequired(workspaceName, 'Workspace name');
  const currentPasswordError = validateRequired(currentPassword, 'Current password');
  const newPasswordError = validatePassword(newPassword);
  useEffect(() => {
    const show = async () => {
      try {
        const items = await api('/workspaces');
        const preferred = items.find(item => (item.owner?._id || item.owner) === currentUser.id);
        const selected = preferred || items[0] || null;
        setWorkspace(selected);
        setWorkspaceName(selected?.name || '');
        setOpen(true);
      } catch (e) { setError(e.message); }
    };
    window.addEventListener('taskflow:settings-open', show);
    return () => window.removeEventListener('taskflow:settings-open', show);
  }, [currentUser.id, currentUser.role]);
  const showResult = text => { setMessage(text); setError(''); setTimeout(() => setMessage(''), 2500); };
  const saveProfile = async e => {
    e.preventDefault();
    touch('name');
    if (nameError) return;
    try {
      const result = await api('/users/me', { method: 'PATCH', body: JSON.stringify({ name: name.trim(), preferences }) });
      setCurrentUser(result.user);
      document.documentElement.dataset.theme = result.user.preferences?.theme || 'light';
      localStorage.setItem('taskflow_theme', result.user.preferences?.theme || 'light');
      showResult('Personal settings saved.');
    } catch (e) { setError(e.message); }
  };
  const changePassword = async e => {
    e.preventDefault();
    touch('currentPassword'); touch('newPassword');
    if (currentPasswordError || newPasswordError) return;
    const form = e.currentTarget;
    try {
      await api('/users/me/password', { method: 'PATCH', body: JSON.stringify({ currentPassword, newPassword }) });
      form.reset();
      setCurrentPassword(''); setNewPassword('');
      setTouched(t => ({ ...t, currentPassword: false, newPassword: false }));
      showResult('Password changed.');
    } catch (e) { setError(e.message); }
  };
  const saveWorkspace = async e => {
    e.preventDefault();
    touch('workspaceName');
    if (workspaceNameError) return;
    try {
      const updated = await api(`/workspaces/${workspace._id}`, { method: 'PATCH', body: JSON.stringify({ name: workspaceName.trim() }) });
      setWorkspace(updated);
      window.dispatchEvent(new CustomEvent('taskflow:workspace-updated', { detail: updated }));
      showResult('Workspace updated.');
    } catch (e) { setError(e.message); }
  };
  const removeMember = async memberId => {
    if (!confirm('Remove this member from the workspace?')) return;
    try {
      const updated = await api(`/workspaces/${workspace._id}/members/${memberId}`, { method: 'DELETE' });
      setWorkspace(updated);
      showResult('Member removed.');
    } catch (e) { setError(e.message); }
  };
  const transferLead = async memberId => {
    if (!memberId || !confirm('Transfer team leadership to this member? You will become a Viewer.')) return;
    try {
      const updated = await api(`/workspaces/${workspace._id}/owner`, { method: 'PATCH', body: JSON.stringify({ memberId }) });
      setWorkspace(updated);
      window.dispatchEvent(new CustomEvent('taskflow:workspace-updated', { detail: updated }));
      setCurrentUser(value => ({ ...value, role: 'viewer' }));
      showResult('Leadership transferred.');
    } catch (e) { setError(e.message); }
  };
  const leaveWorkspace = async () => {
    if (!confirm('Leave this workspace? You will lose access to its tasks and chat.')) return;
    try {
      await api(`/workspaces/${workspace._id}/leave`, { method: 'DELETE' });
      setOpen(false);
      location.reload();
    } catch (e) { setError(e.message); }
  };
  if (!open) return null;
  return <div className="modal-backdrop" onMouseDown={() => setOpen(false)}><div className="settings-modal" onMouseDown={e => e.stopPropagation()}><header><div><h2>Settings</h2><p>{isLead ? 'Team Lead settings' : 'Viewer settings'}</p></div><button onClick={() => setOpen(false)}><X/></button></header><div className="settings-body"><section><h3>My profile</h3><form className="settings-form" onSubmit={saveProfile} noValidate><label className={touched.name && nameError ? 'field-invalid' : ''}>Full name<Required/>{touched.name && <FieldWarning message={nameError}/>}<input value={name} onChange={e => setName(e.target.value)} onBlur={() => touch('name')} required/></label><label>Email<input value={currentUser.email} disabled/></label><div className="setting-check"><div><b>Task assigned notifications</b><small>Notify me when a task is assigned.</small></div><input type="checkbox" checked={preferences.taskAssigned !== false} onChange={e => setPreferences(value => ({ ...value, taskAssigned: e.target.checked }))}/></div><div className="setting-check"><div><b>Chat notifications</b><small>Notify me about task messages.</small></div><input type="checkbox" checked={preferences.chatMessage !== false} onChange={e => setPreferences(value => ({ ...value, chatMessage: e.target.checked }))}/></div><label>Theme<select value={preferences.theme || 'light'} onChange={e => setPreferences(value => ({ ...value, theme: e.target.value }))}><option value="light">Light</option><option value="dark">Dark</option></select></label><button className="primary">Save personal settings</button></form></section><section><h3>Password</h3>{currentUser.passwordChangeLocked ? <p className="settings-role">Password changes are disabled for your account by the admin.</p> : <form className="settings-form" onSubmit={changePassword} noValidate><label className={touched.currentPassword && currentPasswordError ? 'field-invalid' : ''}>Current password<Required/>{touched.currentPassword && <FieldWarning message={currentPasswordError}/>}<PasswordInput name="currentPassword" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} onBlur={() => touch('currentPassword')} required/></label><label className={touched.newPassword && newPasswordError ? 'field-invalid' : ''}>New password<Required/>{touched.newPassword && <FieldWarning message={newPasswordError}/>}<PasswordInput name="newPassword" value={newPassword} onChange={e => setNewPassword(e.target.value)} onBlur={() => touch('newPassword')} required/><PasswordStrengthMeter value={newPassword}/></label><button className="secondary">Change password</button></form>}</section>{workspace && <section><h3>Workspace</h3><p className="settings-role">Your role: <span className={`role-badge ${isLead ? 'lead' : ''}`}>{isLead ? 'Lead' : 'Viewer'}</span></p>{isLead ? <><form className="settings-form" onSubmit={saveWorkspace} noValidate><label className={touched.workspaceName && workspaceNameError ? 'field-invalid' : ''}>Workspace name<Required/>{touched.workspaceName && <FieldWarning message={workspaceNameError}/>}<input value={workspaceName} onChange={e => setWorkspaceName(e.target.value)} onBlur={() => touch('workspaceName')} required/></label><button className="secondary">Save workspace name</button></form><div className="settings-members"><h4>Manage members</h4>{workspace.members?.map(member => { const lead = ownerId === member._id; return <div className="member-row" key={member._id}><span className="avatar">{initials(member.name)}</span><div><b>{member.name}</b><small>{member.email}</small></div>{lead ? <span className="role-badge lead">Lead</span> : <button className="danger-link" onClick={() => removeMember(member._id)}>Remove</button>}</div>; })}<label>Transfer leadership<select defaultValue="" onChange={e => { transferLead(e.target.value); e.target.value = ''; }}><option value="" disabled>Select member…</option>{workspace.members?.filter(member => member._id !== ownerId).map(member => <option key={member._id} value={member._id}>{member.name}</option>)}</select></label></div></> : <div className="danger-zone"><p>Leaving removes your access to this workspace, tasks, and chat.</p><button className="danger-button" onClick={leaveWorkspace}>Leave workspace</button></div>}</section>}{message && <div className="success">{message}</div>}{error && <div className="error">{error}</div>}</div></div></div>;
}

function AdminModal({ user, onClose }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState('');
  const [needsSetup, setNeedsSetup] = useState(false);
  useEffect(() => { api('/admin/status').then(async status => { setNeedsSetup(status.needsSetup); if (!status.needsSetup) setUsers(await api('/admin/users')); }).catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
  const bootstrap = async () => { if (!confirm('Make your account the first TaskFlow administrator?')) return; setSavingId('bootstrap'); try { await api('/admin/bootstrap', { method: 'POST' }); location.reload(); } catch (e) { setError(e.message); } finally { setSavingId(''); } };
  const update = async (id, patch) => {
    setSavingId(id); setError('');
    try { const updated = await api(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }); setUsers(list => list.map(u => u._id === id ? { ...u, ...updated } : u)); }
    catch (e) { setError(e.message); }
    finally { setSavingId(''); }
  };
  if (!loading && needsSetup) return <div className="modal-backdrop" onMouseDown={onClose}><div className="settings-modal admin-modal" onMouseDown={e => e.stopPropagation()}><header><div><h2>Admin setup</h2><p>Set up the first administrator for this TaskFlow installation.</p></div><button onClick={onClose}><X/></button></header><div className="settings-body"><section><h3>Make yourself administrator</h3><p className="settings-role">After setup, only an admin can give Lead access or lock a member's password changes.</p><button className="primary" onClick={bootstrap} disabled={savingId === 'bootstrap'}>{savingId === 'bootstrap' ? 'Setting up…' : 'Make me admin'}</button></section>{error && <div className="error">{error}</div>}</div></div></div>;
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="settings-modal admin-modal" onMouseDown={e => e.stopPropagation()}><header><div><h2>Admin</h2><p>Grant lead access, lock password changes, or manage other admins.</p></div><button onClick={onClose}><X/></button></header><div className="settings-body">{error && <div className="error">{error}</div>}{loading ? <p>Loading…</p> : <div className="admin-user-list">{users.map(u => <div className="admin-user-row" key={u._id}><div><b>{u.name}</b><small>{u.email}</small>{!u.emailVerified && <small className="unverified"> · unverified</small>}</div><label><input type="checkbox" checked={u.canLead} disabled={savingId === u._id} onChange={e => update(u._id, { canLead: e.target.checked })}/> Lead access</label><label><input type="checkbox" checked={u.passwordChangeLocked} disabled={savingId === u._id} onChange={e => update(u._id, { passwordChangeLocked: e.target.checked })}/> Lock password changes</label><label><input type="checkbox" checked={u.isAdmin} disabled={savingId === u._id || u._id === user.id} onChange={e => update(u._id, { isAdmin: e.target.checked })}/> Admin</label></div>)}</div>}</div></div></div>;
}

function AdminPortal({ user }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener('taskflow:admin-open', show);
    return () => window.removeEventListener('taskflow:admin-open', show);
  }, []);
  if (!open) return null;
  return <AdminModal user={user} onClose={() => setOpen(false)}/>;
}

function Dashboard({ user, onLogout }) {
  const [workspaces, setWorkspaces] = useState([]), [workspace, setWorkspace] = useState(null), [tasks, setTasks] = useState([]), [notifications, setNotifications] = useState([]), [modal, setModal] = useState(false), [teamOpen, setTeamOpen] = useState(false), [editing, setEditing] = useState(null), [query, setQuery] = useState(''), [noticeOpen, setNoticeOpen] = useState(false), [mobileNav, setMobileNav] = useState(false), [toast, setToast] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 7 } }));
  const loadWorkspaces = async () => {
    const ws = await api('/workspaces');
    setWorkspaces(ws);
    const preferredWorkspace = ws.find(item => (item.owner?._id || item.owner) === user.id);
    setWorkspace(preferredWorkspace || ws[0] || null);
  };
  useEffect(() => { loadWorkspaces(); api('/notifications').then(setNotifications); }, []);
  useEffect(() => { if (!workspace) return; api(`/tasks?workspace=${workspace._id}`).then(setTasks); const socket = io(SOCKET); socket.emit('workspace:join', workspace._id); socket.on('task:created', t => setTasks(x => x.some(v => v._id === t._id) ? x : [t, ...x])); socket.on('task:updated', t => setTasks(x => x.map(v => v._id === t._id ? t : v))); socket.on('task:deleted', ({ id }) => setTasks(x => x.filter(v => v._id !== id))); return () => socket.disconnect(); }, [workspace?._id]);
  useEffect(() => {
    const updateWorkspace = event => {
      const updated = event.detail;
      setWorkspaces(items => items.map(item => item._id === updated._id ? updated : item));
      setWorkspace(current => current?._id === updated._id ? updated : current);
    };
    window.addEventListener('taskflow:workspace-updated', updateWorkspace);
    return () => window.removeEventListener('taskflow:workspace-updated', updateWorkspace);
  }, []);
  const save = async data => { try { const updated = await api(editing ? `/tasks/${editing._id}` : '/tasks', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(data) }); setTasks(x => editing ? x.map(t => t._id === updated._id ? updated : t) : [updated, ...x.filter(t => t._id !== updated._id)]); setModal(false); setEditing(null); setToast(editing ? 'Task updated' : 'Task created'); setTimeout(() => setToast(''), 2200); } catch (e) { setToast(e.message); } };
  const remove = async id => { if (!confirm('Delete this task?')) return; await api(`/tasks/${id}`, { method: 'DELETE' }); setTasks(x => x.filter(t => t._id !== id)); };
  const acknowledge = async id => { try { const updated = await api(`/tasks/${id}/acknowledge`, { method: 'POST' }); setTasks(items => items.map(task => task._id === updated._id ? updated : task)); setToast('Task acknowledged — your lead has been notified.'); setTimeout(() => setToast(''), 2600); } catch (e) { setToast(e.message); } };
  const dragEnd = async ({ active, over }) => { if (!over) return; const status = columns.some(c => c.id === over.id) ? over.id : tasks.find(t => t._id === over.id)?.status; const task = tasks.find(t => t._id === active.id); if (task && status && task.status !== status) { setTasks(x => x.map(t => t._id === task._id ? { ...t, status } : t)); try { await api(`/tasks/${task._id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); } catch { setTasks(x => x.map(t => t._id === task._id ? task : t)); } } };
  const filtered = useMemo(() => tasks.filter(t => `${t.title} ${t.description}`.toLowerCase().includes(query.toLowerCase())), [tasks, query]);
  const unread = notifications.filter(n => !n.read).length;
  const isLead = Boolean(workspace && (workspace.owner?._id || workspace.owner) === user.id);
  useEffect(() => {
    document.body.dataset.taskflowUser = user.id;
    const taskAcknowledged = event => {
      if (event.detail) { setTasks(items => items.map(task => task._id === event.detail._id ? event.detail : task)); setToast('Task acknowledged — the lead has been notified.'); }
      else setToast(event.error || 'Could not acknowledge task.');
      setTimeout(() => setToast(''), 2600);
    };
    window.addEventListener('taskflow:task-acknowledged', taskAcknowledged);
    return () => window.removeEventListener('taskflow:task-acknowledged', taskAcknowledged);
  }, [user.id]);
  useEffect(() => {
    document.body.classList.toggle('viewer-mode', Boolean(workspace) && !isLead);
    return () => document.body.classList.remove('viewer-mode');
  }, [workspace?._id, isLead]);
  useEffect(() => {
    const teamLink = [...document.querySelectorAll('aside a')].find(item => item.textContent.trim() === 'Team');
    const activityLink = [...document.querySelectorAll('aside a')].find(item => item.textContent.trim() === 'Activity');
    const settingsLink = [...document.querySelectorAll('aside a')].find(item => item.textContent.trim() === 'Settings');
    const adminLink = [...document.querySelectorAll('aside a')].find(item => item.textContent.trim() === 'Admin panel');
    const openTeam = () => window.dispatchEvent(new Event('taskflow:team-open'));
    const openChat = () => window.dispatchEvent(new Event('taskflow:chat-open'));
    const openSettings = () => window.dispatchEvent(new Event('taskflow:settings-open'));
    const openAdmin = () => window.dispatchEvent(new Event('taskflow:admin-open'));
    teamLink?.addEventListener('click', openTeam);
    activityLink?.addEventListener('click', openChat);
    settingsLink?.addEventListener('click', openSettings);
    adminLink?.addEventListener('click', openAdmin);
    [teamLink, activityLink, settingsLink, adminLink].filter(Boolean).forEach(link => {
      link.setAttribute('role', 'button');
      link.setAttribute('tabindex', '0');
    });
    return () => {
      teamLink?.removeEventListener('click', openTeam);
      activityLink?.removeEventListener('click', openChat);
      settingsLink?.removeEventListener('click', openSettings);
      adminLink?.removeEventListener('click', openAdmin);
    };
  }, []);
  return <div className="app-shell"><aside className={mobileNav ? 'open' : ''}><div className="brand"><span><Check size={18}/></span> TaskFlow</div><button className="close-nav" onClick={() => setMobileNav(false)}><X/></button><nav><a className="active"><LayoutDashboard/> My tasks</a><a><Users/> Team</a><a><Clock3/> Activity</a></nav><div className="side-bottom"><a><ShieldCheck size={18}/> Admin panel</a><a><Settings/> Settings</a><div className="profile"><span className="avatar large">{initials(user.name)}</span><div><b>{user.name}</b><small>{user.email}</small></div><button onClick={onLogout} title="Log out"><LogOut size={17}/></button></div></div></aside><main className="workspace"><header className="topbar"><button className="menu" onClick={() => setMobileNav(true)}><Menu/></button><button className="workspace-picker">{workspace?.name || 'Workspace'} <ChevronDown size={16}/></button><div className="top-actions"><div className="search"><Search size={18}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search tasks…"/></div><div className="notification-wrap"><button className="icon-btn" onClick={async () => { setNoticeOpen(!noticeOpen); if (unread) { await api('/notifications/read', { method: 'PATCH' }); setNotifications(x => x.map(n => ({...n, read: true}))); } }}><Bell size={20}/>{unread > 0 && <i>{unread}</i>}</button>{noticeOpen && <div className="notification-pop"><h3>Notifications</h3>{notifications.length ? notifications.map(n => <div key={n._id}>{n.message}<small>{new Date(n.createdAt).toLocaleString()}</small></div>) : <p>You're all caught up.</p>}</div>}</div><div className="member-stack">{workspace?.members?.slice(0,3).map(m => <span key={m._id} className="avatar">{initials(m.name)}</span>)}</div></div></header><div className="content">{!workspace ? <div className="empty-workspace"><h2>{user.canLead ? 'Create your workspace' : "You're not part of a workspace yet"}</h2><p>{user.canLead ? 'You have lead access — create a workspace to start adding tasks.' : 'Ask your team lead to invite you, or ask an admin to grant you lead access so you can create your own workspace.'}</p>{user.canLead && <CreateWorkspaceForm onCreated={ws => { setWorkspaces(list => [...list, ws]); setWorkspace(ws); }}/>}</div> : <><div className="page-title"><div><span className="eyebrow">MY WORKSPACE</span><h1>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {user.name.split(' ')[0]} <span>👋</span></h1><p>Here’s what your team is working on today.</p></div><button className="primary add-task" onClick={() => { setEditing(null); setModal(true); }}><Plus size={18}/> Add task</button></div><div className="stats"><div><span>All tasks</span><b>{tasks.length}</b></div><div><span>In progress</span><b>{tasks.filter(t => t.status === 'progress').length}</b></div><div><span>Completed</span><b>{tasks.filter(t => t.status === 'done').length}</b></div><div><span>Due soon</span><b>{tasks.filter(t => t.dueDate && new Date(t.dueDate) - new Date() < 3*864e5 && new Date(t.dueDate) > new Date()).length}</b></div></div><DndContext sensors={sensors} onDragEnd={dragEnd}><div className="board">{columns.map(col => { const list = filtered.filter(t => t.status === col.id); return <Column key={col.id} column={col} tasks={list}>{list.map(t => <TaskCard key={t._id} task={t} onEdit={t => { setEditing(t); setModal(true); }} onDelete={remove}/>)}</Column>; })}</div></DndContext></>}</div></main>{modal && <TaskModal task={editing} workspace={workspace} onClose={() => { setModal(false); setEditing(null); }} onSave={save}/>} {toast && <div className="toast">{toast}</div>}</div>;
}

export default function App() { const hasToken = Boolean(localStorage.getItem('taskflow_token')); const [user, setUser] = useState(null), [loading, setLoading] = useState(hasToken); useEffect(() => { if (!hasToken) return; api('/auth/me').then(x => { setUser(x.user); document.documentElement.dataset.theme = x.user.preferences?.theme || localStorage.getItem('taskflow_theme') || 'light'; }).catch(() => localStorage.removeItem('taskflow_token')).finally(() => setLoading(false)); }, []); if (loading) return <div className="loader"><div className="brand"><span><Check/></span> TaskFlow</div></div>; if (!user) return <Auth onAuth={setUser}/>; return <><Dashboard user={user} onLogout={() => { localStorage.removeItem('taskflow_token'); setUser(null); }}/><TeamPortal user={user}/><ChatPortal user={user}/><SettingsPortal user={user}/><AdminPortal user={user}/></>; }
