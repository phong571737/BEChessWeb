### Core
- **Next.js 16** (App Router)
- **React 19**
- **TypeScript**

## Development

### Start the Backend

```bash
cd ..
npm run dev
```

Backend: `http://localhost:8080`

### Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend: `http://localhost:3000`

---

# Environment Variables
Create a `.env.local` file:

```env
API_URL=http://localhost:8080
NEXT_PUBLIC_SOCKET_URL=http://localhost:8080
```

| Variable | Description |
| --------- | ----------- |
| `API_URL` | Express backend URL used for server-side requests |
| `NEXT_PUBLIC_SOCKET_URL` | Socket.IO server URL used in the browser |

---

## Project Structure

```text
frontend/
├── app/                     # Next.js App Router pages
│   ├── board/               # Real-time chessboard page
│   ├── paste/               # PGN import page
│   ├── played/              # Game history page
│   ├── globals.css          # Global styles
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Home page
│
├── components/
│   ├── board/               # Chessboard-related components
│   ├── home/                # Home page components
│   ├── import-game/         # PGN import components
│   ├── layout/              # Navbar and layout components
│   ├── played/              # Game history components
│   ├── providers/           # Theme and Socket providers
│   └── ui/                  # Shared shadcn/ui components
│
├── hooks/                   # Custom React hooks
│   ├── use-active-games.ts
│   ├── use-game.ts
│   ├── use-initial-check.ts
│   ├── use-physical-boards.ts
│   └── use-stockfish.ts
│
├── lib/                     # Utilities, stores, socket, i18n
├── locales/                 # Translation resources
├── public/                  # Static assets
├── types/                   # TypeScript definitions
├── Dockerfile               # Production Docker image
├── next.config.ts           # Next.js configuration
├── tailwind.config.ts       # Tailwind CSS configuration
└── package.json
```

