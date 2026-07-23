import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { User, Workspace, Task, Notification } from './models.js';
import { auth, workspaceMember } from './auth.js';

const app = express();
const server = http.createServer(app);
const origins = (process.env.CLIENT_URL || 'http://localhost:5173').split(',');
const io = new Server(server, { cors: { origin: origins } });
app.use(cors({ origin: origins }));
app.use(express.json());

const publicUser = user => ({ id: user._id, name: user.name, email: user.email, avatar: user.avatar });
const tokenFor = user => jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.post('/api/auth/signup', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password || password.length < 6) return res.status(400).json({ message: 'Name, email, and a 6+ character password are required.' });
    if (await User.exists({ email: email.toLowerCase() })) return res.status(409).json({ message: 'Email already registered.' });
    const user = await User.create({ name, email, password: await bcrypt.hash(password, 12) });
    const workspace = await Workspace.create({ name: `${name}'s Workspace`, owner: user._id, members: [user._id] });
    res.status(201).json({ token: tokenFor(user), user: publicUser(user), workspace });
  } catch (e) { next(e); }
});
app.post('/api/auth/login', async (req, res, next) => {
  try {
    const user = await User.findOne({ email: req.body.email?.toLowerCase() });
    if (!user || !(await bcrypt.compare(req.body.password || '', user.password))) return res.status(401).json({ message: 'Invalid email or password.' });
    res.json({ token: tokenFor(user), user: publicUser(user) });
  } catch (e) { next(e); }
});
app.get('/api/auth/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

app.get('/api/workspaces', auth, async (req, res, next) => {
  try { res.json(await Workspace.find({ members: req.user._id }).populate('members', 'name email avatar').sort('-createdAt')); } catch (e) { next(e); }
});
app.post('/api/workspaces', auth, async (req, res, next) => {
  try { res.status(201).json(await Workspace.create({ name: req.body.name, owner: req.user._id, members: [req.user._id] })); } catch (e) { next(e); }
});
app.post('/api/workspaces/:workspaceId/members', auth, workspaceMember, async (req, res, next) => {
  try {
    if (!req.workspace.owner.equals(req.user._id)) return res.status(403).json({ message: 'Only the owner can invite members.' });
    const member = await User.findOne({ email: req.body.email?.toLowerCase() });
    if (!member) return res.status(404).json({ message: 'Ask this person to create an account first.' });
    await Workspace.findByIdAndUpdate(req.workspace._id, { $addToSet: { members: member._id } });
    res.json(await Workspace.findById(req.workspace._id).populate('members', 'name email avatar'));
  } catch (e) { next(e); }
});

app.get('/api/tasks', auth, workspaceMember, async (req, res, next) => {
  try { res.json(await Task.find({ workspace: req.query.workspace }).populate('assignee createdBy', 'name email avatar').sort('-createdAt')); } catch (e) { next(e); }
});
app.post('/api/tasks', auth, workspaceMember, async (req, res, next) => {
  try {
    const task = await (await Task.create({ ...req.body, createdBy: req.user._id })).populate('assignee createdBy', 'name email avatar');
    if (task.assignee && !task.assignee._id.equals(req.user._id)) await Notification.create({ user: task.assignee._id, task: task._id, message: `${req.user.name} assigned “${task.title}” to you.` });
    io.to(`workspace:${task.workspace}`).emit('task:created', task);
    res.status(201).json(task);
  } catch (e) { next(e); }
});
app.patch('/api/tasks/:id', auth, async (req, res, next) => {
  try {
    const existing = await Task.findById(req.params.id);
    if (!existing || !(await Workspace.exists({ _id: existing.workspace, members: req.user._id }))) return res.status(404).json({ message: 'Task not found.' });
    const oldAssignee = existing.assignee?.toString();
    Object.assign(existing, req.body); await existing.save();
    const task = await existing.populate('assignee createdBy', 'name email avatar');
    if (task.assignee && task.assignee._id.toString() !== oldAssignee && !task.assignee._id.equals(req.user._id)) await Notification.create({ user: task.assignee._id, task: task._id, message: `${req.user.name} assigned “${task.title}” to you.` });
    io.to(`workspace:${task.workspace}`).emit('task:updated', task);
    res.json(task);
  } catch (e) { next(e); }
});
app.delete('/api/tasks/:id', auth, async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task || !(await Workspace.exists({ _id: task.workspace, members: req.user._id }))) return res.status(404).json({ message: 'Task not found.' });
    await task.deleteOne(); io.to(`workspace:${task.workspace}`).emit('task:deleted', { id: task._id }); res.status(204).end();
  } catch (e) { next(e); }
});
app.get('/api/notifications', auth, async (req, res, next) => {
  try { res.json(await Notification.find({ user: req.user._id }).sort('-createdAt').limit(30)); } catch (e) { next(e); }
});
app.patch('/api/notifications/read', auth, async (req, res, next) => {
  try { await Notification.updateMany({ user: req.user._id, read: false }, { read: true }); res.json({ ok: true }); } catch (e) { next(e); }
});

io.on('connection', socket => socket.on('workspace:join', id => socket.join(`workspace:${id}`)));
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ message: err.message || 'Something went wrong.' }); });

const port = process.env.PORT || 5000;
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required. Copy server/.env.example to server/.env.');
mongoose.connect(process.env.MONGO_URI).then(() => server.listen(port, () => console.log(`TaskFlow API on http://localhost:${port}`))).catch(console.error);
