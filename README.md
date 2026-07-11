# 🪶 Akshara (अक्षर)

**Akshara** is an interactive, immersive, and hands-on learning platform designed to help users master Indian language scripts (such as Devanagari, Kannada, Telugu, Malayalam, Odia, Bengali, Gujarati, Tamil, Gurumukhi, and Sinhala).

Through real-time stroke/gesture recognition, audio feedback, and structured lessons, users can practice writing letters correctly, listen to authentic pronunciations, and learn vocabulary associated with each character.

---

## ✨ Features

- **✍️ Interactive Gesture/Stroke Canvas**: Powered by `react-konva` and `perfect-freehand`, the drawing canvas tracks user drawing strokes in real-time, matching them with vector paths for accurate layout guidance and stroke feedback.
- **🔊 Audio Pronunciation**: Integral audio features utilizing `wavesurfer.js` to render customizable waveform visualizers for letter and word pronunciations.
- **🌐 Multilingual & Multiscript Support**:
  - **Languages**: Hindi, Sanskrit, Kannada, Malayalam, Telugu, Odia, Bengali, Gujarati, Marathi, Nepali, Tamil, Punjabi, Sinhala, and English.
  - **Scripts**: Devanagari, Kannada, Malayalam, Telugu, Odia, Bengali, Gujarati, Tamil, Gurumukhi, Sinhala, and Latin.
  - Includes transliteration support using the `lipilekhika` library.
- **🗂️ Lesson Management & Content Administration**: Admin dashboard to create, view, edit, and order scripts, categories, lessons, letters, and associated assets (images and audios).
- **🔒 Secure Authentication**: Robust user authentication and session management powered by **Better Auth**.
- **🎨 Rich Modern UI/UX**: Crafted with **Tailwind CSS v4**, **Framer Motion** for animations, and **Shadcn UI** components. Fully supports dark and light modes.
- **⚡ AI-Powered Enhancements**: Utilizes the **Vercel AI SDK** with OpenAI/OpenRouter to generate assets and provide contextual support.

---

## 🛠️ Technology Stack

- **Meta-Framework**: [TanStack Start](https://tanstack.com/router/latest/docs/start/overview) (React Start) with [Vite](https://vite.dev/) and [Nitro](https://nitro.unjs.io/) server engine.
- **Runtime & Package Manager**: [Bun](https://bun.sh/)
- **Frontend Core**: React 19, TypeScript, [Jotai](https://jotai.org/) (state management).
- **Data Fetching**: [TanStack Query](https://tanstack.com/query/latest) (React Query) and [tRPC](https://trpc.io/).
- **Database**: [PostgreSQL](https://www.postgresql.org/) (Neon Serverless compatibility) managed via [Drizzle ORM](https://orm.drizzle.team/).
- **Cache & Rate Limiting**: Redis (via Upstash Redis).
- **Storage**: AWS S3 with CloudFront integration for low-latency media assets distribution.

---

## 📁 Directory Structure

```text
akshara/
├── .agents/                 # AI assistant configurations and skills
├── public/                  # Public static assets
└── src/
    ├── api/                 # API controllers, server routes, tRPC routers
    ├── components/          # Shared React UI components (Shadcn UI)
    ├── db/                  # Drizzle ORM schema, migrations, connection setup
    │   ├── schema.ts        # Database schema definitions
    │   └── migrations/      # Drizzle migration files
    ├── fonts/               # Variable webfonts for Indic scripts
    ├── lib/                 # Third-party configuration wrappers (e.g. S3 clients, Auth)
    ├── routes/              # TanStack Router folder routing tree
    │   ├── (auth)/          # Authentication & protected admin screens
    │   ├── (public)/        # Landing page, public interactive learn screens
    │   └── api.trpc.$.ts    # tRPC API gateway endpoint
    ├── state/               # Jotai global atoms, language lists, and React Query client
    ├── tools/               # Drawing algorithms, vector calculation, and Lipilekhika integration
    ├── utils/               # Common helper utilities
    ├── app.scss             # Global Sass stylesheet
    └── styles.css           # Global Tailwind utility rules
```

---

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh/) installed locally.
- A PostgreSQL database instance (local or hosted e.g. on Neon).
- Access credentials for optional external services (AWS S3, OpenAI, Upstash Redis).

### Installation

1. Clone the repository and navigate to the project directory.
2. Install the project dependencies using Bun:
   ```bash
   bun install
   ```

### Configuration

Create a `.env` file in the root directory. You can copy the structure from `.env.example`:

```bash
cp .env.example .env
```

Fill in your environmental variables:

| Variable                                              | Description                                               |
| :---------------------------------------------------- | :-------------------------------------------------------- |
| `PG_DATABASE_URL`                                     | PostgreSQL connection string.                             |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`         | Credentials for S3 bucket asset storage.                  |
| `AWS_S3_FILES_BUCKET_NAME` / `AWS_REGION`             | Target S3 bucket name and its AWS region.                 |
| `VITE_AWS_CLOUDFRONT_URL`                             | CloudFront Distribution URL linked to your S3 bucket.     |
| `OPENAI_API_KEY` / `OPENROUTER_API_KEY`               | API keys for Vercel AI SDK integrations.                  |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis credentials for caching.                    |
| `VITE_BASE_URL` / `VITE_BETTER_AUTH_URL`              | Host addresses for application and Better Auth endpoints. |

### Database Setup & Migrations

To generate and push the database schema to your PostgreSQL database, use Drizzle Kit commands:

```bash
# Generate SQL migration files
bun run migration:generate

# Apply migrations to the database
bun run migration:push
```

### Running the Application

To start the Vite development server locally on port `3000`:

```bash
bun run dev
```

> [!NOTE]
> The dev server does not start automatically. Make sure to run it manually using the above command.

### Building for Production

Compile the production bundle and preview it:

```bash
# Build the application
bun run build

# Preview the built version
bun run preview
```

---

## 🧪 Testing and Quality Control

- **Static Type Checking**: `bun run check`
- **Linting & Formatting**: `bun run format`
- **Running Tests**: `bun run test` (via Vitest)
