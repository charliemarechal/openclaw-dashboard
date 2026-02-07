// Mission Control - OpenClaw Dashboard

// State
let activityData = [];
let cronData = [];
let searchIndex = [];
let currentWeekStart = getWeekStart(new Date());

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    updateClock();
    setInterval(updateClock, 1000);
    
    initTabs();
    initModal();
    loadAllData();
});

function updateClock() {
    const now = new Date();
    document.getElementById('current-time').textContent = now.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Tab Navigation
function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
        });
    });
    
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderActivityList(btn.dataset.filter);
        });
    });
    
    // Calendar navigation
    document.getElementById('prev-week').addEventListener('click', () => {
        currentWeekStart = new Date(currentWeekStart);
        currentWeekStart.setDate(currentWeekStart.getDate() - 7);
        renderCalendar();
    });
    
    document.getElementById('next-week').addEventListener('click', () => {
        currentWeekStart = new Date(currentWeekStart);
        currentWeekStart.setDate(currentWeekStart.getDate() + 7);
        renderCalendar();
    });
    
    document.getElementById('today-btn').addEventListener('click', () => {
        currentWeekStart = getWeekStart(new Date());
        renderCalendar();
    });
    
    // Search
    let searchTimeout;
    document.getElementById('search-input').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => performSearch(e.target.value), 300);
    });
}

// Load all data
async function loadAllData() {
    try {
        const [activity, cron, search] = await Promise.all([
            fetch('data/activity.json').then(r => r.json()).catch(() => []),
            fetch('data/cron.json').then(r => r.json()).catch(() => []),
            fetch('data/search-index.json').then(r => r.json()).catch(() => [])
        ]);
        
        activityData = activity;
        cronData = cron;
        searchIndex = search;
        
        renderActivityList('all');
        renderActivityStats();
        renderCalendar();
    } catch (e) {
        console.error('Error loading data:', e);
        document.getElementById('activity-list').innerHTML = 
            '<div class="empty-state">Error loading data. Run generate_data.py to create data files.</div>';
    }
}

// Activity Feed
function renderActivityList(filter) {
    const list = document.getElementById('activity-list');
    
    let filtered = activityData;
    if (filter !== 'all') {
        filtered = activityData.filter(item => item.type === filter);
    }
    
    if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-state">No activity found.</div>';
        return;
    }
    
    list.innerHTML = filtered.slice(0, 100).map(item => `
        <div class="activity-item">
            <div class="activity-meta">
                <span class="activity-time">${formatTime(item.timestamp)}</span>
                <span class="activity-type ${item.type}">${item.type}</span>
            </div>
            <div class="activity-content">${escapeHtml(item.content)}</div>
        </div>
    `).join('');
}

function renderActivityStats() {
    const stats = document.getElementById('activity-stats');
    
    const toolCalls = activityData.filter(i => i.type === 'tool').length;
    const messages = activityData.filter(i => i.type === 'message').length;
    const cronRuns = activityData.filter(i => i.type === 'cron').length;
    
    stats.innerHTML = `
        <div class="stat">
            <span class="stat-value">${activityData.length}</span>
            <span class="stat-label">Total Events</span>
        </div>
        <div class="stat">
            <span class="stat-value">${toolCalls}</span>
            <span class="stat-label">Tool Calls</span>
        </div>
        <div class="stat">
            <span class="stat-value">${messages}</span>
            <span class="stat-label">Messages</span>
        </div>
        <div class="stat">
            <span class="stat-value">${cronRuns}</span>
            <span class="stat-label">Cron Runs</span>
        </div>
    `;
}

// Calendar
function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const title = document.getElementById('calendar-title');
    
    const weekStart = new Date(currentWeekStart);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    title.textContent = weekStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date().toDateString();
    
    let html = days.map(d => `<div class="calendar-day-header">${d}</div>`).join('');
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + i);
        const dateStr = date.toDateString();
        const isToday = dateStr === today;
        
        // Find events for this day
        const dayEvents = cronData.filter(job => {
            if (!job.nextRuns) return false;
            return job.nextRuns.some(run => {
                const runDate = new Date(run);
                return runDate.toDateString() === dateStr;
            });
        });
        
        html += `
            <div class="calendar-day ${isToday ? 'today' : ''}" data-day="${days[i]}">
                <div class="calendar-day-number">${date.getDate()}</div>
                ${dayEvents.map(job => {
                    const runTime = job.nextRuns.find(r => new Date(r).toDateString() === dateStr);
                    const time = new Date(runTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    const isRecurring = (typeof job.schedule === 'object') 
                        ? (job.schedule.kind === 'cron' || job.schedule.kind === 'every')
                        : (job.schedule && job.schedule.startsWith('cron'));
                    return `<div class="calendar-event ${isRecurring ? 'recurring' : ''}" data-job-id="${job.id}" title="${job.name}">${time} ${job.name}</div>`;
                }).join('')}
            </div>
        `;
    }
    
    grid.innerHTML = html;
    
    // Add click handlers to calendar events
    grid.querySelectorAll('.calendar-event').forEach(eventEl => {
        eventEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const jobId = eventEl.dataset.jobId;
            const job = cronData.find(j => j.id === jobId);
            if (job) {
                openJobModal(job);
            }
        });
    });
}

// Search
function performSearch(query) {
    const results = document.getElementById('search-results');
    
    if (!query.trim()) {
        results.innerHTML = '<div class="empty-state">Enter a search query to find content across memory and sessions.</div>';
        return;
    }
    
    const queryLower = query.toLowerCase();
    const matches = searchIndex.filter(item => 
        item.content.toLowerCase().includes(queryLower)
    );
    
    if (matches.length === 0) {
        results.innerHTML = `<div class="empty-state">No results found for "${escapeHtml(query)}"</div>`;
        return;
    }
    
    results.innerHTML = matches.slice(0, 50).map(item => {
        // Find snippet around the match
        const content = item.content;
        const idx = content.toLowerCase().indexOf(queryLower);
        const start = Math.max(0, idx - 50);
        const end = Math.min(content.length, idx + query.length + 100);
        let snippet = (start > 0 ? '...' : '') + content.slice(start, end) + (end < content.length ? '...' : '');
        
        // Highlight matches
        const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
        snippet = escapeHtml(snippet).replace(regex, '<mark>$1</mark>');
        
        return `
            <div class="search-result">
                <div class="search-result-header">
                    <span class="search-result-file">${escapeHtml(item.file)}</span>
                    <span class="search-result-type">${item.type}</span>
                </div>
                <div class="search-result-content">${snippet}</div>
            </div>
        `;
    }).join('');
}

// Utilities
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Modal Functions
function initModal() {
    const modal = document.getElementById('job-modal');
    const closeBtn = document.getElementById('modal-close');
    
    // Close on X button
    closeBtn.addEventListener('click', closeModal);
    
    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
        }
    });
}

function openJobModal(job) {
    const modal = document.getElementById('job-modal');
    
    // Populate modal fields
    document.getElementById('modal-job-name').textContent = job.name;
    document.getElementById('modal-schedule').textContent = parseScheduleToHuman(job.schedule);
    document.getElementById('modal-description').textContent = getJobDescription(job);
    
    // Next run
    if (job.nextRuns && job.nextRuns.length > 0) {
        const nextRun = new Date(job.nextRuns[0]);
        document.getElementById('modal-next-run').textContent = formatDateTime(nextRun);
    } else {
        document.getElementById('modal-next-run').textContent = 'Not scheduled';
    }
    
    // Last run (if available)
    const lastRunField = document.getElementById('modal-last-run-field');
    if (job.lastRun) {
        const lastRun = new Date(job.lastRun);
        document.getElementById('modal-last-run').textContent = formatDateTime(lastRun);
        lastRunField.style.display = 'flex';
    } else {
        lastRunField.style.display = 'none';
    }
    
    // Handler (model)
    const handlerField = document.getElementById('modal-handler-field');
    if (job.model) {
        // Show short model name (e.g., "grok-4.1-fast" from "openrouter/x-ai/grok-4.1-fast")
        const modelParts = job.model.split('/');
        const shortModel = modelParts[modelParts.length - 1];
        document.getElementById('modal-handler').textContent = shortModel;
        document.getElementById('modal-handler').title = job.model; // Full name on hover
        handlerField.style.display = 'flex';
    } else {
        handlerField.style.display = 'none';
    }
    
    // Script
    const scriptField = document.getElementById('modal-script-field');
    if (job.script) {
        document.getElementById('modal-script').textContent = job.script;
        scriptField.style.display = 'flex';
    } else {
        scriptField.style.display = 'none';
    }
    
    // Status
    const statusEl = document.getElementById('modal-status');
    statusEl.textContent = job.status || 'unknown';
    statusEl.className = 'modal-value modal-status ' + (job.status || 'pending');
    
    // Show modal
    modal.classList.add('active');
}

function closeModal() {
    document.getElementById('job-modal').classList.remove('active');
}

function parseScheduleToHuman(schedule) {
    if (!schedule) return 'Unknown schedule';
    
    // Handle new object format: { kind: "cron"|"every"|"at", ... }
    if (typeof schedule === 'object') {
        const kind = schedule.kind;
        
        if (kind === 'every') {
            const everyMs = schedule.everyMs || 0;
            if (everyMs >= 86400000) {
                const days = Math.round(everyMs / 86400000);
                return `Every ${days} day${days > 1 ? 's' : ''}`;
            } else if (everyMs >= 3600000) {
                const hours = Math.round(everyMs / 3600000);
                return `Every ${hours} hour${hours > 1 ? 's' : ''}`;
            } else {
                const mins = Math.round(everyMs / 60000);
                return `Every ${mins} minute${mins > 1 ? 's' : ''}`;
            }
        }
        
        if (kind === 'at') {
            const atStr = schedule.at;
            if (atStr) {
                const date = new Date(atStr);
                return `One-time: ${formatDateTime(date)}`;
            }
            return 'One-time job';
        }
        
        if (kind === 'cron') {
            const expr = schedule.expr || '';
            const tz = schedule.tz ? ` (${schedule.tz})` : '';
            return parseCronToHuman(expr) + tz;
        }
        
        return JSON.stringify(schedule);
    }
    
    // Handle legacy string formats
    // Handle "every Xm" format
    if (schedule.startsWith('every ')) {
        const match = schedule.match(/every (\d+)([mhd])/);
        if (match) {
            const value = match[1];
            const unit = match[2];
            const unitNames = { m: 'minute', h: 'hour', d: 'day' };
            return `Every ${value} ${unitNames[unit]}${value > 1 ? 's' : ''}`;
        }
        return schedule;
    }
    
    // Handle "at YYYY-MM-DD HH:MMZ" format (one-time)
    if (schedule.startsWith('at ')) {
        const dateStr = schedule.replace('at ', '').replace('Z', '');
        const date = new Date(dateStr + 'Z');
        return `One-time: ${formatDateTime(date)}`;
    }
    
    // Handle cron format
    if (schedule.startsWith('cron ')) {
        const cronPart = schedule.replace('cron ', '').split(' @ ')[0];
        return parseCronToHuman(cronPart);
    }
    
    return schedule;
}

function parseCronToHuman(cron) {
    const parts = cron.trim().split(/\s+/);
    if (parts.length < 5) return cron;
    
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    
    // Every X minutes
    if (minute.startsWith('*/') && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
        const interval = minute.replace('*/', '');
        return `Every ${interval} minutes`;
    }
    
    // Range of hours with minute interval (e.g., */30 6-23)
    if (minute.startsWith('*/') && hour.includes('-')) {
        const interval = minute.replace('*/', '');
        const [startHour, endHour] = hour.split('-').map(h => parseInt(h));
        const startTime = formatHour(startHour);
        const endTime = formatHour(endHour);
        return `Every ${interval} min from ${startTime} to ${endTime}`;
    }
    
    // Hourly
    if (minute !== '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
        return `Every hour at :${minute.padStart(2, '0')}`;
    }
    
    // Daily at specific time
    if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
        const time = formatHourMinute(parseInt(hour), parseInt(minute));
        return `Every day at ${time}`;
    }
    
    // Multiple times per day
    if (minute !== '*' && hour.includes(',') && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
        const hours = hour.split(',').map(h => formatHourMinute(parseInt(h), parseInt(minute)));
        return `Daily at ${hours.join(' and ')}`;
    }
    
    // Weekly on specific day
    if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const time = formatHourMinute(parseInt(hour), parseInt(minute));
        const day = days[parseInt(dayOfWeek)] || dayOfWeek;
        return `Every ${day} at ${time}`;
    }
    
    return `Cron: ${cron}`;
}

function formatHour(h) {
    const hour = parseInt(h);
    if (hour === 0) return '12 AM';
    if (hour === 12) return '12 PM';
    if (hour < 12) return `${hour} AM`;
    return `${hour - 12} PM`;
}

function formatHourMinute(h, m) {
    const hour = h % 12 || 12;
    const ampm = h < 12 ? 'AM' : 'PM';
    const min = m.toString().padStart(2, '0');
    return `${hour}:${min} ${ampm}`;
}

function formatDateTime(date) {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const isToday = date.toDateString() === now.toDateString();
    const isTomorrow = date.toDateString() === tomorrow.toDateString();
    
    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    
    if (isToday) return `Today at ${time}`;
    if (isTomorrow) return `Tomorrow at ${time}`;
    
    const dateStr = date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
    });
    return `${dateStr} at ${time}`;
}

function getJobDescription(job) {
    // Generate a description based on job name if not provided
    if (job.description) return job.description;
    
    const name = job.name.toLowerCase();
    
    // Common patterns
    if (name.includes('news brief')) return 'Fetches and delivers a curated news summary';
    if (name.includes('inbox') || name.includes('email')) return 'Monitors and processes incoming emails';
    if (name.includes('watchdog')) return 'Health check and monitoring service';
    if (name.includes('sync') || name.includes('→')) return 'Syncs data between integrated services';
    if (name.includes('scraper')) return 'Collects and processes web content';
    if (name.includes('newsletter')) return 'Processes and organizes newsletter content';
    if (name.includes('competitor')) return 'Monitors competitor activity and updates';
    if (name.includes('healthcheck')) return 'System health and status verification';
    if (name.includes('refresh') || name.includes('update')) return 'Refreshes cached data and updates';
    if (name.includes('cozy') || name.includes('light')) return 'Smart home automation task';
    if (name.includes('pay') || name.includes('invoice')) return 'Automated payment processing';
    if (name.includes('security')) return 'Security audit and compliance check';
    
    return 'Scheduled automation task';
}
