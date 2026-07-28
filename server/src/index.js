import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { Server } from 'socket.io';
import { User, Workspace, Task, Notification } from './models.js';
import { auth, workspaceMember, requireAdmin } from './auth.js';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
});
const genCode = () => String(Math.floor(100000 + Math.random() * 900000));
const sendVerificationEmail = (to, code) => transporter.sendMail({
  from: `TaskFlow <${process.env.GMAIL_USER}>`,
  to,
  subject: 'Verify your TaskFlow account',
  html: `<div style="font-family:sans-serif;max-width:420px"><h2 style="margin:0 0 12px">Verify your email</h2><p>Use this code to finish creating your TaskFlow account:</p><p style="font:800 32px monospace;letter-spacing:6px;margin:18px 0">${code}</p><p style="color:#777">This code expires in 15 minutes. If you didn't request this, you can ignore this email.</p></div>`
});

const app = express();
const server = http.createServer(app);
const origins = (process.env.CLIENT_URL || 'http://localhost:5173').split(',');
const io = new Server(server, { cors: { origin: origins } });
app.use(cors({ origin: origins }));
app.use(express.json({ limit: '12mb' }));

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const strongPasswordError = password => {
  if (typeof password !== 'string' || !password) return 'Password is required.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[a-z]/.test(password)) return 'Password needs at least one lowercase letter.';
  if (!/[A-Z]/.test(password)) return 'Password needs at least one uppercase letter.';
  if (!/[0-9]/.test(password)) return 'Password needs at least one number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password needs at least one special character.';
  return '';
};
const publicUser = user => ({ id: user._id, name: user.name, email: user.email, role: user.role || 'lead', avatar: user.avatar, isAdmin: Boolean(user.isAdmin), canLead: Boolean(user.canLead), passwordChangeLocked: Boolean(user.passwordChangeLocked), preferences: user.preferences || { taskAssigned: true, chatMessage: true, theme: 'light' } });
const tokenFor = user => jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
const notificationEnabled = async (userId, key) => {
  const user = await User.findById(userId).select(`preferences.${key}`);
  return user?.preferences?.[key] !== false;
};
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'application/pdf', 'application/zip', 'application/x-zip-compressed',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword', 'application/vnd.ms-powerpoint', 'text/plain'
]);
const attachmentError = attachments => {
  if (attachments === undefined) return '';
  if (!Array.isArray(attachments) || attachments.length > 3) return 'You can attach up to 3 files.';
  for (const file of attachments) {
    if (!file || typeof file.name !== 'string' || !file.name.trim() || file.name.length > 160 ||
      typeof file.type !== 'string' || !ALLOWED_ATTACHMENT_TYPES.has(file.type) ||
      !Number.isInteger(file.size) || file.size < 1 || file.size > 4 * 1024 * 1024 ||
      typeof file.data !== 'string' || !file.data.startsWith('data:')) return 'Attachments must be PDF, ZIP, DOCX, PPT/PPTX, DOC, or TXT files up to 4 MB each.';
  }
  return '';
};

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.post('/api/auth/signup', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ message: 'Name is required.' });
    if (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) return res.status(400).json({ message: 'Enter a valid email address.' });
    const passwordError = strongPasswordError(password);
    if (passwordError) return res.status(400).json({ message: passwordError });
    if (await User.exists({ email: email.toLowerCase() })) return res.status(409).json({ message: 'Email already registered.' });
    const code = genCode();
    const bootstrapAdmin = process.env.ADMIN_EMAIL && email.trim().toLowerCase() === process.env.ADMIN_EMAIL.trim().toLowerCase();
    const user = await User.create({
      name, email: email.toLowerCase(), password: await bcrypt.hash(password, 12),
      emailVerified: false, verificationCode: code, verificationExpires: new Date(Date.now() + 15 * 60 * 1000),
      isAdmin: Boolean(bootstrapAdmin), canLead: Boolean(bootstrapAdmin)
    });
    try {
      await sendVerificationEmail(user.email, code);
    } catch (mailErr) {
      console.error('Verification email failed:', mailErr);
      if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
        console.warn(`GMAIL_USER/GMAIL_APP_PASSWORD not set — verification code for ${user.email} is: ${code}`);
      }
    }
    res.status(201).json({ needsVerification: true, email: user.email, message: 'We sent a 6-digit code to your email. Enter it to verify your account.' });
  } catch (e) { next(e); }
});
app.post('/api/auth/verify-email', async (req, res, next) => {
  try {
    const { email, code } = req.body;
    if (typeof email !== 'string' || typeof code !== 'string' || !code.trim()) return res.status(400).json({ message: 'Email and verification code are required.' });
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'Account not found.' });
    if (user.emailVerified) return res.status(400).json({ message: 'This email is already verified.' });
    if (!user.verificationCode || user.verificationCode !== code.trim()) return res.status(400).json({ message: 'Incorrect verification code.' });
    if (!user.verificationExpires || user.verificationExpires < new Date()) return res.status(400).json({ message: 'This code has expired. Please request a new one.' });
    user.emailVerified = true;
    user.verificationCode = undefined;
    user.verificationExpires = undefined;
    await user.save();
    res.json({ token: tokenFor(user), user: publicUser(user) });
  } catch (e) { next(e); }
});
app.post('/api/auth/resend-code', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (typeof email !== 'string' || !email.trim()) return res.status(400).json({ message: 'Email is required.' });
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'Account not found.' });
    if (user.emailVerified) return res.status(400).json({ message: 'This email is already verified.' });
    const code = genCode();
    user.verificationCode = code;
    user.verificationExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();
    try {
      await sendVerificationEmail(user.email, code);
    } catch (mailErr) {
      console.error('Verification email failed:', mailErr);
      if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
        console.warn(`GMAIL_USER/GMAIL_APP_PASSWORD not set — verification code for ${user.email} is: ${code}`);
      }
    }
    res.json({ ok: true, message: 'A new code has been sent to your email.' });
  } catch (e) { next(e); }
});
app.post('/api/auth/login', async (req, res, next) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    let user = await User.findOne({ email });
    const wantsAdminLogin = Boolean(req.body.asAdmin);
    const hasAdmin = await User.exists({ isAdmin: true });
    // On a fresh install, the Admin Login form creates the first admin directly.
    // No regular account or separate setup screen is required.
    if (wantsAdminLogin && !hasAdmin && !user) {
      if (!EMAIL_REGEX.test(email || '')) return res.status(400).json({ message: 'Enter a valid admin email address.' });
      const passwordError = strongPasswordError(req.body.password);
      if (passwordError) return res.status(400).json({ message: passwordError });
      user = await User.create({ name: 'Administrator', email, password: await bcrypt.hash(req.body.password, 12), emailVerified: true, isAdmin: true, canLead: true, role: 'lead' });
    }
    if (!user || !(await bcrypt.compare(req.body.password || '', user.password))) return res.status(401).json({ message: 'Invalid email or password.' });
    if (!user.emailVerified) return res.status(403).json({ needsVerification: true, email: user.email, message: 'Please verify your email before logging in.' });
    if (wantsAdminLogin && !user.isAdmin && !hasAdmin) {
      user.isAdmin = true; user.canLead = true; user.role = 'lead'; await user.save();
    }
    if (wantsAdminLogin && !user.isAdmin) return res.status(403).json({ message: 'This account does not have administrator access.' });
    res.json({ token: tokenFor(user), user: publicUser(user) });
  } catch (e) { next(e); }
});
app.get('/api/auth/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));
app.patch('/api/users/me', auth, async (req, res, next) => {
  try {
    if (req.body.name !== undefined) {
      const name = req.body.name.trim();
      if (!name) return res.status(400).json({ message: 'Name is required.' });
      req.user.name = name;
    }
    if (req.body.avatar !== undefined) req.user.avatar = req.body.avatar.trim();
    if (req.body.preferences) {
      if (!req.user.preferences) req.user.preferences = {};
      const { taskAssigned, chatMessage, theme } = req.body.preferences;
      if (typeof taskAssigned === 'boolean') req.user.preferences.taskAssigned = taskAssigned;
      if (typeof chatMessage === 'boolean') req.user.preferences.chatMessage = chatMessage;
      if (['light', 'dark'].includes(theme)) req.user.preferences.theme = theme;
    }
    await req.user.save();
    res.json({ user: publicUser(req.user) });
  } catch (e) { next(e); }
});
app.patch('/api/users/me/password', auth, async (req, res, next) => {
  try {
    if (req.user.passwordChangeLocked) return res.status(403).json({ message: 'Password changes are disabled for your account by the admin.' });
    const { currentPassword, newPassword } = req.body;
    const storedUser = await User.findById(req.user._id);
    if (!await bcrypt.compare(currentPassword || '', storedUser.password)) return res.status(400).json({ message: 'Current password is incorrect.' });
    const passwordError = strongPasswordError(newPassword);
    if (passwordError) return res.status(400).json({ message: passwordError });
    storedUser.password = await bcrypt.hash(newPassword, 12);
    await storedUser.save();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.get('/api/workspaces', auth, async (req, res, next) => {
  try { res.json(await Workspace.find({ members: req.user._id }).populate('members', 'name email avatar').sort({ createdAt: 1, _id: 1 })); } catch (e) { next(e); }
});
app.post('/api/workspaces', auth, async (req, res, next) => {
  try {
    if (!req.user.canLead) return res.status(403).json({ message: 'Ask an admin to grant you lead access before creating a workspace.' });
    const name = req.body.name?.trim();
    if (!name) return res.status(400).json({ message: 'Workspace name is required.' });
    res.status(201).json(await Workspace.create({ name, owner: req.user._id, members: [req.user._id] }));
  } catch (e) { next(e); }
});
app.post('/api/workspaces/:workspaceId/members', auth, workspaceMember, async (req, res, next) => {
  try {
    if (!req.workspace.owner.equals(req.user._id)) return res.status(403).json({ message: 'Only the team lead can invite members.' });
    if (typeof req.body.email !== 'string' || !EMAIL_REGEX.test(req.body.email.trim())) return res.status(400).json({ message: 'Enter a valid email address.' });
    const member = await User.findOne({ email: req.body.email?.toLowerCase() });
    if (!member) return res.status(404).json({ message: 'Ask this person to create an account first.' });
    if (member._id.equals(req.workspace.owner)) return res.status(400).json({ message: 'The team lead is already in this workspace.' });
    member.role = 'viewer';
    await member.save();
    await Workspace.findByIdAndUpdate(req.workspace._id, { $addToSet: { members: member._id } });
    res.json(await Workspace.findById(req.workspace._id).populate('members', 'name email avatar'));
  } catch (e) { next(e); }
});
app.patch('/api/workspaces/:workspaceId', auth, workspaceMember, async (req, res, next) => {
  try {
    if (!req.workspace.owner.equals(req.user._id)) return res.status(403).json({ message: 'Only the team lead can update workspace settings.' });
    const name = req.body.name?.trim();
    if (!name) return res.status(400).json({ message: 'Workspace name is required.' });
    req.workspace.name = name;
    await req.workspace.save();
    res.json(await Workspace.findById(req.workspace._id).populate('members', 'name email avatar role'));
  } catch (e) { next(e); }
});
app.delete('/api/workspaces/:workspaceId/members/:memberId', auth, workspaceMember, async (req, res, next) => {
  try {
    if (!req.workspace.owner.equals(req.user._id)) return res.status(403).json({ message: 'Only the team lead can remove members.' });
    if (req.workspace.owner.equals(req.params.memberId)) return res.status(400).json({ message: 'Transfer leadership before removing the lead.' });
    await Workspace.findByIdAndUpdate(req.workspace._id, { $pull: { members: req.params.memberId } });
    res.json(await Workspace.findById(req.workspace._id).populate('members', 'name email avatar role'));
  } catch (e) { next(e); }
});
app.patch('/api/workspaces/:workspaceId/owner', auth, workspaceMember, async (req, res, next) => {
  try {
    if (!req.workspace.owner.equals(req.user._id)) return res.status(403).json({ message: 'Only the current lead can transfer leadership.' });
    const newLead = await User.findById(req.body.memberId);
    if (!newLead || !req.workspace.members.some(memberId => memberId.equals(newLead._id))) return res.status(400).json({ message: 'Select an existing team member.' });
    req.user.role = 'viewer';
    newLead.role = 'lead';
    req.workspace.owner = newLead._id;
    await Promise.all([req.user.save(), newLead.save(), req.workspace.save()]);
    res.json(await Workspace.findById(req.workspace._id).populate('members', 'name email avatar role'));
  } catch (e) { next(e); }
});
app.delete('/api/workspaces/:workspaceId/leave', auth, workspaceMember, async (req, res, next) => {
  try {
    if (req.workspace.owner.equals(req.user._id)) return res.status(400).json({ message: 'The lead must transfer leadership before leaving.' });
    await Workspace.findByIdAndUpdate(req.workspace._id, { $pull: { members: req.user._id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.get('/api/tasks', auth, async (req, res, next) => {
  try {
    const memberWorkspaceIds = await Workspace.find({ members: req.user._id }).distinct('_id');
    let workspaceIds = memberWorkspaceIds;
    if (req.query.workspace) {
      const isMember = memberWorkspaceIds.some(id => id.equals(req.query.workspace));
      if (!isMember) return res.status(403).json({ message: 'Workspace access denied.' });
      workspaceIds = [req.query.workspace];
    }
    res.json(await Task.find({ workspace: { $in: workspaceIds } }).populate('assignee createdBy messages.sender', 'name email avatar').sort('-createdAt'));
  } catch (e) { next(e); }
});
app.post('/api/tasks', auth, workspaceMember, async (req, res, next) => {
  try {
    if (!req.workspace.owner.equals(req.user._id)) return res.status(403).json({ message: 'Only the team lead can create and assign tasks.' });
    if (typeof req.body.title !== 'string' || !req.body.title.trim()) return res.status(400).json({ message: 'Task title is required.' });
    if (req.body.dueDate && Number.isNaN(new Date(req.body.dueDate).getTime())) return res.status(400).json({ message: 'Due date must be a valid date.' });
    const filesError = attachmentError(req.body.attachments);
    if (filesError) return res.status(400).json({ message: filesError });
    const task = await (await Task.create({ ...req.body, title: req.body.title.trim(), createdBy: req.user._id })).populate('assignee createdBy messages.sender', 'name email avatar');
    if (task.assignee && !task.assignee._id.equals(req.user._id) && await notificationEnabled(task.assignee._id, 'taskAssigned')) await Notification.create({ user: task.assignee._id, task: task._id, message: `${req.user.name} assigned “${task.title}” to you.` });
    io.to(`workspace:${task.workspace}`).emit('task:created', task);
    res.status(201).json(task);
  } catch (e) { next(e); }
});
app.patch('/api/tasks/:id', auth, async (req, res, next) => {
  try {
    const existing = await Task.findById(req.params.id);
    const taskWorkspace = existing && await Workspace.findOne({ _id: existing.workspace, members: req.user._id });
    if (!existing || !taskWorkspace) return res.status(404).json({ message: 'Task not found.' });
    if (!taskWorkspace.owner.equals(req.user._id)) return res.status(403).json({ message: 'Only the team lead can update or assign tasks.' });
    const filesError = attachmentError(req.body.attachments);
    if (filesError) return res.status(400).json({ message: filesError });
    const oldAssignee = existing.assignee?.toString();
    Object.assign(existing, req.body); await existing.save();
    const task = await existing.populate('assignee createdBy messages.sender', 'name email avatar');
    if (task.assignee && task.assignee._id.toString() !== oldAssignee && !task.assignee._id.equals(req.user._id) && await notificationEnabled(task.assignee._id, 'taskAssigned')) await Notification.create({ user: task.assignee._id, task: task._id, message: `${req.user.name} assigned “${task.title}” to you.` });
    io.to(`workspace:${task.workspace}`).emit('task:updated', task);
    res.json(task);
  } catch (e) { next(e); }
});
app.post('/api/tasks/:id/acknowledge', auth, async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    const workspace = task && await Workspace.findOne({ _id: task.workspace, members: req.user._id });
    if (!task || !workspace) return res.status(404).json({ message: 'Task not found.' });
    if (!task.assignee?.equals(req.user._id)) return res.status(403).json({ message: 'Only the assigned member can acknowledge this task.' });
    const firstAcknowledgement = !task.assignmentAcknowledgedAt;
    if (firstAcknowledgement) task.assignmentAcknowledgedAt = new Date();
    if (!task.assignmentStartedAt) task.assignmentStartedAt = new Date();
    if (task.status === 'todo') task.status = 'progress';
    await task.save();
    const updated = await task.populate('assignee createdBy messages.sender', 'name email avatar');
    if (firstAcknowledgement && workspace.owner && await notificationEnabled(workspace.owner, 'taskAssigned')) {
      await Notification.create({ user: workspace.owner, task: task._id, message: `${req.user.name} acknowledged and started “${task.title}”.` });
    }
    io.to(`workspace:${task.workspace}`).emit('task:updated', updated);
    res.json(updated);
  } catch (e) { next(e); }
});
app.delete('/api/tasks/:id', auth, async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    const taskWorkspace = task && await Workspace.findOne({ _id: task.workspace, members: req.user._id });
    if (!task || !taskWorkspace) return res.status(404).json({ message: 'Task not found.' });
    if (!taskWorkspace.owner.equals(req.user._id)) return res.status(403).json({ message: 'Only the team lead can delete tasks.' });
    await task.deleteOne(); io.to(`workspace:${task.workspace}`).emit('task:deleted', { id: task._id }); res.status(204).end();
  } catch (e) { next(e); }
});
app.post('/api/tasks/:id/messages', auth, async (req, res, next) => {
  try {
    const text = req.body.text?.trim() || '';
    const filesError = attachmentError(req.body.attachments);
    if (filesError) return res.status(400).json({ message: filesError });
    if (!text && !req.body.attachments?.length) return res.status(400).json({ message: 'Add a message or attachment.' });
    if (text.length > 1000) return res.status(400).json({ message: 'Message must be 1000 characters or fewer.' });
    const task = await Task.findById(req.params.id);
    const workspace = task && await Workspace.findOne({ _id: task.workspace, members: req.user._id });
    if (!task || !workspace) return res.status(404).json({ message: 'Task not found.' });
    task.messages.push({ sender: req.user._id, text, attachments: req.body.attachments || [] });
    await task.save();
    const updated = await task.populate('assignee createdBy messages.sender', 'name email avatar');
    const recipient = workspace.owner.equals(req.user._id) ? task.assignee : workspace.owner;
    if (recipient && !recipient.equals(req.user._id) && await notificationEnabled(recipient, 'chatMessage')) {
      await Notification.create({ user: recipient, task: task._id, message: `${req.user.name} commented on “${task.title}”.` });
    }
    io.to(`workspace:${task.workspace}`).emit('task:updated', updated);
    res.status(201).json(updated);
  } catch (e) { next(e); }
});
app.get('/api/notifications', auth, async (req, res, next) => {
  try { res.json(await Notification.find({ user: req.user._id }).sort('-createdAt').limit(30)); } catch (e) { next(e); }
});
app.patch('/api/notifications/read', auth, async (req, res, next) => {
  try { await Notification.updateMany({ user: req.user._id, read: false }, { read: true }); res.json({ ok: true }); } catch (e) { next(e); }
});

// This is available only until the very first administrator is created. It
// lets a fresh installation be configured without manually editing the DB.
app.get('/api/admin/status', auth, async (_req, res, next) => {
  try { res.json({ needsSetup: !(await User.exists({ isAdmin: true })) }); } catch (e) { next(e); }
});
app.post('/api/admin/bootstrap', auth, async (req, res, next) => {
  try {
    if (await User.exists({ isAdmin: true })) return res.status(403).json({ message: 'An administrator already exists.' });
    await User.findByIdAndUpdate(req.user._id, { $set: { isAdmin: true, canLead: true, role: 'lead' } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
app.get('/api/admin/users', auth, requireAdmin, async (req, res, next) => {
  try {
    res.json(await User.find().select('name email isAdmin canLead passwordChangeLocked emailVerified createdAt').sort('name'));
  } catch (e) { next(e); }
});
app.patch('/api/admin/users/:userId', auth, requireAdmin, async (req, res, next) => {
  try {
    const target = await User.findById(req.params.userId);
    if (!target) return res.status(404).json({ message: 'User not found.' });
    if (target._id.equals(req.user._id) && req.body.isAdmin === false) return res.status(400).json({ message: "You can't remove your own admin access." });
    if (typeof req.body.canLead === 'boolean') { target.canLead = req.body.canLead; if (!target.canLead) target.role = 'viewer'; }
    if (typeof req.body.passwordChangeLocked === 'boolean') target.passwordChangeLocked = req.body.passwordChangeLocked;
    if (typeof req.body.isAdmin === 'boolean') target.isAdmin = req.body.isAdmin;
    await target.save();
    res.json({ id: target._id, name: target.name, email: target.email, isAdmin: target.isAdmin, canLead: target.canLead, passwordChangeLocked: target.passwordChangeLocked });
  } catch (e) { next(e); }
});

io.on('connection', socket => socket.on('workspace:join', id => socket.join(`workspace:${id}`)));
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ message: err.message || 'Something went wrong.' }); });

const port = process.env.PORT || 5000;
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required. Copy server/.env.example to server/.env.');
mongoose.connect(process.env.MONGO_URI).then(async () => {
  // Correct accounts created by the old, unsafe default without taking away
  // workspace ownership; ownership remains the only workspace lead authority.
  await User.updateMany({ canLead: false, role: 'lead' }, { $set: { role: 'viewer' } });
  server.listen(port, () => console.log(`TaskFlow API on http://localhost:${port}`));
}).catch(console.error);
