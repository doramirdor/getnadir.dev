# Nadir Admin Dashboard

## Overview

Nadir Admin Dashboard is a modern, full-featured admin interface for managing, monitoring, and optimizing LLM (Large Language Model) providers, API keys, users, billing, and more. It provides intelligent LLM routing, cost optimization, comprehensive analytics, and seamless integrations—all in a clean, minimalist UI.

## Features

- **Dashboard:** Overview of usage, costs, latency, and top models.
- **Analytics:** Deep insights into LLM usage patterns, costs, and performance.
- **API Keys:** Create, manage, and secure API keys with advanced controls.
- **Presets:** Save and manage prompt/model configurations for quick reuse.
- **Clustering:** Upload prompts and generate intelligent clusters for better routing.
- **Playground:** Test prompts and models interactively.
- **Providers:** View and manage all available LLM providers and their models.
- **Users:** Manage user accounts, roles, and permissions.
- **Billing:** Monitor usage, manage plans, credits, and payment methods.
- **Logs:** Audit API requests, responses, and system events.
- **Settings:** Configure provider access, budgets, notifications, and more.
- **Integrations:** Connect with third-party tools and BYOK (Bring Your Own Key) providers.

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm (v9+ recommended)

### Setup

```sh
# 1. Clone the repository
 git clone <YOUR_GIT_URL>
 cd <YOUR_PROJECT_NAME>

# 2. Install dependencies
 npm install

# 3. Start the development server
 npm run dev
```

The app will be available at [http://localhost:5173](http://localhost:5173) by default.

## Tech Stack
- [Vite](https://vitejs.dev/) (build tool)
- [React](https://react.dev/) (UI framework)
- [TypeScript](https://www.typescriptlang.org/) (type safety)
- [shadcn/ui](https://ui.shadcn.com/) (UI components)
- [Tailwind CSS](https://tailwindcss.com/) (utility-first styling)
- [Supabase](https://supabase.com/) (backend/auth/DB)
- [Lucide Icons](https://lucide.dev/)
- [TanStack React Query](https://tanstack.com/query/latest)

## Deployment

You can deploy the dashboard to any modern hosting provider (Vercel, Netlify, etc.) or your own infrastructure. Make sure to configure your environment variables for Supabase and any integrations.

## License

This project is licensed under the MIT License.

---

> UI: Clean, modern, and accessible. For design details, see `UI_REDESIGN_SUMMARY.md`.
