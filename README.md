# SkillSwap

A MERN platform where users trade skills instead of paying: teach one skill, learn another.

## Features
- **Skill Exchange**: Offer your skills and connect with others to learn new skills.
- **Matching System**: Automatic matching based on complementary skill pairs.
- **Realtime Chat & Sessions**: Coordinate sessions and chat in real-time.
- **Review & Ratings**: Feedback system with ratings after completed swaps.
- **Authentication**: JWT-based authentication with email verification.

## Tech Stack
- **Frontend**: React (Vite), Tailwind CSS, React Router, Axios
- **Backend**: Node.js, Express, Mongoose
- **Database**: MongoDB Atlas
- **Realtime**: Socket.io
- **Auth**: JWT, bcrypt

## Getting Started

### Prerequisites
- Node.js (v18+)
- MongoDB (Atlas or local instance)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/deeya-meena/SkillSwap.git
   cd SkillSwap
   ```

2. **Backend Setup**:
   ```bash
   cd server
   npm install
   cp .env.example .env # or copy root .env.example
   # Update your MongoDB URI and JWT secrets in .env
   npm run dev
   ```

3. **Frontend Setup**:
   ```bash
   cd ../client
   npm install
   npm run dev
   ```

## License
MIT
