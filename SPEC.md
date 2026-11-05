# SkillSwap — Project Spec

A MERN platform where users trade skills instead of paying: teach one skill, learn another.

> **Instructions for the coding agent**
> - Follow this spec exactly. Do not invent extra features, rename models, or change the stack.
> - Implement ONE feature at a time, as asked. Stop after each feature and wait for review.
> - Keep code simple and readable. Add short comments on non-obvious logic only.
> - Ask before adding any new dependency.
> - Never put secrets in code. Use `.env` and provide `.env.example`.

## Stack
- Frontend: React (Vite), Tailwind CSS, React Router, Axios
- Backend: Node.js, Express, Mongoose
- Database: MongoDB Atlas
- Realtime: Socket.io
- Auth: JWT (access token), bcrypt for password hashing
- Email: Nodemailer (email verification via signed JWT with `purpose: 'verify'`, 24h expiry; Ethereal in dev)
- Validation: Zod
- Deploy: Vercel (frontend), Render (backend)

## Folder structure
```
skillswap/
  client/          # React app
  server/
    src/
      models/
      routes/
      controllers/
      middleware/  # auth, role check, error handler, rate limiter
      utils/       # matching, mailer
      index.js
  SPEC.md
  README.md
```

## Data models

```js
User {
  name: String, email: String (unique, lowercase), passwordHash: String,
  bio: String, avatarUrl: String,
  emailVerified: Boolean (default false),
  role: 'user' | 'admin' (default 'user'),
  skillsOffered: [{ skill: String (normalised lowercase), level: 'beginner'|'intermediate'|'advanced' }],
  skillsWanted: [String] (normalised lowercase),
  ratingAvg: Number (default 0), ratingCount: Number (default 0),
  createdAt
}

Slot {
  teacher: ObjectId -> User, skill: String,
  start: Date, end: Date,
  status: 'open' | 'booked' (default 'open')
  // unique index on { teacher, start }
}

SessionRequest {
  learner: ObjectId -> User, teacher: ObjectId -> User, slot: ObjectId -> Slot,
  skillRequested: String,   // what the learner wants to learn
  skillOffered: String,     // what the learner will teach in return
  status: 'pending' | 'accepted' | 'declined' | 'completed' | 'cancelled',
  createdAt
}

Message {
  conversationId: String,   // sorted "userIdA_userIdB"
  sender: ObjectId -> User, text: String, createdAt
}

Review {
  session: ObjectId -> SessionRequest,
  reviewer: ObjectId -> User, reviewee: ObjectId -> User,
  rating: Number (1-5), comment: String, createdAt
  // unique index on { session, reviewer }
}
```

## API routes

| Method | Route | Description |
|---|---|---|
| POST | /api/auth/register | Create user, send verification email |
| POST | /api/auth/login | Return JWT |
| GET | /api/auth/verify-email?token= | Mark email verified |
| GET | /api/users/me | Current user |
| PUT | /api/users/me | Update profile and skills |
| GET | /api/users/:id | Public profile |
| GET | /api/users?skill= | Search users by skill offered |
| GET | /api/matches | Ranked match suggestions for current user |
| POST | /api/slots | Teacher creates a slot |
| GET | /api/slots?teacher= | List open slots for a teacher |
| POST | /api/requests | Learner requests a session (books slot atomically) |
| PATCH | /api/requests/:id | Teacher accepts/declines; either side cancels; mark completed |
| GET | /api/requests | My requests (as learner and teacher) |
| GET | /api/messages/:conversationId | Chat history |
| POST | /api/reviews | Review after a completed session |
| GET | /api/admin/users | Admin: list users |
| DELETE | /api/admin/reviews/:id | Admin: remove a review |

Socket.io events: `join` (conversationId), `message:send`, `message:new`. Verify the JWT in the socket handshake. Enforce strictly: chat only between users with an accepted SessionRequest, checked in `/api/messages/:conversationId` and on socket `join`.

## Core logic
The developer writes matching and atomic booking. At Steps 4 and 6, the agent gives only function signatures and test cases, then reviews the developer's code.

### 1. Matching
For current user A and every other user B:
- `aWantsBOffers` = A.skillsWanted ∩ B.skillsOffered (skill names)
- `bWantsAOffers` = B.skillsWanted ∩ A.skillsOffered
- score = size(aWantsBOffers) + size(bWantsAOffers)
- Mutual match = both intersections non-empty. Mutual matches rank above one-way matches; ties broken by score, then ratingAvg.
- Build a skill -> users lookup so we don't scan every user.
- Normalise skill names to lowercase and trim before comparing.

### 2. Double-booking prevention
When a learner requests a slot, mark it booked atomically:
```js
const slot = await Slot.findOneAndUpdate(
  { _id: slotId, status: 'open' },
  { status: 'booked' },
  { new: true }
);
if (!slot) return res.status(409).json({ message: 'Slot already booked' });
```
- Create the SessionRequest only if the update succeeded.
- If the teacher declines or either side cancels, set the slot back to `open`.
- A plain "read status, then write" check is NOT allowed (race condition).

## Security and validation
- Hash passwords with bcrypt. Never return `passwordHash`.
- Auth middleware verifies JWT; role middleware protects admin routes.
- Email verification: Signed JWT with `purpose: 'verify'` claim and 24h expiry (no new fields on User model). Ethereal in development.
- Block unverified users from creating slots or requests.
- Validate all request bodies with zod.
- Rate-limit `/api/auth/*`.
- Central error handler; consistent JSON error shape `{ message }`.
- CORS restricted to the deployed frontend origin.

## Build order (one feature at a time)
1. Project setup, Mongoose connection, User model, register/login, auth middleware
2. Email verification
3. Profile edit and skills (offered/wanted), user search
4. Matching endpoint and Matches page
5. Slots (teacher creates availability)
6. Session requests with atomic booking, accept/decline/cancel flow
7. Socket.io chat between users with an accepted session
8. Reviews and rating average update
9. Admin view, validation, rate limiting, error handling
10. Seed script (about 20 demo users), deploy, README with screenshots

## Done means
- Works end to end on the deployed URLs
- Seed data so the demo is not empty
- README covers: what it is, stack, features, setup steps, live link, screenshots
- Every route tested in Postman
