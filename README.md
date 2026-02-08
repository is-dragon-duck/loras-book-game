# No More Tarot — Online Playtest

A turn-based multiplayer card game playable in the browser.

## Setup

### 1. Supabase

1. Create a free account at [supabase.com](https://supabase.com)
2. Create a new project
3. Go to **SQL Editor** and run the contents of `supabase-setup.sql`
4. Go to **Settings → API** and note your Project URL, anon key, and service role key

### 2. Environment Variables

Copy `.env.local.example` to `.env.local` and fill in your Supabase credentials:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Local Development

```bash
npm install
npm run dev
```

Open http://localhost:3000

### 4. Deploy to Vercel

1. Push to GitHub
2. Import the repo in [Vercel](https://vercel.com)
3. Add the same three environment variables in Vercel project settings
4. Deploy — every push to main auto-deploys

## How to Play

1. One player creates a game and gets a 6-character code
2. Other players join using the code
3. Host starts the game when 2–6 players have joined
4. Players take turns drawing, playing cards, and building their Territory
5. First to 18 Stag Points wins!

## Architecture

- **Frontend + API**: Next.js on Vercel
- **Database + Real-time**: Supabase (PostgreSQL + real-time subscriptions)
- **Hidden info**: All game logic runs server-side in API routes; players only see their own hand
- **Sync**: Supabase real-time notifies all clients when game state changes
