
# TaskFlow — Team Task Manager

A full-stack task management MVP with secure authentication, shared workspaces, a drag-and-drop status board, assignment notifications, and realtime task updates.

## Included

- JWT signup/login with bcrypt password hashing
- Multiple shared workspaces and member invitations
- Create, assign, edit, move, search, and delete tasks
- Due dates and low/medium/high priorities
- To Do / In Progress / Done drag-and-drop board
- In-app assignment notifications
- Socket.io realtime task creation, updates, moves, and deletion
- Responsive React interface

## Run locally

1. Install and start MongoDB locally, or create a MongoDB Atlas database.
2. Copy `server/.env.example` to `server/.env` and update `MONGO_URI` and `JWT_SECRET`.
3. Optionally copy `client/.env.example` to `client/.env` if your API does not run on port 5000.
4. From the project root, run:

   ```bash
   npm run dev
   ```

5. Open `http://localhost:5173`.

Dependencies are already installed in this workspace. For a fresh clone, run `npm install` and then `npm run install:all` first.

## Main API routes

- `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET|POST /api/workspaces`, `POST /api/workspaces/:workspaceId/members`
- `GET|POST /api/tasks`, `PATCH|DELETE /api/tasks/:id`
- `GET /api/notifications`, `PATCH /api/notifications/read`

For invitations, the invited person must first have a TaskFlow account. The notification system is currently in-app; email delivery can be added later through a provider such as Resend or SendGrid.
=======
# my-fullstack-app
>>>>>>> 54f8871e096c99597421162f862083587ffe4bed
