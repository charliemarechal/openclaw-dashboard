#!/usr/bin/env python3
"""
Generate JSON data files for Mission Control dashboard.
Parses session transcripts, cron jobs, and memory files.
"""

import json
import os
import subprocess
from pathlib import Path
from datetime import datetime, timedelta
import re
from typing import List, Dict, Any

# Paths
HOME = Path.home()
SESSIONS_DIR = HOME / ".openclaw" / "agents" / "main" / "sessions"
MEMORY_DIR = HOME / "clawd" / "memory"
MEMORY_FILE = HOME / "clawd" / "MEMORY.md"
CLAWD_DIR = HOME / "clawd"
OUTPUT_DIR = Path(__file__).parent / "data"

def parse_session_file(filepath: Path) -> List[Dict[str, Any]]:
    """Parse a single JSONL session file and extract activities."""
    activities = []
    
    try:
        with open(filepath, 'r') as f:
            for line in f:
                try:
                    entry = json.loads(line.strip())
                    
                    # Extract messages
                    if entry.get('type') == 'message':
                        msg = entry.get('message', {})
                        role = msg.get('role', '')
                        content_parts = msg.get('content', [])
                        timestamp = entry.get('timestamp', '')
                        
                        if role == 'assistant':
                            # Extract text content
                            text_content = ''
                            tool_calls = []
                            
                            for part in content_parts:
                                if isinstance(part, dict):
                                    if part.get('type') == 'text':
                                        text_content += part.get('text', '')
                                    elif part.get('type') == 'toolCall':
                                        tool_name = part.get('name', 'unknown')
                                        args = part.get('arguments', {})
                                        if isinstance(args, dict):
                                            if 'command' in args:
                                                tool_calls.append(f"{tool_name}: {args['command'][:100]}")
                                            elif 'path' in args:
                                                tool_calls.append(f"{tool_name}: {args['path']}")
                                            else:
                                                tool_calls.append(tool_name)
                                        else:
                                            tool_calls.append(tool_name)
                            
                            # Add tool calls as activities
                            for tc in tool_calls:
                                activities.append({
                                    'type': 'tool',
                                    'content': tc,
                                    'timestamp': timestamp,
                                    'session': filepath.stem
                                })
                            
                            # Add non-trivial messages
                            text_content = text_content.strip()
                            if text_content and len(text_content) > 5:
                                # Skip empty or very short responses
                                activities.append({
                                    'type': 'message',
                                    'content': text_content[:200] + ('...' if len(text_content) > 200 else ''),
                                    'timestamp': timestamp,
                                    'session': filepath.stem
                                })
                        
                        elif role == 'user':
                            # Extract user messages (for context)
                            for part in content_parts:
                                if isinstance(part, dict) and part.get('type') == 'text':
                                    text = part.get('text', '')[:150]
                                    if text and 'Telegram' in text:
                                        # Extract telegram messages
                                        activities.append({
                                            'type': 'message',
                                            'content': f"📨 {text[:200]}",
                                            'timestamp': timestamp,
                                            'session': filepath.stem
                                        })
                                        
                except json.JSONDecodeError:
                    continue
                    
    except Exception as e:
        print(f"Error parsing {filepath}: {e}")
    
    return activities


def get_cron_jobs() -> List[Dict[str, Any]]:
    """Get cron jobs from openclaw CLI."""
    try:
        result = subprocess.run(
            ['openclaw', 'cron', 'list', '--json'],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode == 0:
            jobs = json.loads(result.stdout)
            
            # Calculate next run times for the next 14 days
            processed = []
            for job in jobs:
                next_runs = calculate_next_runs(job.get('schedule', ''), job.get('next', ''))
                processed.append({
                    'id': job.get('id', ''),
                    'name': job.get('name', 'Unnamed'),
                    'schedule': job.get('schedule', ''),
                    'status': job.get('status', 'unknown'),
                    'lastRun': job.get('last', ''),
                    'nextRuns': next_runs
                })
            return processed
    except Exception as e:
        print(f"Error getting cron jobs: {e}")
        
        # Fallback: parse text output
        try:
            result = subprocess.run(
                ['openclaw', 'cron', 'list'],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                return parse_cron_text(result.stdout)
        except:
            pass
    
    return []


def parse_cron_text(output: str) -> List[Dict[str, Any]]:
    """Parse text output from openclaw cron list."""
    jobs = []
    lines = output.strip().split('\n')
    
    for line in lines[1:]:  # Skip header
        if not line.strip():
            continue
        
        # Parse the line - it's space-separated with variable columns
        parts = line.split()
        if len(parts) >= 6:
            job_id = parts[0]
            # Find where schedule starts (after name)
            # Name is at index 1, and schedule typically starts with 'cron' or 'every' or 'at'
            name_parts = []
            schedule_start = 2
            for i, p in enumerate(parts[1:], 1):
                if p in ('cron', 'every', 'at'):
                    schedule_start = i
                    break
                name_parts.append(p)
            
            name = ' '.join(name_parts) if name_parts else parts[1]
            
            # Find "in" marker for next run time
            try:
                in_idx = parts.index('in')
                schedule = ' '.join(parts[schedule_start:in_idx])
                
                # Calculate approximate next run from "in Xm", "in Xh", "in Xd"
                next_str = parts[in_idx + 1] if in_idx + 1 < len(parts) else ''
                next_runs = []
                
                if next_str:
                    now = datetime.now()
                    if next_str.endswith('m'):
                        mins = int(next_str[:-1])
                        next_time = now + timedelta(minutes=mins)
                        next_runs.append(next_time.isoformat())
                    elif next_str.endswith('h'):
                        hours = int(next_str[:-1])
                        next_time = now + timedelta(hours=hours)
                        next_runs.append(next_time.isoformat())
                    elif next_str.endswith('d'):
                        days = int(next_str[:-1])
                        next_time = now + timedelta(days=days)
                        next_runs.append(next_time.isoformat())
                
                jobs.append({
                    'id': job_id,
                    'name': name,
                    'schedule': schedule,
                    'status': 'ok',
                    'nextRuns': next_runs
                })
            except ValueError:
                # No "in" found, just add basic info
                jobs.append({
                    'id': job_id,
                    'name': name,
                    'schedule': ' '.join(parts[schedule_start:]),
                    'status': 'ok',
                    'nextRuns': []
                })
    
    return jobs


def calculate_next_runs(schedule: str, next_run: str) -> List[str]:
    """Calculate next run times for a job over the next 14 days."""
    runs = []
    
    if next_run and next_run != '-':
        # Parse the next run time
        try:
            if next_run.startswith('in '):
                # Relative time like "in 12m", "in 2h", "in 3d"
                time_str = next_run[3:].strip()
                now = datetime.now()
                
                match = re.match(r'(\d+)([mhd])', time_str)
                if match:
                    val = int(match.group(1))
                    unit = match.group(2)
                    
                    if unit == 'm':
                        next_time = now + timedelta(minutes=val)
                    elif unit == 'h':
                        next_time = now + timedelta(hours=val)
                    elif unit == 'd':
                        next_time = now + timedelta(days=val)
                    else:
                        next_time = now
                    
                    runs.append(next_time.isoformat())
                    
                    # For recurring jobs, add more occurrences
                    if 'cron' in schedule or 'every' in schedule:
                        # Estimate interval
                        if '*/30' in schedule or 'every 30m' in schedule:
                            interval = timedelta(minutes=30)
                        elif '*/15' in schedule or 'every 15m' in schedule:
                            interval = timedelta(minutes=15)
                        elif '0 *' in schedule or 'every 1h' in schedule:
                            interval = timedelta(hours=1)
                        elif '0 7' in schedule or '30 8' in schedule or '0 9' in schedule:
                            interval = timedelta(days=1)
                        elif '* * 1' in schedule or 'every week' in schedule:
                            interval = timedelta(weeks=1)
                        else:
                            interval = timedelta(days=1)
                        
                        # Add runs for next 14 days
                        current = next_time + interval
                        end_date = now + timedelta(days=14)
                        while current < end_date and len(runs) < 50:
                            runs.append(current.isoformat())
                            current += interval
        except Exception as e:
            print(f"Error calculating runs for {schedule}: {e}")
    
    return runs


def build_search_index() -> List[Dict[str, Any]]:
    """Build search index from memory files and sessions."""
    index = []
    
    # Index memory files
    if MEMORY_DIR.exists():
        for md_file in MEMORY_DIR.glob("*.md"):
            try:
                content = md_file.read_text()
                index.append({
                    'file': f"memory/{md_file.name}",
                    'type': 'memory',
                    'content': content
                })
            except Exception as e:
                print(f"Error reading {md_file}: {e}")
    
    # Index main MEMORY.md
    if MEMORY_FILE.exists():
        try:
            content = MEMORY_FILE.read_text()
            index.append({
                'file': 'MEMORY.md',
                'type': 'memory',
                'content': content
            })
        except Exception as e:
            print(f"Error reading MEMORY.md: {e}")
    
    # Index other .md files in clawd
    for md_file in CLAWD_DIR.glob("*.md"):
        if md_file.name == 'MEMORY.md':
            continue
        try:
            content = md_file.read_text()
            index.append({
                'file': md_file.name,
                'type': 'notes',
                'content': content
            })
        except Exception as e:
            print(f"Error reading {md_file}: {e}")
    
    # Index recent sessions (last 20)
    if SESSIONS_DIR.exists():
        session_files = sorted(SESSIONS_DIR.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)[:20]
        
        for sf in session_files:
            try:
                content_parts = []
                with open(sf, 'r') as f:
                    for line in f:
                        try:
                            entry = json.loads(line)
                            if entry.get('type') == 'message':
                                msg = entry.get('message', {})
                                for part in msg.get('content', []):
                                    if isinstance(part, dict) and part.get('type') == 'text':
                                        content_parts.append(part.get('text', ''))
                        except:
                            continue
                
                if content_parts:
                    index.append({
                        'file': f"session/{sf.stem[:8]}...",
                        'type': 'session',
                        'content': '\n'.join(content_parts)[:10000]  # Limit size
                    })
            except Exception as e:
                print(f"Error indexing session {sf}: {e}")
    
    return index


def main():
    print("🔮 Generating Mission Control data...")
    
    # Create output directory
    OUTPUT_DIR.mkdir(exist_ok=True)
    
    # Parse session files
    print("📊 Parsing session files...")
    all_activities = []
    
    if SESSIONS_DIR.exists():
        session_files = sorted(SESSIONS_DIR.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)[:30]
        
        for sf in session_files:
            activities = parse_session_file(sf)
            all_activities.extend(activities)
    
    # Sort by timestamp
    all_activities.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
    
    # Write activity data
    with open(OUTPUT_DIR / 'activity.json', 'w') as f:
        json.dump(all_activities[:500], f, indent=2)
    print(f"  → {len(all_activities)} activities found")
    
    # Get cron jobs
    print("📅 Getting cron jobs...")
    cron_jobs = get_cron_jobs()
    
    with open(OUTPUT_DIR / 'cron.json', 'w') as f:
        json.dump(cron_jobs, f, indent=2)
    print(f"  → {len(cron_jobs)} cron jobs found")
    
    # Build search index
    print("🔍 Building search index...")
    search_index = build_search_index()
    
    with open(OUTPUT_DIR / 'search-index.json', 'w') as f:
        json.dump(search_index, f, indent=2)
    print(f"  → {len(search_index)} documents indexed")
    
    print("✅ Data generation complete!")
    print(f"   Output: {OUTPUT_DIR}")


if __name__ == '__main__':
    main()
