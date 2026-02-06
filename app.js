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
                    return `<div class="calendar-event ${job.schedule.startsWith('cron') ? 'recurring' : ''}" title="${job.name}\n${job.schedule}">${time} ${job.name}</div>`;
                }).join('')}
            </div>
        `;
    }
    
    grid.innerHTML = html;
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
