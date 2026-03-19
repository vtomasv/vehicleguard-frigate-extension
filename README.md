# VehicleGuard — AI Vehicle Access Control

> An intelligent vehicle access control system that extends [Frigate NVR](https://frigate.video/) with LLM-powered visual analysis. Detects, classifies, and tracks vehicles in real-time using vision-capable language models — locally or via cloud APIs.

---

## Overview

VehicleGuard adds a semantic intelligence layer on top of Frigate's object detection. While Frigate handles the low-level motion detection and RTSP stream management, VehicleGuard answers the harder questions:

- **What kind of vehicle is this?** (truck, car, motorcycle, van)
- **Is it entering or exiting?** (direction analysis using configurable arrow overlays)
- **What does it look like?** (color, brand, model, plate, load, damage)
- **Is this the same vehicle I saw 3 frames ago?** (cross-segment deduplication)

All analysis runs through a configurable LLM with vision support — OpenAI GPT-4o, Anthropic Claude, Google Gemini, or a local Ollama model.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        VehicleGuard                         │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  React 19    │    │  Express 4   │    │  MySQL 8     │  │
│  │  + Vite 5    │◄──►│  + tRPC 11   │◄──►│  + Drizzle   │  │
│  │  + Tailwind 4│    │              │    │              │  │
│  └──────────────┘    └──────┬───────┘    └──────────────┘  │
│                             │                               │
│                    ┌────────▼────────┐                      │
│                    │  Video Analysis │                      │
│                    │  Pipeline       │                      │
│                    │                 │                      │
│                    │ 1. Frame extract│                      │
│                    │ 2. Presence     │◄── LLM (fast model)  │
│                    │    detection    │                      │
│                    │ 3. Segmentation │                      │
│                    │ 4. Full analysis│◄── LLM (smart model) │
│                    │ 5. Deduplication│                      │
│                    │ 6. Event store  │                      │
│                    └─────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
         │                                        │
         ▼                                        ▼
  ┌─────────────┐                        ┌──────────────────┐
  │ Frigate NVR │                        │  S3 / MinIO      │
  │ (RTSP feeds)│                        │  (frame storage) │
  └─────────────┘                        └──────────────────┘
```

---

## Features

| Feature | Description |
|---|---|
| **Multi-camera support** | Configure multiple IP cameras, each with its own type (trucks / vehicles), location, and custom prompts |
| **Direction detection** | Draw entry/exit arrows on the camera view; the LLM uses them to determine vehicle direction |
| **Vehicle classification** | Type, subtype, color, brand, model, year, plate, load status, damage, company signage |
| **Cross-segment deduplication** | Prevents counting the same vehicle multiple times when it appears across multiple video segments |
| **Detailed analysis reports** | Optional frame-by-frame forensic reports with annotated frames and agent decision traces |
| **Configurable LLM** | OpenAI, Anthropic, Google Gemini, Ollama (local), or any OpenAI-compatible endpoint |
| **Per-camera prompts** | Customize the system prompt and user prompt for each camera independently |
| **Access records** | Searchable, filterable event log grouped by video upload |
| **Analytics dashboard** | Entry/exit counts, vehicle type distribution, camera activity over time |

---

## Quick Start (Docker Compose)

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) 24+
- [Docker Compose](https://docs.docker.com/compose/install/) v2+
- An API key for at least one LLM provider with vision support (or a local Ollama instance)

> **No Manus account required.** VehicleGuard uses local email/password authentication by default (`AUTH_MODE=local`).

### 1. Clone and configure

```bash
git clone https://github.com/vtomasv/vehicleguard-frigate-extension.git
cd vehicleguard-frigate-extension

# Copy the example environment file
cp .env.example .env

# Optional: edit .env to change admin credentials or LLM provider
nano .env
```

### 2. Start services

```bash
docker compose up -d
```

This starts:
- **VehicleGuard app** on `http://localhost:3000`
- **MySQL 8** on `localhost:3306`
- **MinIO** (S3-compatible storage) on `http://localhost:9000` (console: `http://localhost:9001`)
- **Adminer** (DB admin UI) on `http://localhost:8080`

### 3. Create the admin user

```bash
docker compose exec app node seed-admin.mjs
```

This creates the initial admin user:
- **Email**: `admin@vehicleguard.local`
- **Password**: `admin123`

> Change these defaults in `.env` via `ADMIN_EMAIL` and `ADMIN_PASSWORD` before running the seed.

### 4. Initialize MinIO bucket

After starting, create the storage bucket:

```bash
# Open MinIO console
open http://localhost:9001
# Login: minioadmin / minioadmin123
# Create a bucket named "vehicleguard" with public read access
```

Or via CLI:
```bash
docker compose exec minio mc alias set local http://localhost:9000 minioadmin minioadmin123
docker compose exec minio mc mb local/vehicleguard
docker compose exec minio mc anonymous set public local/vehicleguard
```

### 5. Open the app

Navigate to `http://localhost:3000` and sign in with `admin@vehicleguard.local` / `admin123`.

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | Yes | Secret for signing session cookies. Use `openssl rand -base64 32` |
| `DB_PASSWORD` | Yes | MySQL password for the `vehicleguard` user |
| `VITE_APP_ID` | For auth | Manus OAuth application ID |
| `OWNER_OPEN_ID` | For auth | Owner's Manus OpenID (gets admin role automatically) |
| `BUILT_IN_FORGE_API_KEY` | For default LLM | Manus Forge API key (fallback if no custom LLM configured) |
| `S3_ENDPOINT` | Yes | S3 endpoint URL (use `http://minio:9000` for local MinIO) |
| `S3_BUCKET` | Yes | S3 bucket name |
| `S3_ACCESS_KEY` | Yes | S3 access key |
| `S3_SECRET_KEY` | Yes | S3 secret key |

### LLM Configuration (In-App)

Navigate to **Settings → APIs y Modelos** to configure:

- **Provider**: OpenAI, Anthropic (Claude), Google Gemini, Ollama, or any OpenAI-compatible endpoint
- **Models**: Separate models for presence detection (fast/cheap) and full analysis (accurate)
- **Parameters**: Temperature, max tokens, top-p, top-k

Supported providers and recommended models:

| Provider | Presence Model | Analysis Model | Notes |
|---|---|---|---|
| OpenAI | `gpt-4o-mini` | `gpt-4o` | Best balance of speed and accuracy |
| Anthropic | `claude-3-haiku-20240307` | `claude-3-5-sonnet-20241022` | Excellent at structured extraction |
| Google Gemini | `gemini-2.0-flash` | `gemini-2.0-flash` | Fast and cost-effective |
| Ollama (local) | `llava:7b` | `llava:13b` | Fully local, no API costs |
| LM Studio | any vision model | any vision model | OpenAI-compatible local server |

---

## Camera Setup

### Adding a Camera

1. Go to **Cámaras** in the sidebar
2. Default cameras are created automatically (Camera 1: trucks, Camera 2: vehicles)
3. Configure the **direction arrows** by drawing entry/exit vectors on the camera preview
4. Optionally customize the **system prompt** and **user prompt** for each camera

### Connecting to Frigate

VehicleGuard currently accepts video uploads for analysis. To integrate with Frigate's live streams:

1. Configure Frigate to save clips when motion is detected
2. Use Frigate's webhook or MQTT events to trigger video uploads to VehicleGuard's API
3. VehicleGuard processes the clip and stores the access event

**Planned**: Native Frigate webhook integration with automatic clip ingestion.

---

## Development

### Prerequisites

- Node.js 22+
- pnpm 9+
- MySQL 8 (or use the Docker Compose DB service)

### Setup

```bash
# Install dependencies
pnpm install

# Copy and configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL to your local MySQL instance

# Run database migrations
pnpm db:push

# Start development server (hot reload)
pnpm dev
```

The app runs on `http://localhost:3000` with Vite HMR for the frontend.

### Project Structure

```
├── client/                 # React 19 frontend (Vite + Tailwind 4)
│   └── src/
│       ├── pages/          # Page components
│       ├── components/     # Reusable UI components
│       └── lib/trpc.ts     # tRPC client
├── server/                 # Express 4 backend
│   ├── routers.ts          # tRPC procedures
│   ├── db.ts               # Database query helpers
│   ├── videoAnalysis.ts    # LLM video analysis pipeline
│   ├── detailedReport.ts   # Forensic report generation
│   └── _core/              # Framework plumbing (auth, LLM, storage)
├── drizzle/
│   └── schema.ts           # Database schema (Drizzle ORM)
└── docker-compose.yml      # Local development stack
```

### Running Tests

```bash
pnpm test
```

Tests cover:
- Vehicle similarity scoring (deduplication algorithm)
- Cross-segment vehicle deduplication
- Access control procedures
- Authentication flows

---

## Hardware Tested On

| Hardware | Status |
|---|---|
| Apple M3 Max, 128 GB RAM, macOS 15.7 | ✅ Fully tested |
| Linux x86_64 (Docker) | ✅ Supported |
| Raspberry Pi 5 (8 GB) | 🔄 Planned |

For Apple Silicon Macs, Ollama with `llava:13b` runs efficiently on the Neural Engine.

---

## Frigate Integration Roadmap

- [ ] Native Frigate webhook receiver (auto-ingest clips on motion events)
- [ ] MQTT event listener for Frigate object detection events
- [ ] Frigate config generator (auto-create camera configs from VehicleGuard setup)
- [ ] Real-time stream analysis (RTSP direct processing without clip saving)
- [ ] Home Assistant integration (fire events when specific vehicles are detected)
- [ ] License plate allowlist/blocklist with automatic gate control

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 5, Tailwind CSS 4, shadcn/ui |
| Backend | Node.js 22, Express 4, tRPC 11, TypeScript |
| Database | MySQL 8, Drizzle ORM |
| Storage | S3-compatible (MinIO for local, AWS S3 for production) |
| AI | OpenAI GPT-4o / Anthropic Claude / Google Gemini / Ollama |
| Auth | Local email/password + JWT (standalone) or Manus OAuth 2.0 |
| Container | Docker, Docker Compose |

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
