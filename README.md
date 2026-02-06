# Mission Control - OpenClaw Dashboard

A simple dashboard to monitor OpenClaw activity, scheduled jobs, and search through memory/sessions.

## Features

### 📊 Activity Feed
- View recent actions and tasks completed
- Filter by type: tool calls, messages, cron jobs
- Parsed from session transcripts

### 📅 Calendar View
- Weekly calendar of scheduled cron jobs
- Shows job names, schedules, next run times
- Navigate between weeks

### 🔍 Global Search
- Search through memory files (`~/clawd/memory/*.md`)
- Search through session transcripts
- Highlighted search results

## Setup

### Generate Data
```bash
python3 generate_data.py
```

This parses:
- Session files from `~/.openclaw/agents/main/sessions/*.jsonl`
- Cron jobs from `openclaw cron list`
- Memory files from `~/clawd/`

### Run Locally
```bash
python3 -m http.server 8080
# Open http://localhost:8080
```

### Deploy to Vercel
```bash
vercel --prod
```

## Data Refresh

Run `generate_data.py` periodically to refresh the dashboard data. You can set up a cron job:

```bash
openclaw cron add --name "Dashboard Data Refresh" --schedule "0 * * * *" --prompt "Run generate_data.py in ~/Developer/openclaw-dashboard"
```

## Stack

- Static HTML/CSS/JS (no build step)
- Python for data generation
- Dark theme inspired by Circensia dashboard
