# BEChessWeb — Next.js Client

React frontend cho BEChessWeb. Express backend vẫn chạy riêng ở port 8080.

## Cấu trúc

```
client/
├── app/                  # Next.js App Router pages
│   ├── page.tsx          # / — Home (active games)
│   ├── board/page.tsx    # /board?id=<encoded> — Game board
│   ├── played/page.tsx   # /played — Game history
│   └── log/page.tsx      # /log — Socket event viewer
├── components/
│   ├── ui/               # shadcn/ui base components
│   ├── layout/           # Navbar
│   ├── providers/        # Theme + Socket providers
│   ├── home/             # Home page components
│   ├── board/            # Board page components
│   └── played/           # History page components
├── hooks/                # Custom React hooks
├── lib/                  # Zustand store, socket, utilities
└── types/                # TypeScript types
```

## Chạy development

```bash
# 1. Khởi động Express backend (port 8080)
cd ..
npm run dev

# 2. Khởi động Next.js frontend (port 3000)
cd client
npm install
npm run dev
```

Truy cập: http://localhost:3000

## Environment

`.env.local`:
```
API_URL=http://localhost:8080          # HTTP proxy target (server-side)
NEXT_PUBLIC_SOCKET_URL=http://localhost:8080   # Socket.io URL (browser-side)
```

## Build production

```bash
npm run build
npm start
```
