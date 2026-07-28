import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  // A new account is never a lead automatically. An admin must grant canLead
  // before the person can create a workspace; workspace ownership makes them
  // the lead for that particular team.
  role: { type: String, enum: ['lead', 'viewer'], default: 'viewer' },
  isAdmin: { type: Boolean, default: false },
  canLead: { type: Boolean, default: false },
  passwordChangeLocked: { type: Boolean, default: false },
  avatar: String,
  emailVerified: { type: Boolean, default: false },
  verificationCode: String,
  verificationExpires: Date,
  preferences: {
    taskAssigned: { type: Boolean, default: true },
    chatMessage: { type: Boolean, default: true },
    theme: { type: String, enum: ['light', 'dark'], default: 'light' }
  }
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
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignmentAcknowledgedAt: { type: Date, default: null },
  assignmentStartedAt: { type: Date, default: null },
  attachments: [{
    name: { type: String, required: true, maxlength: 160 },
    type: { type: String, required: true, maxlength: 100 },
    size: { type: Number, required: true },
    data: { type: String, required: true }
  }],
  messages: [{
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    attachments: [{
      name: { type: String, required: true, maxlength: 160 },
      type: { type: String, required: true, maxlength: 100 },
      size: { type: Number, required: true },
      data: { type: String, required: true }
    }],
    createdAt: { type: Date, default: Date.now }
  }]
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
