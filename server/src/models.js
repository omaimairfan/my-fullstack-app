import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  avatar: String
}, { timestamps: true });

const workspaceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  status: { type: String, enum: ['todo', 'progress', 'done'], default: 'todo' },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  dueDate: Date,
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true },
  task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  read: { type: Boolean, default: false }
}, { timestamps: true });

export const User = mongoose.model('User', userSchema);
export const Workspace = mongoose.model('Workspace', workspaceSchema);
export const Task = mongoose.model('Task', taskSchema);
export const Notification = mongoose.model('Notification', notificationSchema);
