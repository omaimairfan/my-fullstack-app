import jwt from 'jsonwebtoken';
import { User, Workspace } from './models.js';

export async function auth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'Please log in.' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(payload.id).select('-password');
    if (!req.user) return res.status(401).json({ message: 'Account not found.' });
    next();
  } catch { res.status(401).json({ message: 'Session expired. Please log in again.' }); }
}

export async function workspaceMember(req, res, next) {
  const workspaceId = req.params.workspaceId || req.body.workspace || req.query.workspace;
  const workspace = await Workspace.findOne({ _id: workspaceId, members: req.user._id });
  if (!workspace) return res.status(403).json({ message: 'Workspace access denied.' });
  req.workspace = workspace;
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) return res.status(403).json({ message: 'Admin access required.' });
  next();
}
