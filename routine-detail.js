// Configuração da API (api-base.js define window.__EC_API_BASE__ em localhost:3000 com node server.js)
const API_URL =
    (typeof window !== 'undefined' && window.__EC_API_BASE__) ||
    '/api';

/** Redirecionamentos para o dashboard na grelha de cards (não na visão geral). */
const DASHBOARD_CARDS_URL = 'dashboard.html?view=cards';

function navigateToDashboardCards() {
    autoSaveStudyProgressIfNeeded({ reason: 'navigate' })
        .catch(function () { /* ignore */ })
        .then(function () {
            window.location.href = DASHBOARD_CARDS_URL;
        });
}

/** Mesma lógica do dashboard: "hoje" em YYYY-MM-DD no fuso local (evita UTC com toISOString). */
function getLocalDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function normalizeDateStr(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    var match = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
}

function formatHeatmapHoverDay(dateStr) {
    if (!dateStr) return '—';
    var d = new Date(dateStr + 'T12:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace(/\.$/, '');
}

function escapeAttr(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

function buildHeatmapCellTooltipAttrs(dayLabel, ariaLabel) {
    return ' data-tip="' + escapeAttr(dayLabel) + '" aria-label="' + escapeAttr(ariaLabel) + '" tabindex="0"';
}

function isRoutineWeekday(dateStr, routine) {
    if (!routine || !routine.schedule) return true;
    const weekDays = routine.schedule.weekDays;
    const planType = routine.planType || 'daily';
    if (!weekDays || !Array.isArray(weekDays)) return true;
    const d = new Date(dateStr + 'T12:00:00');
    const dayOfWeek = d.getDay();
    return weekDays.indexOf(dayOfWeek) !== -1;
}

function isRoutineDate(dateStr, routine) {
    if (!routine) return false;
    if (!routine.schedule) return true;
    const d = new Date(dateStr + 'T12:00:00');
    const planType = routine.planType || 'daily';
    const s = routine.schedule;
    if (planType === 'monthly' && s.monthlyType === 'dayOfMonth' && s.dayOfMonth != null) {
        return d.getDate() === Number(s.dayOfMonth);
    }
    if (planType === 'monthly' && s.monthlyType === 'weekOfMonth' && (s.weekOfMonth != null || s.dayOfWeek != null)) {
        const dayOfWeek = d.getDay();
        const weekOfMonth = s.weekOfMonth === 'last' ? 5 : parseInt(s.weekOfMonth, 10);
        const targetDow = s.dayOfWeek != null ? Number(s.dayOfWeek) : dayOfWeek;
        if (dayOfWeek !== targetDow) return false;
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        if (s.weekOfMonth === 'last') {
            let lastMatch = null;
            for (let day = lastDay.getDate(); day >= 1; day--) {
                const dt = new Date(d.getFullYear(), d.getMonth(), day);
                if (dt.getDay() === targetDow) {
                    lastMatch = day;
                    break;
                }
            }
            return lastMatch !== null && d.getDate() === lastMatch;
        }
        let n = 0;
        for (let day = 1; day <= d.getDate(); day++) {
            const dt = new Date(d.getFullYear(), d.getMonth(), day);
            if (dt.getDay() === targetDow) n++;
        }
        return n === weekOfMonth;
    }
    return isRoutineWeekday(dateStr, routine);
}

function isRoutineDayClosedOut(routine, dateStr) {
    if (!routine || !dateStr) return false;
    const checkIns = routine.checkIns || [];
    if (checkIns.indexOf(dateStr) !== -1) return true;
    const tasks = routine.tasks || [];
    if (tasks.length === 0) return false;
    return tasks.every(function (t) {
        const dates = t.completedDates || [];
        return dates.indexOf(dateStr) !== -1;
    });
}

function normalizeRoutineDateStr(dateStr) {
    if (!dateStr) return '';
    return String(dateStr).slice(0, 10);
}

function collectRoutineCompletionDates(routine) {
    var dates = new Set();
    if (!routine) return dates;
    (routine.checkIns || []).forEach(function (d) {
        var n = normalizeRoutineDateStr(d);
        if (n) dates.add(n);
    });
    (routine.tasks || []).forEach(function (task) {
        (task.completedDates || []).forEach(function (d) {
            var n = normalizeRoutineDateStr(d);
            if (n) dates.add(n);
        });
    });
    return dates;
}

function getRoutineTotalCompletedScheduledDays(routine) {
    if (!routine) return 0;
    var dates = collectRoutineCompletionDates(routine);
    var count = 0;
    dates.forEach(function (d) {
        if (isRoutineDate(d, routine) && isRoutineDayClosedOut(routine, d)) {
            count++;
        }
    });
    return count;
}

function scheduleTimeHasPassedToday(schedule) {
    if (!schedule || !schedule.time) return false;
    const now = new Date();
    const parts = String(schedule.time).trim().split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) || 0;
    const hour = isNaN(h) ? 0 : h;
    const min = isNaN(m) ? 0 : m;
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, min, 0, 0);
    return now.getTime() >= target.getTime();
}

function shouldShowTaskAwaitingConfirmHint(routine, task, dateStr) {
    if (!routine || !routine.schedule || !routine.schedule.time) return false;
    const todayStr = getLocalDateStr(new Date());
    if (dateStr !== todayStr) return false;
    if (!isRoutineDate(dateStr, routine)) return false;
    if (!scheduleTimeHasPassedToday(routine.schedule)) return false;
    if (isRoutineDayClosedOut(routine, dateStr)) return false;
    if (task && task._synthetic) return true;
    const dates = task && task.completedDates ? task.completedDates : [];
    return dates.indexOf(dateStr) === -1;
}

let currentRoutine = null;

/** Cronómetro ativo — uma sessão por rotina (categoria Estudos) */
var studyActiveRuntime = {
    accumulatedMs: 0,
    startedAt: null,
    intervalId: null,
    sessionStartedAt: null
};

var studyUiState = {
    subject: '',
    subjectId: '',
    subjectColor: '',
    subjectIcon: 'book-open',
    description: '',
    fullscreenMode: false,
    finishModalOpen: false,
    pendingFinish: null,
    subjectModalAutoStart: false,
    subjectCreateColor: '#22c55e',
    subjectCreateIcon: 'book-open'
};

var _studySubjectModalEventsBound = false;
var _studySubjectInsightsEventsBound = false;

var studySessionTableState = {
    page: 1,
    pageSize: 10,
    showDeleted: false
};

var studySessionRowMenuState = {
    sessionId: null,
    anchor: null
};

var _studySessionRowMenuBound = false;

var _studyTimerEventsBound = false;
var _studyFinishModalEventsBound = false;
var _studyConfirmModalEventsBound = false;
var _studyConfirmResolver = null;
var _studyUiShellEventsBound = false;

function isEstudosCategory(category) {
    if (!category) return false;
    if (typeof category === 'string') {
        var s = category.trim().toLowerCase();
        return s === 'estudos' || s === 'estudo';
    }
    if (typeof category === 'object') {
        var id = String(category.id || '').trim().toLowerCase();
        var name = String(category.name || '').trim().toLowerCase();
        return id === 'estudos' || id === 'estudo' || name === 'estudos' || name === 'estudo';
    }
    return false;
}

function normalizeRoutineCategory(routine) {
    if (!routine || routine.category == null) return;
    if (typeof routine.category === 'string') {
        try {
            var parsed = JSON.parse(routine.category);
            if (parsed && typeof parsed === 'object') {
                routine.category = parsed;
                return;
            }
        } catch (e) { /* ignore */ }
        routine.category = {
            id: routine.category.trim().toLowerCase(),
            name: routine.category,
            icon: isEstudosCategory(routine.category) ? 'book-open' : 'clipboard-list'
        };
    }
}

function isEstudosRoutine(routine) {
    if (!routine) return false;
    normalizeRoutineCategory(routine);
    return isEstudosCategory(routine.category);
}

function migrateStudySession(session, task) {
    if (!session || typeof session !== 'object') return null;
    var endedAt = session.endedAt || new Date().toISOString();
    var durationSeconds = Math.max(0, Math.floor(session.durationSeconds || 0));
    var endedDate = new Date(endedAt);
    var startedAt = session.startedAt;
    if (!startedAt && durationSeconds > 0 && !isNaN(endedDate.getTime())) {
        startedAt = new Date(endedDate.getTime() - durationSeconds * 1000).toISOString();
    }
    if (!startedAt) startedAt = endedAt;
    return {
        id: session.id || ('sess-' + String(endedAt) + '-' + Math.random().toString(36).slice(2, 8)),
        taskId: session.taskId || (task && task.id) || '',
        subject: session.subject || (task && task.text) || 'Tarefa',
        description: session.description || '',
        startedAt: startedAt,
        endedAt: endedAt,
        durationSeconds: durationSeconds,
        createdAt: session.createdAt || endedAt,
        status: session.status === 'pending' ? 'pending' : 'completed'
    };
}

function recalculateStudyTotalSeconds(task) {
    if (!task || !task.studyTime || !Array.isArray(task.studyTime.sessions)) return 0;
    return task.studyTime.sessions.reduce(function (acc, s) {
        if (s.status !== 'completed') return acc;
        return acc + Math.max(0, Math.floor(s.durationSeconds || 0));
    }, 0);
}

function createStudySessionRecord(pending) {
    var now = new Date().toISOString();
    var endedAt = pending.endedAt || now;
    var rec = {
        id: 'sess-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        date: normalizeDateStr(endedAt),
        taskId: pending.taskId || '',
        subject: (pending.subject || '').trim() || 'Estudo',
        description: pending.description || '',
        startedAt: pending.startedAt,
        endedAt: endedAt,
        durationSeconds: pending.durationSeconds,
        createdAt: now,
        status: 'completed'
    };
    var core = getStudyCore();
    if (core) return core.migrateStudySessionRecord(rec, null);
    return rec;
}

function ensureStudyTime(task) {
    if (!task.studyTime || typeof task.studyTime !== 'object') {
        task.studyTime = { totalSeconds: 0, sessions: [] };
        return;
    }
    if (typeof task.studyTime.totalSeconds !== 'number' || isNaN(task.studyTime.totalSeconds)) {
        task.studyTime.totalSeconds = 0;
    }
    if (!Array.isArray(task.studyTime.sessions)) {
        task.studyTime.sessions = [];
    }
    task.studyTime.sessions = task.studyTime.sessions.map(function (s) {
        return migrateStudySession(s, task);
    }).filter(Boolean);
    task.studyTime.totalSeconds = recalculateStudyTotalSeconds(task);
}

function getStudyCore() {
    return typeof StudyRoutineCore !== 'undefined' ? StudyRoutineCore : null;
}

function normalizeEstudosRoutine(routine) {
    if (!routine || !isEstudosRoutine(routine)) return;
    var core = getStudyCore();
    if (core) {
        core.normalizeEstudosRoutineData(routine);
    } else if (!Array.isArray(routine.studySessions)) {
        routine.studySessions = [];
    }
    if (routine.tasks) routine.tasks.forEach(ensureStudyTime);
}

function normalizeEstudosTasks(routine) {
    normalizeEstudosRoutine(routine);
}

function studyDraftKey(routineId) {
    return 'ecStudyDraft_v2_' + routineId;
}

var studyDraftPersistIntervalId = null;
var studyAutosaveUnloadDone = false;

function startStudyDraftPersistLoop() {
    if (studyDraftPersistIntervalId) return;
    studyDraftPersistIntervalId = setInterval(function () {
        if (!currentRoutine || !isEstudosRoutine(currentRoutine)) return;
        if (isStudyTimerRunning() || currentDraftMs() >= 1000 || studyUiState.pendingFinish) {
            persistStudyDraftsToStorage();
        }
    }, 10000);
}

function stopStudyDraftPersistLoop() {
    if (studyDraftPersistIntervalId) {
        clearInterval(studyDraftPersistIntervalId);
        studyDraftPersistIntervalId = null;
    }
}

function getStudyActiveRuntime() {
    return studyActiveRuntime;
}

function disposeStudyIntervals() {
    var r = studyActiveRuntime;
    if (r.intervalId) {
        clearInterval(r.intervalId);
        r.intervalId = null;
    }
    if (r.startedAt) {
        r.accumulatedMs += Date.now() - r.startedAt;
        r.startedAt = null;
    }
}

function currentDraftMs() {
    var r = studyActiveRuntime;
    var ms = r.accumulatedMs;
    if (r.startedAt) {
        ms += Date.now() - r.startedAt;
    }
    return ms;
}

function isStudyTimerRunning() {
    return !!studyActiveRuntime.startedAt;
}

function getStudySubjectPalette() {
    var core = getStudyCore();
    return core && core.STUDY_SUBJECT_PALETTE ? core.STUDY_SUBJECT_PALETTE : [
        '#22c55e', '#3b82f6', '#a855f7', '#f59e0b',
        '#ef4444', '#06b6d4', '#ec4899', '#84cc16'
    ];
}

function getStudySubjectIcons() {
    var core = getStudyCore();
    return core && core.STUDY_SUBJECT_ICONS ? core.STUDY_SUBJECT_ICONS : [
        'book-open', 'calculator', 'flask-conical', 'code',
        'languages', 'music', 'palette', 'brain'
    ];
}

function getRoutineStudySubjects(routine) {
    if (!routine) return [];
    normalizeEstudosRoutine(routine);
    var core = getStudyCore();
    if (core && core.getStudySubjects) return core.getStudySubjects(routine);
    return Array.isArray(routine.studySubjects) ? routine.studySubjects : [];
}

function mergeRoutineStudyFieldsFromLocal(serverRoutine) {
    if (!serverRoutine || !serverRoutine.id) return serverRoutine;
    try {
        var local = JSON.parse(localStorage.getItem('localRoutines') || '[]');
        var loc = local.find(function (r) { return String(r.id) === String(serverRoutine.id); });
        if (!loc) return serverRoutine;
        var core = getStudyCore();
        if (core && core.mergeStudySubjectsList) {
            serverRoutine.studySubjects = core.mergeStudySubjectsList(
                serverRoutine.studySubjects,
                loc.studySubjects
            );
        } else {
            serverRoutine.studySubjects = loc.studySubjects || serverRoutine.studySubjects || [];
        }
        if (Array.isArray(loc.studySessions) && loc.studySessions.length) {
            var sessionIds = {};
            (serverRoutine.studySessions || []).forEach(function (s) {
                if (s && s.id) sessionIds[String(s.id)] = true;
            });
            if (!Array.isArray(serverRoutine.studySessions)) serverRoutine.studySessions = [];
            loc.studySessions.forEach(function (s) {
                if (s && s.id && !sessionIds[String(s.id)]) {
                    serverRoutine.studySessions.push(s);
                }
            });
        }
    } catch (e) { /* ignore */ }
    return serverRoutine;
}

function ensureStudySubjectInCatalog(routine, input) {
    if (!routine || !input) return null;
    var name = String(input.name || input.subject || '').trim();
    if (!name || name === 'Estudo') return null;
    var core = getStudyCore();
    if (core && core.upsertStudySubject) {
        return core.upsertStudySubject(routine, {
            id: input.id || input.subjectId || '',
            name: name,
            color: input.color || input.subjectColor,
            icon: input.icon || input.subjectIcon,
            notes: input.notes !== undefined ? input.notes : (input.description || '')
        });
    }
    if (!Array.isArray(routine.studySubjects)) routine.studySubjects = [];
    var existing = routine.studySubjects.find(function (s) {
        return String(s.name || '').trim().toLowerCase() === name.toLowerCase();
    });
    if (existing) return existing;
    routine.studySubjects.push({
        id: 'subj-' + Date.now(),
        name: name,
        color: input.color || input.subjectColor || '#22c55e',
        icon: input.icon || input.subjectIcon || 'book-open',
        notes: String(input.notes !== undefined ? input.notes : (input.description || '')).trim(),
        createdAt: new Date().toISOString()
    });
    return routine.studySubjects[routine.studySubjects.length - 1];
}

function findRoutineStudySubject(routine, subjectId) {
    if (!subjectId) return null;
    return getRoutineStudySubjects(routine).find(function (s) {
        return String(s.id) === String(subjectId);
    }) || null;
}

function getStudySubjectSuggestions(routine) {
    return getRoutineStudySubjects(routine).map(function (s) { return s.name; });
}

function applyStudySubjectSelection(subject) {
    if (!subject) {
        studyUiState.subject = '';
        studyUiState.subjectId = '';
        studyUiState.subjectColor = '';
        studyUiState.subjectIcon = 'book-open';
        studyUiState.description = '';
        return;
    }
    studyUiState.subject = subject.name || '';
    studyUiState.subjectId = subject.id || '';
    studyUiState.subjectColor = subject.color || '#22c55e';
    studyUiState.subjectIcon = subject.icon || 'book-open';
    studyUiState.description = subject.notes || '';
}

function clearStudySubjectSelection() {
    applyStudySubjectSelection(null);
}

function getActiveStudySubject() {
    return (studyUiState.subject || '').trim();
}

function getActiveStudyDescription() {
    return (studyUiState.description || '').trim();
}

function syncStudySubjectChipUi() {
    var emptyEl = document.getElementById('studyTimerSubjectEmpty');
    var chipEl = document.getElementById('studyTimerSubjectChip');
    var chipName = document.getElementById('studyTimerSubjectChipName');
    var chipIcon = document.getElementById('studyTimerSubjectChipIcon');
    var subject = getActiveStudySubject();
    var running = isStudyTimerRunning();
    if (emptyEl) emptyEl.classList.toggle('hidden', !!subject);
    if (chipEl) {
        chipEl.classList.toggle('hidden', !subject);
        chipEl.disabled = running;
        chipEl.title = running ? subject : 'Alterar matéria';
    }
    if (chipName) chipName.textContent = subject || '';
    if (chipIcon) {
        chipIcon.style.background = studyUiState.subjectColor || 'rgba(255,255,255,0.08)';
        chipIcon.style.color = '#fafafa';
        chipIcon.innerHTML = '<i data-lucide="' + escapeHtml(studyUiState.subjectIcon || 'book-open') + '" aria-hidden="true"></i>';
    }
}

function populateStudySubjectDatalist() {
    /* legado removido — matérias vêm de routine.studySubjects */
}

function markStudyRoutineCompleteForDate(routine, dateStr) {
    if (!routine || !dateStr) return false;
    if (!routine.checkIns) routine.checkIns = [];
    var changed = false;
    if (routine.checkIns.indexOf(dateStr) === -1) {
        routine.checkIns.push(dateStr);
        routine.checkIns.sort();
        changed = true;
    }
    (routine.tasks || []).forEach(function (task) {
        if (!task.completedDates) task.completedDates = [];
        if (task.completedDates.indexOf(dateStr) === -1) {
            task.completedDates.push(dateStr);
            task.completedDates.sort();
            changed = true;
        }
        if (!task.completed) {
            task.completed = true;
            changed = true;
        }
    });
    return changed;
}

function resolveStudySessionTasksToComplete(routine, pending) {
    var tasks = (routine && routine.tasks) || [];
    if (!tasks.length) return [];
    if (pending && pending.taskId) {
        var byId = tasks.filter(function (t) { return String(t.id) === String(pending.taskId); });
        if (byId.length) return byId;
    }
    var subject = (pending && pending.subject || '').trim().toLowerCase();
    if (subject) {
        var byName = tasks.filter(function (t) {
            return (t.text || '').trim().toLowerCase() === subject;
        });
        if (byName.length) return byName;
    }
    return tasks;
}

function snapshotRoutineCompletionState(routine, dateStr) {
    return {
        checkIns: (routine.checkIns || []).slice(),
        tasks: (routine.tasks || []).map(function (task) {
            return {
                id: task.id,
                completed: !!task.completed,
                completedDates: (task.completedDates || []).slice()
            };
        })
    };
}

function restoreRoutineCompletionState(routine, snapshot) {
    if (!routine || !snapshot) return;
    routine.checkIns = snapshot.checkIns.slice();
    (snapshot.tasks || []).forEach(function (saved) {
        var task = (routine.tasks || []).find(function (t) { return String(t.id) === String(saved.id); });
        if (!task) return;
        task.completed = saved.completed;
        task.completedDates = saved.completedDates.slice();
    });
}

/** Marca tarefa(s) e check-in após salvar sessão de estudo (matéria → tarefa com mesmo nome). */
function markStudyRoutineCompleteAfterSession(routine, dateStr, pending) {
    if (!routine || !dateStr) return [];
    var markedTasks = resolveStudySessionTasksToComplete(routine, pending);
    markedTasks.forEach(function (task) {
        if (!task.completedDates) task.completedDates = [];
        if (task.completedDates.indexOf(dateStr) === -1) {
            task.completedDates.push(dateStr);
            task.completedDates.sort();
        }
        task.completed = true;
    });

    var allTasks = routine.tasks || [];
    if (!allTasks.length || allTasks.every(function (t) {
        return (t.completedDates || []).indexOf(dateStr) !== -1;
    })) {
        if (!routine.checkIns) routine.checkIns = [];
        if (routine.checkIns.indexOf(dateStr) === -1) {
            routine.checkIns.push(dateStr);
            routine.checkIns.sort();
        }
    }
    return markedTasks;
}

function reconcileStudyGoalForToday(routine, options) {
    options = options || {};
    if (!routine || !isEstudosRoutine(routine)) return false;
    var core = getStudyCore();
    if (!core) return false;
    var todayStr = getLocalDateStr(new Date());
    if (!core.isStudyGoalMet(routine, todayStr, isRoutineDate)) return false;
    return markStudyRoutineCompleteForDate(routine, todayStr);
}

function formatClockFromMs(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = function (n) { return String(n).padStart(2, '0'); };
    if (h > 0) {
        return h + ':' + pad(m) + ':' + pad(s);
    }
    return pad(m) + ':' + pad(s);
}

function formatStudyTotalLabel(totalSeconds) {
    const sec = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const r = sec % 60;
    if (h > 0) {
        return h + ' h ' + m + ' min';
    }
    if (m > 0) {
        return m + ' min ' + r + ' s';
    }
    return r + ' s';
}

function formatLastSessionEnded(iso) {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return '—';
    }
}

var studyFlipClockReady = false;
var studyFlipReducedMotion = false;

try {
    studyFlipReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
} catch (e) { /* ignore */ }

function formatFlipDigits(ms) {
    var totalSec = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    if (h >= 1) {
        var hs = String(h).padStart(2, '0');
        var ms2 = String(m).padStart(2, '0');
        return [hs[0], hs[1], ms2[0], ms2[1]];
    }
    var str = String(m).padStart(2, '0') + String(s).padStart(2, '0');
    return str.split('');
}

function buildStudyFlipClockHtml(extraClass) {
    var cls = 'study-flip-clock' + (extraClass ? ' ' + extraClass : '');
    var digitHtml = function (index) {
        return '<div class="study-flip-digit" data-digit="' + index + '" data-value="0">' +
            '<div class="study-flip-digit__top"><span class="study-flip-digit__num">0</span></div>' +
            '<div class="study-flip-digit__bottom"><span class="study-flip-digit__num">0</span></div>' +
            '<div class="study-flip-digit__flip" aria-hidden="true">' +
            '<div class="study-flip-digit__flip-front"><span class="study-flip-digit__num">0</span></div>' +
            '<div class="study-flip-digit__flip-back"><span class="study-flip-digit__num">0</span></div>' +
            '</div></div>';
    };
    return '<div class="' + cls + '">' +
        '<div class="study-flip-clock__group">' + digitHtml(0) + digitHtml(1) + '</div>' +
        '<div class="study-flip-clock__group">' + digitHtml(2) + digitHtml(3) + '</div>' +
        '</div>';
}

function completeStudyFlipDigit(digitEl, value) {
    if (!digitEl) return;
    var topNum = digitEl.querySelector('.study-flip-digit__top .study-flip-digit__num');
    var bottomNum = digitEl.querySelector('.study-flip-digit__bottom .study-flip-digit__num');
    var frontNum = digitEl.querySelector('.study-flip-digit__flip-front .study-flip-digit__num');
    var backNum = digitEl.querySelector('.study-flip-digit__flip-back .study-flip-digit__num');
    var flipEl = digitEl.querySelector('.study-flip-digit__flip');
    if (topNum) topNum.textContent = value;
    if (bottomNum) bottomNum.textContent = value;
    if (frontNum) frontNum.textContent = value;
    if (backNum) backNum.textContent = value;
    digitEl.dataset.value = value;
    delete digitEl.dataset.flipTarget;
    digitEl.classList.remove('is-flipping');
    if (flipEl) {
        if (digitEl._flipAnimEnd) {
            flipEl.removeEventListener('animationend', digitEl._flipAnimEnd);
            digitEl._flipAnimEnd = null;
        }
        flipEl.style.transform = '';
        flipEl.style.animation = 'none';
        void flipEl.offsetWidth;
        flipEl.style.animation = '';
    }
}

function setStudyFlipDigitStatic(digitEl, value) {
    if (!digitEl) return;
    completeStudyFlipDigit(digitEl, value);
}

function runStudyFlipDigitAnimation(digitEl, prevValue, nextValue) {
    if (!digitEl || prevValue === nextValue) return;

    if (digitEl.classList.contains('is-flipping')) {
        var pending = digitEl.dataset.flipTarget || prevValue;
        completeStudyFlipDigit(digitEl, pending);
        prevValue = digitEl.dataset.value || prevValue;
        if (prevValue === nextValue) return;
    }

    var topNum = digitEl.querySelector('.study-flip-digit__top .study-flip-digit__num');
    var bottomNum = digitEl.querySelector('.study-flip-digit__bottom .study-flip-digit__num');
    var frontNum = digitEl.querySelector('.study-flip-digit__flip-front .study-flip-digit__num');
    var backNum = digitEl.querySelector('.study-flip-digit__flip-back .study-flip-digit__num');
    var flipEl = digitEl.querySelector('.study-flip-digit__flip');
    if (!topNum || !bottomNum || !frontNum || !backNum || !flipEl) return;

    digitEl.dataset.flipTarget = nextValue;
    topNum.textContent = nextValue;
    bottomNum.textContent = prevValue;
    frontNum.textContent = prevValue;
    backNum.textContent = nextValue;

    flipEl.style.transform = '';
    flipEl.style.animation = 'none';
    void flipEl.offsetWidth;
    flipEl.style.animation = '';

    var onEnd = function (e) {
        if (e && e.target !== flipEl) return;
        completeStudyFlipDigit(digitEl, nextValue);
    };
    if (digitEl._flipAnimEnd) {
        flipEl.removeEventListener('animationend', digitEl._flipAnimEnd);
    }
    digitEl._flipAnimEnd = onEnd;
    flipEl.addEventListener('animationend', onEnd);
    digitEl.classList.add('is-flipping');
}

function updateStudyFlipDigitElements(digitIndex, nextValue, options) {
    options = options || {};
    var animate = !!options.animate && !studyFlipReducedMotion;
    document.querySelectorAll('.study-flip-digit[data-digit="' + digitIndex + '"]').forEach(function (digitEl) {
        var prevValue = digitEl.dataset.value || '0';
        if (prevValue === nextValue) return;
        if (animate && studyFlipClockReady) {
            runStudyFlipDigitAnimation(digitEl, prevValue, nextValue);
        } else {
            setStudyFlipDigitStatic(digitEl, nextValue);
        }
    });
}

function resetStudyFlipClockState() {
    studyFlipClockReady = false;
}

function ensureStudyFullscreenFlipClock() {
    var fsClock = document.getElementById('studyFullscreenClock');
    if (!fsClock || fsClock.querySelector('.study-flip-clock')) return;
    fsClock.innerHTML = buildStudyFlipClockHtml('study-flip-clock--fullscreen');
    var cardDigits = document.querySelectorAll('#studyFlipClock .study-flip-digit');
    cardDigits.forEach(function (cardDigit) {
        var index = cardDigit.getAttribute('data-digit');
        var value = cardDigit.dataset.value || '0';
        document.querySelectorAll('#studyFullscreenClock .study-flip-digit[data-digit="' + index + '"]').forEach(function (fsDigit) {
            setStudyFlipDigitStatic(fsDigit, value);
        });
    });
}

function updateStudyFlipClock(ms, options) {
    options = options || {};
    var digits = formatFlipDigits(ms);
    var animate = options.animate !== false;
    for (var i = 0; i < 4; i++) {
        updateStudyFlipDigitElements(i, digits[i], { animate: animate });
    }
    studyFlipClockReady = true;
}

function refreshStudyTimerUi() {
    if (!currentRoutine || !isEstudosRoutine(currentRoutine)) return;
    var ms = currentDraftMs();
    var running = isStudyTimerRunning();

    updateStudyFlipClock(ms, { animate: running });

    var statusEl = document.getElementById('studyTimerStatus');
    if (statusEl) statusEl.hidden = !running;

    var toggleLabel = document.getElementById('studyTimerToggleLabel');
    var toggleIcon = document.getElementById('studyTimerToggleIcon');
    var fsToggleLabel = document.getElementById('studyFullscreenToggleLabel');
    var fsToggleIcon = document.getElementById('studyFullscreenToggleIcon');
    var label = running ? 'Pausar' : (ms > 0 ? 'Continuar' : 'Iniciar');
    if (toggleLabel) toggleLabel.textContent = label;
    if (fsToggleLabel) fsToggleLabel.textContent = label;
    if (toggleIcon) toggleIcon.setAttribute('data-lucide', running ? 'pause' : 'play');
    if (fsToggleIcon) fsToggleIcon.setAttribute('data-lucide', running ? 'pause' : 'play');

    var elapsedEl = document.getElementById('studyTimerElapsedLabel');
    if (elapsedEl) elapsedEl.textContent = formatStudyElapsedMinutes(ms);

    var subject = getActiveStudySubject();
    var desc = getActiveStudyDescription();
    var fsSubject = document.getElementById('studyFullscreenSubject');
    var fsDesc = document.getElementById('studyFullscreenDesc');
    if (fsSubject) {
        fsSubject.textContent = subject || '';
        fsSubject.hidden = !subject;
    }
    if (fsDesc) {
        fsDesc.textContent = desc || '';
        fsDesc.hidden = !desc;
    }

    syncStudySubjectChipUi();

    var lucideLib = typeof lucide !== 'undefined' ? lucide : (typeof Lucide !== 'undefined' ? Lucide : null);
    if (lucideLib && lucideLib.createIcons) {
        lucideLib.createIcons({ root: document.getElementById('routineStudySection') });
        if (studyUiState.fullscreenMode) {
            lucideLib.createIcons({ root: document.getElementById('routineStudyFullscreen') });
        }
    }

    var newSessionBtn = document.getElementById('studyTimerNewSessionBtn');
    if (newSessionBtn) {
        newSessionBtn.disabled = running;
        newSessionBtn.title = running
            ? 'Pause ou finalize antes de iniciar nova sessão'
            : 'Limpar cronômetro e preparar outra sessão';
    }
}

function syncStudyTaskTimerDisplays() {
    if (!currentRoutine || !isEstudosRoutine(currentRoutine)) return;
    resetStudyFlipClockState();
    restoreStudyDraftFromStorage();
    if (studyUiState.pendingFinish && studyUiState.pendingFinish.durationSeconds >= 1) {
        openStudyFinishModalFromRestoredPending();
    }
    if (studyActiveRuntime.startedAt) startStudyTick();
    refreshStudyTimerUi();
}

function openStudyFinishModalFromRestoredPending() {
    var pending = studyUiState.pendingFinish;
    if (!pending) return;
    studyUiState.finishModalOpen = true;
    var modal = document.getElementById('routineStudyFinishModal');
    if (!modal) return;
    populateStudyFinishModalSummary(modal, pending);
    modal.classList.add('is-open');
    modal.hidden = false;
    modal.removeAttribute('hidden');
    modal.setAttribute('aria-hidden', 'false');
}

function formatStudyElapsedMinutes(ms) {
    var min = Math.max(0, Math.round(ms / 60000));
    if (min < 1) return 'menos de 1 min';
    return min + ' min';
}

function formatSessionDateTime(iso) {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch (e) {
        return '—';
    }
}

function formatSessionTime(iso) {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return '—';
    }
}

function syncTaskCheckboxInDom(taskId, completed) {
    const rows = document.querySelectorAll('.task-item[data-task-id]');
    let row = null;
    rows.forEach(function (r) {
        if (String(r.getAttribute('data-task-id')) === String(taskId)) {
            row = r;
        }
    });
    if (!row) return;
    row.classList.toggle('completed', completed);
    const cb = row.querySelector('.task-checkbox');
    if (cb) {
        cb.classList.toggle('checked', completed);
        cb.setAttribute('aria-checked', completed ? 'true' : 'false');
    }
}

function syncProgressBarInDom() {
    renderRoutineStats();
}

var ROUTINE_MOTIVATION_QUOTES = [
    {
        text: 'Disciplina é escolher entre o que você quer agora e o que você mais quer.',
        author: 'Abraham Lincoln'
    },
    {
        text: 'O segredo do progresso é começar.',
        author: 'Mark Twain'
    },
    {
        text: 'Pequenos passos diários levam a grandes resultados.',
        author: 'EC Routine'
    },
    {
        text: 'A consistência vence o talento quando o talento não é consistente.',
        author: 'EC Routine'
    },
    {
        text: 'Não espere por motivação. Crie o hábito e a motivação virá.',
        author: 'EC Routine'
    },
    {
        text: 'Cada dia concluído é um voto a favor de quem você quer ser.',
        author: 'James Clear'
    },
    {
        text: 'A rotina de hoje é o resultado de amanhã — faça valer cada conclusão.',
        author: 'Bobebobalro'
    }
];

function pickRoutineMotivationQuote(routineId) {
    var today = getLocalDateStr(new Date());
    var key = 'routineMotivationQuote_' + routineId + '_' + today;
    try {
        var stored = localStorage.getItem(key);
        if (stored !== null) {
            var idx = parseInt(stored, 10);
            if (!isNaN(idx) && ROUTINE_MOTIVATION_QUOTES[idx]) {
                return ROUTINE_MOTIVATION_QUOTES[idx];
            }
        }
    } catch (e) { /* ignore */ }
    var hash = 0;
    var seed = String(routineId || '') + today;
    for (var i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0;
    }
    var pick = Math.abs(hash) % ROUTINE_MOTIVATION_QUOTES.length;
    try {
        localStorage.setItem(key, String(pick));
    } catch (e) { /* ignore */ }
    return ROUTINE_MOTIVATION_QUOTES[pick];
}

function getRoutineMotivationNotifKey(routineId) {
    return 'routineMotivationNotifShown_' + routineId + '_' + getLocalDateStr(new Date());
}

function hideRoutineMotivationNotification() {
    var el = document.getElementById('routineMotivationNotification');
    if (!el) return;
    clearTimeout(el._autoHideTimeout);
    el.classList.add('closing');
    setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
    }, 280);
}

function showRoutineMotivationNotification(options) {
    hideRoutineMotivationNotification();
}

function clearRoutineMotivationNotifShown(routineId) {
    try {
        localStorage.removeItem(getRoutineMotivationNotifKey(routineId));
    } catch (e) { /* ignore */ }
}

function renderRoutineMotivationQuote() {
    showRoutineMotivationNotification({ force: false });
}

function getCompletedStudySessionsFlat(routine) {
    return collectAllStudySessions(routine).filter(function (s) {
        return s.status === 'completed';
    });
}

function getStudyStats(routine) {
    normalizeEstudosRoutine(routine);
    var core = getStudyCore();
    if (core) return core.buildStudyStats(routine, isRoutineDate);
    return {
        todaySec: 0, weekSec: 0, monthSec: 0, totalSec: 0, count: 0,
        avgSec: 0, maxSession: 0, topSubject: '—', peakHour: 0,
        daysStudied: 0, bestStudyStreak: 0, currentStudyStreak: 0,
        daysGoalMet: 0, goalCompletionPct: null, todaySessionCount: 0,
        todayMinutes: 0, studyGoal: null, todayGoalMet: false
    };
}

function hasCompletedStudySessionOnDate(routine, dateStr) {
    if (!routine || !dateStr || !isEstudosRoutine(routine)) return false;
    var core = getStudyCore();
    if (core) return core.getSessionsOnDate(routine, dateStr).length > 0;
    return collectAllStudySessions(routine).some(function (s) {
        return s.status === 'completed' && (normalizeDateStr(s.endedAt) === dateStr || s.date === dateStr);
    });
}

function formatSessionDateOnly(iso) {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleDateString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    } catch (e) {
        return '—';
    }
}

function isEstudosDayDone(routine, dateStr) {
    return isRoutineDayClosedOut(routine, dateStr);
}

function isStudyHeatmapDayRecorded(dateStr, routine) {
    if (!routine || !dateStr) return false;
    if (isRoutineDayClosedOut(routine, dateStr)) return true;
    var core = getStudyCore();
    if (core) {
        var progress = core.getStudyDayProgress(routine, dateStr);
        if (progress && progress.totalSeconds > 0) return true;
    }
    return (routine.tasks || []).some(function (task) {
        return (task.completedDates || []).indexOf(dateStr) !== -1;
    });
}

function getRoutineHeatmapData(routine, daysCount) {
    daysCount = daysCount || 30;
    var data = [];
    var now = new Date();
    var todayStr = getLocalDateStr(now);
    for (var i = daysCount - 1; i >= 0; i--) {
        var d = new Date(now);
        d.setDate(d.getDate() - i);
        var dateStr = getLocalDateStr(d);
        var scheduled = isRoutineDate(dateStr, routine);
        var done = scheduled && isRoutineDayClosedOut(routine, dateStr);
        data.push({
            dateStr: dateStr,
            scheduled: scheduled,
            done: done,
            isToday: dateStr === todayStr
        });
    }
    return data;
}

function getRoutineStudySeconds(routine) {
    if (!routine || !isEstudosRoutine(routine)) return 0;
    normalizeEstudosRoutine(routine);
    return (routine.studySessions || []).reduce(function (acc, s) {
        if (s.status !== 'completed') return acc;
        return acc + Math.max(0, Math.floor(s.durationSeconds || 0));
    }, 0);
}

function getRoutineRecentPeriodStats(routine, daysCount) {
    daysCount = daysCount || 30;
    var cells = getRoutineHeatmapData(routine, daysCount);
    var scheduled = 0;
    var done = 0;
    cells.forEach(function (c) {
        if (!c.scheduled) return;
        scheduled++;
        if (c.done) done++;
    });
    var rate = scheduled > 0 ? Math.round((done / scheduled) * 100) : null;
    return { scheduled: scheduled, done: done, rate: rate };
}

function renderRoutineStatsSummary() {
    if (!currentRoutine) return;
    var isStudy = isEstudosRoutine(currentRoutine);
    var bestEl = document.getElementById('routineStatsBestStreak');
    var recentDoneEl = document.getElementById('routineStatsRecentDone');
    var currentStreakEl = document.getElementById('routineStatsCurrentStreak');
    var totalDoneEl = document.getElementById('routineStatsTotalDone');
    var bestLabel = document.getElementById('routineStatsBestStreakLabel');
    var recentLabel = document.getElementById('routineStatsRecentDoneLabel');
    var currentLabel = document.getElementById('routineStatsCurrentStreakLabel');
    var totalLabel = document.getElementById('routineStatsTotalDoneLabel');
    var titleEl = document.querySelector('.routine-stats-title');

    if (titleEl) {
        titleEl.textContent = isStudy ? 'Estatísticas de estudo' : 'Estatísticas da rotina';
    }

    if (isStudy) {
        var stats = getStudyStats(currentRoutine);
        var core = getStudyCore();
        var goalLabel = core ? core.formatStudyGoalLabel(stats.studyGoal) : 'Sem meta';
        if (bestLabel) bestLabel.textContent = 'Meta diária';
        if (recentLabel) recentLabel.textContent = 'Progresso hoje';
        if (currentLabel) currentLabel.textContent = 'Sequência atual';
        if (totalLabel) totalLabel.textContent = 'Dias com meta';
        if (bestEl) bestEl.textContent = goalLabel;
        if (recentDoneEl) {
            if (!stats.studyGoal) {
                recentDoneEl.textContent = formatStudyHoursMinutesTotal(stats.todaySec);
            } else if (stats.studyGoal.type === 'time') {
                recentDoneEl.textContent = formatStudyHoursMinutesTotal(stats.todaySec) + ' / ' + stats.studyGoal.target + ' min';
            } else {
                recentDoneEl.textContent = stats.todaySessionCount + ' / ' + stats.studyGoal.target + ' sessões';
            }
        }
        if (currentStreakEl) {
            currentStreakEl.textContent = stats.currentStudyStreak + ' dia' + (stats.currentStudyStreak === 1 ? '' : 's');
        }
        if (totalDoneEl) {
            totalDoneEl.textContent = stats.goalCompletionPct != null
                ? stats.daysGoalMet + ' (' + stats.goalCompletionPct + '%)'
                : String(stats.daysGoalMet);
        }
        return;
    }

    if (bestLabel) bestLabel.textContent = 'Melhor sequência';
    if (recentLabel) recentLabel.textContent = 'Últimos 30 dias';
    if (currentLabel) currentLabel.textContent = 'Sequência atual';
    if (totalLabel) totalLabel.textContent = 'Dias concluídos';

    var best = typeof getBestStreak === 'function'
        ? getBestStreak(currentRoutine)
        : (currentRoutine.bestStreak || 0);
    if (bestEl) {
        bestEl.textContent = best + ' dia' + (best === 1 ? '' : 's');
    }

    var period = getRoutineRecentPeriodStats(currentRoutine, 30);
    if (recentDoneEl) {
        recentDoneEl.textContent = period.scheduled > 0
            ? period.done + '/' + period.scheduled
            : '—';
    }

    var streak = typeof getRoutineStreak === 'function' ? getRoutineStreak(currentRoutine) : 0;
    if (currentStreakEl) {
        currentStreakEl.textContent = streak + ' dia' + (streak === 1 ? '' : 's');
    }

    var totalDone = getRoutineTotalCompletedScheduledDays(currentRoutine);
    if (totalDoneEl) {
        totalDoneEl.textContent = totalDone + ' dia' + (totalDone === 1 ? '' : 's');
    }
}

function renderStudyHeatmapLegend() {
    var legend = document.getElementById('routineStatsHeatmapLegend');
    if (!legend) return;
    legend.className = 'routine-stats-heatmap-legend routine-stats-heatmap-legend--intensity';
    legend.innerHTML =
        '<span class="routine-stats-heatmap-legend-item">' +
            '<span class="routine-stats-heatmap-legend-dot routine-stats-heatmap-legend-dot--study-l0" aria-hidden="true"></span>' +
            '<span class="routine-stats-heatmap-legend-label">0 min</span>' +
        '</span>' +
        '<span class="routine-stats-heatmap-legend-item">' +
            '<span class="routine-stats-heatmap-legend-dot routine-stats-heatmap-legend-dot--study-l1" aria-hidden="true"></span>' +
            '<span class="routine-stats-heatmap-legend-label">30 min</span>' +
        '</span>' +
        '<span class="routine-stats-heatmap-legend-item">' +
            '<span class="routine-stats-heatmap-legend-dot routine-stats-heatmap-legend-dot--study-l2" aria-hidden="true"></span>' +
            '<span class="routine-stats-heatmap-legend-label">1 h</span>' +
        '</span>' +
        '<span class="routine-stats-heatmap-legend-item">' +
            '<span class="routine-stats-heatmap-legend-dot routine-stats-heatmap-legend-dot--study-l3" aria-hidden="true"></span>' +
            '<span class="routine-stats-heatmap-legend-label">2 h</span>' +
        '</span>' +
        '<span class="routine-stats-heatmap-legend-item">' +
            '<span class="routine-stats-heatmap-legend-dot routine-stats-heatmap-legend-dot--study-l4" aria-hidden="true"></span>' +
            '<span class="routine-stats-heatmap-legend-label">3 h</span>' +
        '</span>';
}

function renderRoutineHeatmapLegendDefault() {
    var legend = document.getElementById('routineStatsHeatmapLegend');
    if (!legend) return;
    legend.className = 'routine-stats-heatmap-legend routine-stats-heatmap-legend--status';
    legend.innerHTML =
        '<span class="routine-stats-heatmap-legend-item">' +
            '<span class="routine-stats-heatmap-legend-dot routine-stats-heatmap-legend-dot--done" aria-hidden="true"></span>' +
            '<span class="routine-stats-heatmap-legend-label">Concluído</span>' +
        '</span>' +
        '<span class="routine-stats-heatmap-legend-item">' +
            '<span class="routine-stats-heatmap-legend-dot routine-stats-heatmap-legend-dot--pending" aria-hidden="true"></span>' +
            '<span class="routine-stats-heatmap-legend-label">Pendente</span>' +
        '</span>' +
        '<span class="routine-stats-heatmap-legend-item">' +
            '<span class="routine-stats-heatmap-legend-dot routine-stats-heatmap-legend-dot--today" aria-hidden="true"></span>' +
            '<span class="routine-stats-heatmap-legend-label">Hoje</span>' +
        '</span>';
}

var _studyHeatmapPrevSnapshot = null;
var _studyHeatmapSnapshotRoutineId = null;
var STUDY_HEATMAP_PULSE_MS = 780;

function snapshotStudyHeatmapCells(cells) {
    var map = {};
    (cells || []).forEach(function (c) {
        if (!c || !c.dateStr) return;
        map[c.dateStr] = {
            minutes: c.minutes || 0,
            tier: typeof c.tier === 'number' ? c.tier : 0,
            recorded: !!c.recorded
        };
    });
    return map;
}

function shouldPulseStudyHeatmapCell(c, prevMap) {
    if (!prevMap || !c || !c.scheduled) return false;
    var prev = prevMap[c.dateStr];
    var minutes = c.minutes || 0;
    var tier = typeof c.tier === 'number' ? c.tier : 0;
    if (!prev) return minutes > 0 || tier > 0 || !!c.recorded;
    if (minutes > (prev.minutes || 0)) return true;
    if (tier > (prev.tier || 0)) return true;
    if (c.recorded && !prev.recorded) return true;
    return false;
}

function buildStudyHeatmapCellHtml(c, animate) {
    var cls = 'routine-stats-heatmap-cell';
    if (!c.scheduled) cls += ' off';
    else if (c.tier === 0) cls += ' routine-stats-heatmap-cell--study-l0';
    else if (c.tier > 0) cls += ' routine-stats-heatmap-cell--study-l' + c.tier;
    if (c.isToday) cls += ' today';
    if (c.goalMet) cls += ' goal-met';
    if (animate) cls += ' is-study-intensity-pulse';
    var title = c.dateStr + ' — ' + (c.minutes || 0) + ' min';
    if (c.goalMet) title += ' · meta ok';
    else if (c.recorded && c.minutes <= 0) title += ' · registrado';
    return '<span class="' + cls + '" data-date="' + escapeAttr(c.dateStr) + '"' +
        buildHeatmapCellTooltipAttrs(formatHeatmapHoverDay(c.dateStr), title) + '></span>';
}

function getStudyHeatmapCellsForRender(routine, daysCount) {
    daysCount = daysCount || 30;
    var core = getStudyCore();
    if (core && typeof core.getStudyHeatmapData === 'function') {
        return core.getStudyHeatmapData(routine, daysCount, isRoutineDate, isStudyHeatmapDayRecorded);
    }
    var now = new Date();
    var todayStr = getLocalDateStr(now);
    var cells = [];
    for (var i = daysCount - 1; i >= 0; i--) {
        var d = new Date(now);
        d.setDate(d.getDate() - i);
        var dateStr = getLocalDateStr(d);
        cells.push({
            dateStr: dateStr,
            scheduled: isRoutineDate(dateStr, routine),
            minutes: 0,
            tier: isRoutineDate(dateStr, routine) ? 0 : -1,
            recorded: false,
            goalMet: false,
            isToday: dateStr === todayStr
        });
    }
    return cells;
}

function renderRoutineStatsHeatmap() {
    if (!currentRoutine) return;
    var heatmapEl = document.getElementById('routineStatsHeatmap');
    if (!heatmapEl) return;

    var isStudy = isEstudosRoutine(currentRoutine);
    var heatmapTitle = document.querySelector('.routine-stats-heatmap-title');
    if (heatmapTitle) {
        heatmapTitle.textContent = isStudy
            ? 'Intensidade de estudo (30 dias)'
            : 'Histórico dos últimos 30 dias';
    }
    if (isStudy) {
        renderStudyHeatmapLegend();
        heatmapEl.className = 'routine-stats-heatmap routine-stats-heatmap--10x3';
        var cells = getStudyHeatmapCellsForRender(currentRoutine, 30);
        if (!Array.isArray(cells) || cells.length === 0) {
            cells = [];
            var nowStudy = new Date();
            var todayStudy = getLocalDateStr(nowStudy);
            for (var si = 29; si >= 0; si--) {
                var sd = new Date(nowStudy);
                sd.setDate(sd.getDate() - si);
                var sDate = getLocalDateStr(sd);
                cells.push({
                    dateStr: sDate,
                    scheduled: isRoutineDate(sDate, currentRoutine),
                    minutes: 0,
                    tier: isRoutineDate(sDate, currentRoutine) ? 0 : -1,
                    recorded: false,
                    goalMet: false,
                    isToday: sDate === todayStudy
                });
            }
        }
        var prevSnap = _studyHeatmapPrevSnapshot;
        if (_studyHeatmapSnapshotRoutineId !== currentRoutine.id) {
            prevSnap = null;
            _studyHeatmapSnapshotRoutineId = currentRoutine.id;
        }
        var pulsed = false;
        heatmapEl.innerHTML = cells.map(function (c) {
            var animate = shouldPulseStudyHeatmapCell(c, prevSnap);
            if (animate) pulsed = true;
            return buildStudyHeatmapCellHtml(c, animate);
        }).join('');
        _studyHeatmapPrevSnapshot = snapshotStudyHeatmapCells(cells);
        if (pulsed) {
            clearTimeout(heatmapEl._studyPulseTimeout);
            heatmapEl._studyPulseTimeout = window.setTimeout(function () {
                var pulsing = heatmapEl.querySelectorAll('.is-study-intensity-pulse');
                for (var pi = 0; pi < pulsing.length; pi++) {
                    pulsing[pi].classList.remove('is-study-intensity-pulse');
                }
            }, STUDY_HEATMAP_PULSE_MS);
        }
        var activeDays = cells.filter(function (c) { return c.scheduled && (c.minutes > 0 || c.recorded); }).length;
        heatmapEl.setAttribute('aria-label', 'Intensidade de estudo nos últimos 30 dias: ' + activeDays + ' dias com registro');
    } else {
        renderRoutineHeatmapLegendDefault();
        heatmapEl.classList.remove('routine-stats-heatmap--10x3');
        heatmapEl.classList.add('routine-stats-heatmap--15x2');
        var cellsDefault = getRoutineHeatmapData(currentRoutine, 30);
        heatmapEl.innerHTML = cellsDefault.map(function (c) {
            var cls = 'routine-stats-heatmap-cell';
            if (!c.scheduled) {
                cls += ' off';
            } else if (c.done) {
                cls += ' done';
            } else {
                cls += ' pending';
            }
            if (c.isToday) cls += ' today';
            var title = c.dateStr;
            if (!c.scheduled) title += ' — livre';
            else if (c.done) title += ' — concluído';
            else title += ' — pendente';
            return '<span class="' + cls + '"' + buildHeatmapCellTooltipAttrs(formatHeatmapHoverDay(c.dateStr), title) + '></span>';
        }).join('');
        var doneCount = cellsDefault.filter(function (c) { return c.scheduled && c.done; }).length;
        heatmapEl.setAttribute('aria-label', 'Histórico dos últimos 30 dias: ' + doneCount + ' dias concluídos');
    }

    var lucideLib = typeof lucide !== 'undefined' ? lucide : (typeof Lucide !== 'undefined' ? Lucide : null);
    if (lucideLib && lucideLib.createIcons) lucideLib.createIcons();
}

function renderRoutineStats() {
    if (!currentRoutine) return;
    var descEl = document.querySelector('.routine-stats-desc');
    if (descEl) descEl.remove();
    try {
        renderRoutineMotivationQuote();
        renderRoutineStatsSummary();
        syncRoutineStatsTodayState();
        renderRoutineStatsHeatmap();
    } catch (err) {
        console.error('renderRoutineStats:', err);
    }
}

function getRoutineTodayStats(routine) {
    var todayStr = getLocalDateStr(new Date());
    var scheduled = isRoutineDate(todayStr, routine);
    var done;
    if (isEstudosRoutine(routine)) {
        var stats = getStudyStats(routine);
        done = scheduled && stats.todayGoalMet;
        if (!done) done = isRoutineDayClosedOut(routine, todayStr);
    } else {
        done = isRoutineDayClosedOut(routine, todayStr);
    }
    return {
        dateStr: todayStr,
        scheduled: scheduled,
        done: done
    };
}

function syncRoutineStatsTodayState() {
    if (!currentRoutine) return;
    var today = getRoutineTodayStats(currentRoutine);
    var todayBadge = document.getElementById('routineStatsTodayBadge');
    var sectionEl = document.getElementById('routineStatsSection');

    if (todayBadge) {
        if (!today.scheduled) {
            todayBadge.textContent = 'Livre';
            todayBadge.className = 'routine-stats-today routine-stats-today--off';
        } else if (today.done) {
            todayBadge.textContent = 'Concluído';
            todayBadge.className = 'routine-stats-today routine-stats-today--done';
        } else if (routineDayOwesCheckInResponse(currentRoutine, today.dateStr)) {
            todayBadge.textContent = 'Aguardando';
            todayBadge.className = 'routine-stats-today routine-stats-today--awaiting';
        } else {
            todayBadge.textContent = 'Pendente';
            todayBadge.className = 'routine-stats-today routine-stats-today--pending';
        }
    }
    if (sectionEl) {
        sectionEl.classList.toggle('routine-stats-section--complete', today.scheduled && today.done);
    }
    if (!today.scheduled || !today.done) {
        hideRoutineMotivationNotification();
    }
    syncRoutineTodayVisualState(today);
    syncRoutineTaskCompleteSuccess(today);
}

/** Marca tarefa como concluída hoje ao iniciar estudo (sem renderRoutine completo). */
async function markTaskCompleteOnStudyStart(taskId) {
    const task = currentRoutine.tasks.find(function (t) { return String(t.id) === String(taskId); });
    if (!task || task.completed) return;
    const today = getLocalDateStr(new Date());
    if (!task.completedDates) task.completedDates = [];
    task.completed = true;
    if (!task.completedDates.includes(today)) {
        task.completedDates.push(today);
        task.completedDates.sort();
    }
    await saveRoutine();
    await checkAndMarkCheckIn();
    syncTaskCheckboxInDom(taskId, true);
    syncProgressBarInDom();
}

function resolveStudySubjectMeta(routine, subjectName) {
    var name = (subjectName || '').trim() || 'Estudo';
    var subjects = getRoutineStudySubjects(routine);
    var found = subjects.find(function (s) {
        return s.name.toLowerCase() === name.toLowerCase();
    });
    if (found) return found;
    var palette = getStudySubjectPalette();
    var hash = 0;
    for (var i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return {
        name: name,
        color: palette[Math.abs(hash) % palette.length],
        icon: 'book-open'
    };
}

function buildStudySessionSubjectCellHtml(routine, subjectName) {
    var meta = resolveStudySubjectMeta(routine, subjectName);
    return '<span class="study-session-subject">' +
        '<span class="study-session-subject__icon" style="background:' + escapeHtml(meta.color) + ';">' +
        '<i data-lucide="' + escapeHtml(meta.icon || 'book-open') + '" aria-hidden="true"></i></span>' +
        '<span class="study-session-subject__name">' + escapeHtml(meta.name) + '</span></span>';
}

function formatSessionDurationLabel(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    if (s >= 3600) {
        return (s / 3600).toFixed(1).replace('.', ',') + ' h';
    }
    if (s >= 60) {
        return Math.round(s / 60) + ' min';
    }
    return s + ' s';
}

/** Rótulo legível em horas e minutos (ex.: "1 h 20 min", "45 min"). */
function formatStudyHoursMinutesTotal(seconds) {
    var s = Math.max(0, Math.floor(seconds || 0));
    if (s === 0) return '0 min';
    if (s < 60) return s + ' s';
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var parts = [];
    if (h > 0) parts.push(h + ' h');
    if (m > 0) parts.push(m + ' min');
    if (parts.length === 0) parts.push('0 min');
    return parts.join(' ');
}

function syncRoutineDetailPageLayoutClass() {
    var study = document.getElementById('routineStudySection');
    var hasStudy = !!(study && !study.hidden && !study.hasAttribute('hidden'));
    document.body.classList.toggle('routine-detail-has-study', hasStudy);
}

function setRoutineStudyUiVisible(visible) {
    var section = document.getElementById('routineStudySection');
    var sessions = document.getElementById('routineStudySessionsSection');
    if (section) {
        section.hidden = !visible;
        if (visible) {
            section.removeAttribute('hidden');
            section.setAttribute('aria-hidden', 'false');
        } else {
            section.setAttribute('hidden', '');
            section.setAttribute('aria-hidden', 'true');
        }
    }
    if (sessions) {
        sessions.hidden = !visible;
        if (visible) {
            sessions.removeAttribute('hidden');
            sessions.setAttribute('aria-hidden', 'false');
        } else {
            sessions.setAttribute('hidden', '');
            sessions.setAttribute('aria-hidden', 'true');
        }
    }
    document.body.classList.toggle('routine-detail-has-study', visible);
}

function syncRoutineTodayVisualState(today) {
    var unified = document.querySelector('.routine-detail-unified');
    if (!unified) return;

    var isComplete = !!(today && today.scheduled && today.done);
    var wasComplete = unified.classList.contains('routine-detail-today-complete');
    unified.classList.toggle('routine-detail-today-complete', isComplete);

    var badge = document.getElementById('routineStatsTodayBadge');
    if (badge && isComplete && !wasComplete) {
        badge.classList.add('routine-stats-today--celebrate');
        window.setTimeout(function () {
            badge.classList.remove('routine-stats-today--celebrate');
        }, 700);
    }

    var completeBlock = document.getElementById('routineCompleteBlock');
    if (completeBlock) {
        completeBlock.classList.toggle('routine-complete-block--done', isComplete);
    }

    var sectionEl = document.getElementById('routineStatsSection');
    if (sectionEl && isComplete && !wasComplete) {
        sectionEl.classList.add('routine-stats-section--celebrate');
        window.setTimeout(function () {
            sectionEl.classList.remove('routine-stats-section--celebrate');
        }, 700);
    }

    syncRoutineDetailPanelLayout();
}

function syncRoutineDetailPanelLayout() {
    var panel = document.getElementById('routineDetailPanel');
    var completeBlock = document.getElementById('routineCompleteBlock');
    var successEl = document.getElementById('routineTaskCompleteSuccess');
    if (!panel) return;
    var isStudy = !!(currentRoutine && isEstudosRoutine(currentRoutine));
    panel.classList.toggle('routine-detail-panel--study-layout', isStudy);
    var checkinVisible = false;
    if (completeBlock) {
        checkinVisible = completeBlock.style.display !== 'none' &&
            !completeBlock.classList.contains('routine-complete-block--hiding');
    }
    var successVisible = !!(successEl && !successEl.hidden && successEl.style.display !== 'none');
    panel.classList.toggle('routine-detail-panel--checkin-visible', checkinVisible || successVisible);
}

var COMPLETION_REWARD_CELEBRATE_MS = 600;

function isCompletionRewardCelebrating() {
    var el = document.getElementById('routineTaskCompleteSuccess');
    return !!(el && el.classList.contains('is-celebrating'));
}

function showRoutineTaskCompleteSuccess(animate) {
    if (currentRoutine && isEstudosRoutine(currentRoutine)) {
        hideRoutineTaskCompleteSuccess();
        return;
    }
    var el = document.getElementById('routineTaskCompleteSuccess');
    if (!el) return;
    updateRoutineCompleteSuccessStreak();
    el.hidden = false;
    el.style.display = 'flex';
    el.classList.add('is-visible', 'is-completed');
    if (animate) {
        el.classList.remove('is-celebrating');
        void el.offsetWidth;
        el.classList.add('is-celebrating');
        clearTimeout(el._celebrateTimeout);
        el._celebrateTimeout = window.setTimeout(function () {
            el.classList.remove('is-celebrating');
        }, COMPLETION_REWARD_CELEBRATE_MS);
    }
    syncRoutineDetailPanelLayout();
}

function updateRoutineCompleteSuccessStreak() {
    var streakEl = document.getElementById('routineTaskCompleteSuccessStreak');
    if (!currentRoutine) return;
    var streak = typeof getRoutineStreak === 'function' ? getRoutineStreak(currentRoutine) : 0;
    if (streakEl) {
        streakEl.textContent = streak + ' dia' + (streak === 1 ? '' : 's');
    }
}

function hideRoutineTaskCompleteSuccess() {
    var el = document.getElementById('routineTaskCompleteSuccess');
    if (!el) return;
    clearTimeout(el._celebrateTimeout);
    el.hidden = true;
    el.style.display = 'none';
    el.classList.remove('is-visible', 'is-celebrating', 'is-completed');
    syncRoutineDetailPanelLayout();
}

function syncRoutineTaskCompleteSuccess(today) {
    if (currentRoutine && isEstudosRoutine(currentRoutine)) {
        hideRoutineTaskCompleteSuccess();
        return;
    }
    if (today && today.scheduled && today.done) {
        updateRoutineCompleteSuccessStreak();
        if (!isCompletionRewardCelebrating()) {
            showRoutineTaskCompleteSuccess(false);
    } else {
            var el = document.getElementById('routineTaskCompleteSuccess');
            if (el) {
                el.hidden = false;
                el.style.display = 'flex';
                el.classList.add('is-visible', 'is-completed');
            }
            syncRoutineDetailPanelLayout();
        }
    } else if (!isCompletionRewardCelebrating()) {
        hideRoutineTaskCompleteSuccess();
    }
}

async function onRoutineDayJustCompleted(wasDoneBefore) {
    if (wasDoneBefore || !currentRoutine) return false;
    var today = getLocalDateStr(new Date());
    if (!isRoutineDayClosedOut(currentRoutine, today)) return false;

    if (typeof updateBestStreak === 'function') {
        updateBestStreak(currentRoutine);
    }
    await saveRoutine();
    setRoutineCompleteAnsweredToday(currentRoutine.id);
    renderRoutine();
    if (!isEstudosRoutine(currentRoutine)) {
        showRoutineTaskCompleteSuccess(true);
        showRoutineMotivationNotification({ force: true });
    } else {
        hideRoutineTaskCompleteSuccess();
    }
    hideCompleteQuestionBlock();
    return true;
}

function renderStudySection() {
    var section = document.getElementById('routineStudySection');
    if (!section || !currentRoutine) return;
    if (!isEstudosRoutine(currentRoutine)) {
        setRoutineStudyUiVisible(false);
        syncRoutineDetailPanelLayout();
        return;
    }
    setRoutineStudyUiVisible(true);
    hideRoutineTaskCompleteSuccess();
    normalizeEstudosRoutine(currentRoutine);

    var filterSubject = document.getElementById('studySessionFilterSubject');
    if (filterSubject) {
        var currentFilter = getEcFilterSelectValue('studySessionFilterSubject');
        var subjects = getStudySubjectSuggestions(currentRoutine);
        collectAllStudySessions(currentRoutine).forEach(function (s) {
            if (s.subject && subjects.indexOf(s.subject) === -1) subjects.push(s.subject);
        });
        subjects.sort();
        var subjectOptions = [{ value: '', label: 'Todas as matérias' }].concat(subjects.map(function (name) {
            return { value: name, label: name };
        }));
        var keepFilter = currentFilter === '' || subjects.indexOf(currentFilter) !== -1 ? currentFilter : '';
        setEcFilterSelectOptions('studySessionFilterSubject', subjectOptions, keepFilter);
    }

    setupStudyTimerEvents();
    setupStudySubjectModalEvents();
    syncStudyTaskTimerDisplays();
    renderStudySessionTable();
    syncRoutineDetailPanelLayout();
    syncRoutineDetailPageLayoutClass();

    var lucideLib = typeof lucide !== 'undefined' ? lucide : (typeof Lucide !== 'undefined' ? Lucide : null);
    if (lucideLib && lucideLib.createIcons) {
        lucideLib.createIcons({ root: section });
    }
}

function startStudyTick() {
    var r = studyActiveRuntime;
    if (r.intervalId) clearInterval(r.intervalId);
    r.intervalId = setInterval(function () {
        refreshStudyTimerUi();
    }, 1000);
    startStudyDraftPersistLoop();
}

function stopStudyTick() {
    var r = studyActiveRuntime;
    if (r.intervalId) {
        clearInterval(r.intervalId);
        r.intervalId = null;
    }
}

function persistStudyDraftsToStorage() {
    if (!currentRoutine || !isEstudosRoutine(currentRoutine)) return;
    var pending = studyUiState.pendingFinish;
    var ms = pending
        ? Math.max(0, Math.floor(pending.durationSeconds || 0) * 1000)
        : currentDraftMs();
    if (ms < 1000 && !pending) return;
    var key = studyDraftKey(currentRoutine.id);
    var payload = JSON.stringify({
        accumulatedMs: ms,
        sessionStartedAt: pending && pending.startedAt
            ? pending.startedAt
            : studyActiveRuntime.sessionStartedAt,
        subject: pending ? pending.subject : getActiveStudySubject(),
        subjectId: pending ? (pending.subjectId || '') : (studyUiState.subjectId || ''),
        subjectColor: pending ? (pending.subjectColor || '') : (studyUiState.subjectColor || ''),
        subjectIcon: pending ? (pending.subjectIcon || 'book-open') : (studyUiState.subjectIcon || 'book-open'),
        description: pending ? (pending.description || '') : getActiveStudyDescription(),
        pendingFinish: pending || null,
        savedAt: new Date().toISOString()
    });
    try {
        sessionStorage.setItem(key, payload);
    } catch (e) { /* ignore */ }
    try {
        localStorage.setItem(key, payload);
    } catch (e) { /* ignore */ }
}

function readStudyDraftRaw(routineId) {
    var key = studyDraftKey(routineId);
    var raw = null;
    try {
        raw = sessionStorage.getItem(key);
    } catch (e) { /* ignore */ }
    if (!raw) {
        try {
            raw = localStorage.getItem(key);
        } catch (e) { /* ignore */ }
    }
    return raw;
}

function restoreStudyDraftFromStorage() {
    if (!currentRoutine) return;
    var raw = readStudyDraftRaw(currentRoutine.id);
    if (!raw) return;
    try {
        var data = JSON.parse(raw);
        if (!data) return;
        if (data.pendingFinish && data.pendingFinish.durationSeconds >= 1) {
            studyUiState.pendingFinish = data.pendingFinish;
            studyActiveRuntime.accumulatedMs = Math.max(
                0,
                Math.floor(data.pendingFinish.durationSeconds || 0) * 1000
            );
            studyActiveRuntime.startedAt = null;
            if (data.pendingFinish.startedAt) {
                studyActiveRuntime.sessionStartedAt = data.pendingFinish.startedAt;
            }
            if (data.pendingFinish.subject) studyUiState.subject = data.pendingFinish.subject;
            if (data.pendingFinish.subjectId) studyUiState.subjectId = data.pendingFinish.subjectId;
            if (data.pendingFinish.subjectColor) studyUiState.subjectColor = data.pendingFinish.subjectColor;
            if (data.pendingFinish.subjectIcon) studyUiState.subjectIcon = data.pendingFinish.subjectIcon;
            if (data.pendingFinish.description) studyUiState.description = data.pendingFinish.description;
        } else if (typeof data.accumulatedMs === 'number' && data.accumulatedMs > 0) {
            studyActiveRuntime.accumulatedMs = data.accumulatedMs;
            studyActiveRuntime.startedAt = null;
            if (data.sessionStartedAt) studyActiveRuntime.sessionStartedAt = data.sessionStartedAt;
            if (data.subject) studyUiState.subject = data.subject;
            if (data.subjectId) studyUiState.subjectId = data.subjectId;
            if (data.subjectColor) studyUiState.subjectColor = data.subjectColor;
            if (data.subjectIcon) studyUiState.subjectIcon = data.subjectIcon;
            if (data.description) studyUiState.description = data.description;
        } else {
            return;
        }
        if (studyUiState.subjectId && currentRoutine) {
            var restored = findRoutineStudySubject(currentRoutine, studyUiState.subjectId);
            if (restored) applyStudySubjectSelection(restored);
        }
    } catch (e) { /* ignore */ }
}

function clearStudyDraftStorage() {
    if (!currentRoutine) return;
    var key = studyDraftKey(currentRoutine.id);
    try {
        sessionStorage.removeItem(key);
    } catch (e) { /* ignore */ }
    try {
        localStorage.removeItem(key);
    } catch (e) { /* ignore */ }
}

async function resetStudyTimer() {
    var ms = currentDraftMs();
    if (ms > 0) {
        var ok = await openStudyConfirmModal({
            title: 'Reiniciar cronômetro?',
            message: 'O tempo acumulado será perdido.',
            confirmLabel: 'Reiniciar',
            cancelLabel: 'Cancelar'
        });
        if (!ok) return;
    }
    stopStudyTick();
    studyActiveRuntime.accumulatedMs = 0;
    studyActiveRuntime.startedAt = null;
    studyActiveRuntime.sessionStartedAt = null;
    clearStudyDraftStorage();
    resetStudyFlipClockState();
    refreshStudyTimerUi();
}

async function beginNewStudySession(options) {
    options = options || {};
    var ms = currentDraftMs();
    if (ms > 0 && !options.force) {
        var message = isStudyTimerRunning()
            ? 'Há uma sessão em andamento. Descartar o tempo atual e iniciar nova sessão?'
            : 'Descartar o tempo acumulado e preparar nova sessão?';
        var ok = await openStudyConfirmModal({
            title: 'Nova sessão?',
            message: message,
            confirmLabel: 'Descartar e continuar',
            cancelLabel: 'Cancelar'
        });
        if (!ok) return false;
    }
    stopStudyTick();
    studyActiveRuntime.accumulatedMs = 0;
    studyActiveRuntime.startedAt = null;
    studyActiveRuntime.sessionStartedAt = null;
    clearStudyDraftStorage();
    if (options.clearDescription !== false) {
        studyUiState.description = '';
    }
    if (options.clearSubject) {
        clearStudySubjectSelection();
    }
    if (options.force) resetStudyFlipClockState();
    refreshStudyTimerUi();
    return true;
}

async function toggleStudyTimer() {
    if (!currentRoutine || !isEstudosRoutine(currentRoutine)) return;
    var r = studyActiveRuntime;
    if (r.startedAt) {
        r.accumulatedMs += Date.now() - r.startedAt;
        r.startedAt = null;
        stopStudyTick();
        persistStudyDraftsToStorage();
    } else {
        if (!getActiveStudySubject()) {
            openStudySubjectModal({ autoStart: true });
            return;
        }
        startStudyTimerInternal();
    }
    refreshStudyTimerUi();
}

function startStudyTimerInternal() {
    var r = studyActiveRuntime;
    if (!r.sessionStartedAt) {
        r.sessionStartedAt = r.accumulatedMs > 0
            ? new Date(Date.now() - r.accumulatedMs).toISOString()
            : new Date().toISOString();
    }
    r.startedAt = Date.now();
    startStudyTick();
}

function ensureStudySubjectModalClosed() {
    var modal = document.getElementById('routineStudySubjectModal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.hidden = true;
    modal.setAttribute('hidden', '');
    modal.setAttribute('aria-hidden', 'true');
    studyUiState.subjectModalAutoStart = false;
}

function showStudySubjectModalView(view) {
    var pickView = document.getElementById('studySubjectPickView');
    var createView = document.getElementById('studySubjectCreateView');
    if (pickView) pickView.hidden = view !== 'pick';
    if (createView) createView.hidden = view !== 'create';
}

function renderStudySubjectColorPicker() {
    var wrap = document.getElementById('studySubjectColorPicker');
    if (!wrap) return;
    var palette = getStudySubjectPalette();
    var selected = studyUiState.subjectCreateColor || palette[0];
    wrap.innerHTML = palette.map(function (color) {
        var sel = color === selected ? ' is-selected' : '';
        return '<button type="button" class="study-subject-color-picker__btn' + sel + '" data-color="' + color + '" style="--subject-color:' + color + ';" aria-label="Cor ' + color + '"></button>';
    }).join('');
}

function renderStudySubjectIconPicker() {
    var wrap = document.getElementById('studySubjectIconPicker');
    if (!wrap) return;
    var icons = getStudySubjectIcons();
    var selected = studyUiState.subjectCreateIcon || icons[0];
    wrap.innerHTML = icons.map(function (icon) {
        var sel = icon === selected ? ' is-selected' : '';
        return '<button type="button" class="study-subject-icon-picker__btn' + sel + '" data-icon="' + icon + '" aria-label="Ícone ' + icon + '"><i data-lucide="' + icon + '" aria-hidden="true"></i></button>';
    }).join('');
}

function renderStudySubjectPickerList() {
    var listEl = document.getElementById('studySubjectPickerList');
    var emptyEl = document.getElementById('studySubjectPickerEmpty');
    if (!listEl || !currentRoutine) return;
    var subjects = getRoutineStudySubjects(currentRoutine);
    if (emptyEl) emptyEl.classList.toggle('hidden', subjects.length > 0);
    listEl.innerHTML = subjects.map(function (subject) {
        var notes = subject.notes ? '<span class="study-subject-picker__item-notes">' + escapeHtml(subject.notes) + '</span>' : '';
        return '<button type="button" class="study-subject-picker__item" data-subject-id="' + escapeHtml(subject.id) + '" role="option">' +
            '<span class="study-subject-picker__item-icon" style="background:' + escapeHtml(subject.color) + ';color:#fafafa;">' +
            '<i data-lucide="' + escapeHtml(subject.icon || 'book-open') + '" aria-hidden="true"></i></span>' +
            '<span class="study-subject-picker__item-text">' +
            '<span class="study-subject-picker__item-name">' + escapeHtml(subject.name) + '</span>' +
            notes +
            '</span></button>';
    }).join('');
    refreshLucideIcons(listEl);
}

function resetStudySubjectCreateForm() {
    var palette = getStudySubjectPalette();
    var icons = getStudySubjectIcons();
    studyUiState.subjectCreateColor = palette[0];
    studyUiState.subjectCreateIcon = icons[0];
    var nameEl = document.getElementById('studySubjectCreateName');
    var notesEl = document.getElementById('studySubjectCreateNotes');
    if (nameEl) nameEl.value = '';
    if (notesEl) notesEl.value = '';
    renderStudySubjectColorPicker();
    renderStudySubjectIconPicker();
}

function openStudySubjectModal(options) {
    options = options || {};
    if (!currentRoutine || !isEstudosRoutine(currentRoutine)) return;
    normalizeEstudosRoutine(currentRoutine);
    var modal = document.getElementById('routineStudySubjectModal');
    if (!modal) return;
    studyUiState.subjectModalAutoStart = !!options.autoStart;
    renderStudySubjectPickerList();
    resetStudySubjectCreateForm();
    showStudySubjectModalView('pick');
    modal.classList.add('is-open');
    modal.hidden = false;
    modal.removeAttribute('hidden');
    modal.setAttribute('aria-hidden', 'false');
    refreshLucideIcons(modal);
    var firstItem = modal.querySelector('.study-subject-picker__item');
    if (firstItem) firstItem.focus();
}

function closeStudySubjectModal() {
    ensureStudySubjectModalClosed();
}

async function selectStudySubjectById(subjectId, options) {
    options = options || {};
    if (!currentRoutine) return false;
    var subject = findRoutineStudySubject(currentRoutine, subjectId);
    if (!subject) return false;
    applyStudySubjectSelection(subject);
    closeStudySubjectModal();
    refreshStudyTimerUi();
    if (options.startTimer || studyUiState.subjectModalAutoStart) {
        studyUiState.subjectModalAutoStart = false;
        if (!isStudyTimerRunning()) startStudyTimerInternal();
        refreshStudyTimerUi();
    }
    return true;
}

async function createStudySubjectFromForm(event) {
    if (event) event.preventDefault();
    if (!currentRoutine) return;
    var nameEl = document.getElementById('studySubjectCreateName');
    var notesEl = document.getElementById('studySubjectCreateNotes');
    var name = nameEl ? nameEl.value.trim() : '';
    if (!name) {
        if (nameEl) nameEl.focus();
        return;
    }
    var duplicate = getRoutineStudySubjects(currentRoutine).some(function (s) {
        return s.name.toLowerCase() === name.toLowerCase();
    });
    if (duplicate) {
        alert('Já existe uma matéria com este nome.');
        return;
    }
    var record = ensureStudySubjectInCatalog(currentRoutine, {
        name: name,
        color: studyUiState.subjectCreateColor,
        icon: studyUiState.subjectCreateIcon,
        notes: notesEl ? notesEl.value.trim() : ''
    });
    if (!record) return;
    normalizeEstudosRoutine(currentRoutine);
    var saved = await saveRoutine();
    if (!saved) {
        currentRoutine.studySubjects = (currentRoutine.studySubjects || []).filter(function (s) {
            return String(s.id) !== String(record.id);
        });
        return;
    }
    await selectStudySubjectById(record.id, { startTimer: true });
    renderStudySection();
    showSaveSuccessMessage();
}

function refreshLucideIcons(root) {
    var lucideLib = typeof lucide !== 'undefined' ? lucide : (typeof Lucide !== 'undefined' ? Lucide : null);
    if (lucideLib && lucideLib.createIcons && root) lucideLib.createIcons({ root: root });
}

function pauseStudyTimerForFinish() {
    var r = studyActiveRuntime;
    if (r.startedAt) {
        r.accumulatedMs += Date.now() - r.startedAt;
        r.startedAt = null;
        stopStudyTick();
    }
    return currentDraftMs();
}

function ensureStudyFinishModalClosed() {
    var modal = document.getElementById('routineStudyFinishModal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.hidden = true;
    modal.setAttribute('hidden', '');
    modal.setAttribute('aria-hidden', 'true');
    studyUiState.finishModalOpen = false;
    studyUiState.pendingFinish = null;
}

function populateStudyFinishModalSummary(modal, pending) {
    if (!modal || !pending) return;
    var durationEl = modal.querySelector('#studyFinishModalDuration');
    var subjectEl = modal.querySelector('#studyFinishModalSubject');
    var descriptionEl = modal.querySelector('#studyFinishModalDescription');
    if (durationEl) durationEl.textContent = formatSessionDurationLabel(pending.durationSeconds);
    if (subjectEl) subjectEl.textContent = pending.subject || 'Estudo';
    if (descriptionEl) descriptionEl.textContent = pending.description || '—';
}

function buildPendingFinishFromTimer() {
    if (!currentRoutine || !isEstudosRoutine(currentRoutine)) return null;
    var ms = pauseStudyTimerForFinish();
    var seconds = Math.floor(ms / 1000);
    if (seconds < 1) return null;
    var endedAt = new Date();
    var startedAt = studyActiveRuntime.sessionStartedAt
        ? new Date(studyActiveRuntime.sessionStartedAt)
        : new Date(endedAt.getTime() - ms);
    var subject = getActiveStudySubject() || 'Estudo';
    var description = getActiveStudyDescription();
    var matchedTasks = resolveStudySessionTasksToComplete(currentRoutine, { subject: subject });
    return {
        subject: subject,
        description: description,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationSeconds: seconds,
        subjectId: studyUiState.subjectId || '',
        subjectColor: studyUiState.subjectColor || '',
        subjectIcon: studyUiState.subjectIcon || 'book-open',
        taskId: matchedTasks.length === 1 ? matchedTasks[0].id : (matchedTasks[0] && matchedTasks[0].id) || ''
    };
}

function openStudyFinishModal() {
    if (!currentRoutine || !isEstudosRoutine(currentRoutine)) return;
    var pending = buildPendingFinishFromTimer();
    if (!pending) {
        alert('Acumule pelo menos 1 segundo de estudo antes de finalizar.');
        refreshStudyTimerUi();
        return;
    }
    studyUiState.pendingFinish = pending;
    studyUiState.finishModalOpen = true;
    persistStudyDraftsToStorage();
    if (studyUiState.fullscreenMode) closeStudyFullscreen();

    var modal = document.getElementById('routineStudyFinishModal');
    if (modal) {
        populateStudyFinishModalSummary(modal, studyUiState.pendingFinish);
        modal.classList.add('is-open');
        modal.hidden = false;
        modal.removeAttribute('hidden');
        modal.setAttribute('aria-hidden', 'false');
        var lucideLib = typeof lucide !== 'undefined' ? lucide : (typeof Lucide !== 'undefined' ? Lucide : null);
        var iconRoot = modal.querySelector('.study-finish-modal__icon');
        if (lucideLib && lucideLib.createIcons && iconRoot) {
            lucideLib.createIcons({ root: iconRoot });
        }
    }
    refreshStudyTimerUi();
}

function closeStudyFinishModal() {
    ensureStudyFinishModalClosed();
}

function discardStudyFinish() {
    closeStudyFinishModal();
    stopStudyTick();
    studyActiveRuntime.accumulatedMs = 0;
    studyActiveRuntime.startedAt = null;
    studyActiveRuntime.sessionStartedAt = null;
    clearStudyDraftStorage();
    refreshStudyTimerUi();
}

/** Confirma antes de fechar/descartar a sessão concluída (X, Descartar, overlay, Esc). */
async function requestDiscardStudyFinish() {
    var modal = document.getElementById('routineStudyFinishModal');
    var isOpen = studyUiState.finishModalOpen
        || (modal && modal.classList.contains('is-open') && !modal.hidden);
    if (!isOpen) return;
    var ok = await openStudyConfirmModal({
        title: 'Descartar sessão?',
        message: 'Tem certeza que deseja descartar esta sessão? O tempo estudado não será salvo.',
        confirmLabel: 'Descartar',
        cancelLabel: 'Voltar'
    });
    if (!ok) return;
    discardStudyFinish();
}

function ensureStudyConfirmModalClosed() {
    var modal = document.getElementById('routineStudyConfirmModal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
}

function closeStudyConfirmModal(result) {
    ensureStudyConfirmModalClosed();
    var resolve = _studyConfirmResolver;
    _studyConfirmResolver = null;
    if (typeof resolve === 'function') resolve(!!result);
}

function openStudyConfirmModal(options) {
    options = options || {};
    setupStudyConfirmModalEvents();
    var modal = document.getElementById('routineStudyConfirmModal');
    if (!modal) {
        return Promise.resolve(window.confirm(options.message || options.title || 'Confirmar?'));
    }

    if (_studyConfirmResolver) {
        var prev = _studyConfirmResolver;
        _studyConfirmResolver = null;
        prev(false);
    }

    var titleEl = document.getElementById('studyConfirmModalTitle');
    var messageEl = document.getElementById('studyConfirmModalMessage');
    var okBtn = document.getElementById('studyConfirmOkBtn');
    var cancelBtn = document.getElementById('studyConfirmCancelBtn');
    var iconWrap = document.getElementById('studyConfirmModalIcon');

    if (titleEl) titleEl.textContent = options.title || 'Confirmar';
    if (messageEl) messageEl.textContent = options.message || '';
    if (okBtn) okBtn.textContent = options.confirmLabel || 'Confirmar';
    if (cancelBtn) cancelBtn.textContent = options.cancelLabel || 'Cancelar';
    if (iconWrap) {
        iconWrap.innerHTML = '<i data-lucide="triangle-alert"></i>';
    }

    modal.hidden = false;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');

    var lucideLib = typeof lucide !== 'undefined' ? lucide : (typeof Lucide !== 'undefined' ? Lucide : null);
    if (lucideLib && lucideLib.createIcons) lucideLib.createIcons();

    window.setTimeout(function () {
        if (okBtn) okBtn.focus();
    }, 0);

    return new Promise(function (resolve) {
        _studyConfirmResolver = resolve;
    });
}

function setupStudyConfirmModalEvents() {
    if (_studyConfirmModalEventsBound) return;
    _studyConfirmModalEventsBound = true;

    var modal = document.getElementById('routineStudyConfirmModal');
    if (!modal) return;
    ensureStudyConfirmModalClosed();

    modal.addEventListener('click', function (e) {
        if (e.target.closest('#studyConfirmOkBtn')) {
            e.preventDefault();
            closeStudyConfirmModal(true);
            return;
        }
        if (e.target.closest('#studyConfirmCancelBtn') || e.target.closest('#studyConfirmModalOverlay')) {
            e.preventDefault();
            closeStudyConfirmModal(false);
        }
    });
}

function applyStudySessionCommitToMemory(pending) {
    normalizeEstudosRoutine(currentRoutine);
    stopStudyTick();
    stopStudyDraftPersistLoop();
    studyActiveRuntime.accumulatedMs = 0;
    studyActiveRuntime.startedAt = null;
    studyActiveRuntime.sessionStartedAt = null;

    if (!Array.isArray(currentRoutine.studySessions)) currentRoutine.studySessions = [];
    var sessionDateStr = normalizeDateStr(pending.endedAt) || getLocalDateStr(new Date());
    var wasDoneBefore = isRoutineDayClosedOut(currentRoutine, sessionDateStr);
    var completionSnapshot = snapshotRoutineCompletionState(currentRoutine, sessionDateStr);

    currentRoutine.studySessions.push(createStudySessionRecord(pending));
    ensureStudySubjectInCatalog(currentRoutine, pending);
    var markedTasks = markStudyRoutineCompleteAfterSession(currentRoutine, sessionDateStr, pending);
    currentRoutine.progress = calculateProgress(currentRoutine);
    clearStudyDraftStorage();

    return {
        sessionDateStr: sessionDateStr,
        wasDoneBefore: wasDoneBefore,
        completionSnapshot: completionSnapshot,
        markedTasks: markedTasks
    };
}

async function finalizeStudySessionUiAfterCommit(meta) {
    studySessionTableState.page = 1;
    beginNewStudySession({ force: true, clearDescription: true, clearSubject: true });
    (meta.markedTasks || []).forEach(function (task) {
        syncTaskCheckboxInDom(task.id, true);
    });
    renderStudySessionTable();
    renderRoutineStats();
    renderTodayMissionCard();
    syncRoutineTodayVisualState(meta.sessionDateStr);
    refreshStudyTimerUi();
    renderStudySection();

    if (!meta.wasDoneBefore && isRoutineDayClosedOut(currentRoutine, meta.sessionDateStr)) {
        if (isEstudosRoutine(currentRoutine)) {
            if (typeof updateBestStreak === 'function') updateBestStreak(currentRoutine);
            setRoutineCompleteAnsweredToday(currentRoutine.id);
            hideCompleteQuestionBlock();
            hideRoutineTaskCompleteSuccess();
        } else {
            await onRoutineDayJustCompleted(false);
        }
    } else if (isRoutineDayClosedOut(currentRoutine, meta.sessionDateStr)) {
        setRoutineCompleteAnsweredToday(currentRoutine.id);
        hideCompleteQuestionBlock();
        hideRoutineTaskCompleteSuccess();
    }
}

async function commitStudySessionFromPending(pending, options) {
    options = options || {};
    if (!pending || !currentRoutine) return false;
    if (studyUiState._commitLock) return false;
    studyUiState._commitLock = true;

    var meta = applyStudySessionCommitToMemory(pending);
    var saved = await saveRoutine({ silent: !!options.silent });
    studyUiState._commitLock = false;

    if (!saved) {
        currentRoutine.studySessions.pop();
        restoreRoutineCompletionState(currentRoutine, meta.completionSnapshot);
        currentRoutine.progress = calculateProgress(currentRoutine);
        if (options.auto) {
            studyActiveRuntime.accumulatedMs = Math.max(0, Math.floor(pending.durationSeconds || 0) * 1000);
            studyActiveRuntime.startedAt = null;
            studyActiveRuntime.sessionStartedAt = pending.startedAt || studyActiveRuntime.sessionStartedAt;
            studyUiState.pendingFinish = pending;
            persistStudyDraftsToStorage();
        }
        return false;
    }

    closeStudyFinishModal();
    studyUiState.pendingFinish = null;
    if (!options.skipUi) {
        showSaveSuccessMessage();
        await finalizeStudySessionUiAfterCommit(meta);
    } else {
        beginNewStudySession({ force: true, clearDescription: true, clearSubject: true });
    }
    return true;
}

async function commitStudySession() {
    var pending = studyUiState.pendingFinish;
    if (!pending || !currentRoutine) return;
    var saveBtn = document.getElementById('studyFinishSaveBtn');
    if (saveBtn && saveBtn.disabled) return;
    var discardBtn = document.getElementById('studyFinishDiscardBtn');
    if (saveBtn) saveBtn.disabled = true;
    if (discardBtn) discardBtn.disabled = true;

    try {
        await commitStudySessionFromPending(pending, { silent: false });
    } finally {
        if (saveBtn) saveBtn.disabled = false;
        if (discardBtn) discardBtn.disabled = false;
    }
}

/**
 * Auto-salva o progresso do timer ao sair (voltar / fechar) sem o usuário
 * precisar clicar em "Salvar sessão".
 */
async function autoSaveStudyProgressIfNeeded(options) {
    options = options || {};
    if (!currentRoutine || !isEstudosRoutine(currentRoutine)) return false;
    if (studyUiState._commitLock) return false;

    var pending = studyUiState.pendingFinish;
    if (!pending) {
        if (currentDraftMs() < 1000) return false;
        pending = buildPendingFinishFromTimer();
    }
    if (!pending || pending.durationSeconds < 1) return false;

    studyUiState.pendingFinish = pending;
    return commitStudySessionFromPending(pending, {
        silent: true,
        auto: true,
        skipUi: options.reason === 'unload' || options.reason === 'navigate'
    });
}

/** Caminho síncrono/keepalive para beforeunload/pagehide. */
function flushStudyAutosaveOnUnload() {
    if (studyAutosaveUnloadDone) return;
    if (!currentRoutine || !isEstudosRoutine(currentRoutine)) {
        persistStudyDraftsToStorage();
        return;
    }
    if (studyUiState._commitLock) {
        persistStudyDraftsToStorage();
        return;
    }

    var pending = studyUiState.pendingFinish;
    if (!pending) {
        if (currentDraftMs() < 1000) return;
        pending = buildPendingFinishFromTimer();
    }
    if (!pending || pending.durationSeconds < 1) {
        persistStudyDraftsToStorage();
        return;
    }

    studyAutosaveUnloadDone = true;
    studyUiState.pendingFinish = null;
    applyStudySessionCommitToMemory(pending);
    mirrorRoutineToLocalStorage(currentRoutine);
    notifyRoutinesUpdatedGlobally();

    var token = localStorage.getItem('token');
    if (!token) return;
    try {
        fetch(API_URL + '/routines/' + encodeURIComponent(currentRoutine.id), {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify(currentRoutine),
            keepalive: true
        }).catch(function () { /* local mirror já guardou */ });
    } catch (e) { /* ignore */ }
}

async function saveStudySessionForTask() {
    openStudyFinishModal();
}

function ensureStudyFullscreenClosed() {
    var el = document.getElementById('routineStudyFullscreen');
    if (!el) return;
    el.classList.remove('is-open');
    el.hidden = true;
    el.setAttribute('hidden', '');
    el.setAttribute('aria-hidden', 'true');
    studyUiState.fullscreenMode = false;
    document.body.classList.remove('study-fullscreen-active');
}

function openStudyFullscreen() {
    studyUiState.fullscreenMode = true;
    var el = document.getElementById('routineStudyFullscreen');
    if (el) {
        el.classList.add('is-open');
        el.hidden = false;
        el.removeAttribute('hidden');
        el.setAttribute('aria-hidden', 'false');
    }
    document.body.classList.add('study-fullscreen-active');
    ensureStudyFullscreenFlipClock();
    refreshStudyTimerUi();
    var lucideLib = typeof lucide !== 'undefined' ? lucide : (typeof Lucide !== 'undefined' ? Lucide : null);
    if (lucideLib && lucideLib.createIcons && el) {
        lucideLib.createIcons({ root: el });
    }
}

function closeStudyFullscreen() {
    ensureStudyFullscreenClosed();
}

function collectAllStudySessions(routine) {
    if (!routine) return [];
    normalizeEstudosRoutine(routine);
    return (routine.studySessions || []).slice().sort(function (a, b) {
        return new Date(b.endedAt) - new Date(a.endedAt);
    });
}

function collectStudySessionsForTable(routine) {
    var all = collectAllStudySessions(routine);
    if (studySessionTableState.showDeleted) {
        return all.filter(function (s) { return s.status === 'deleted'; });
    }
    return all.filter(function (s) { return s.status !== 'deleted'; });
}

function countDeletedStudySessions(routine) {
    if (!routine) return 0;
    var core = getStudyCore();
    if (core && core.getDeletedStudySessions) {
        return core.getDeletedStudySessions(routine).length;
    }
    return (routine.studySessions || []).filter(function (s) { return s.status === 'deleted'; }).length;
}

function findStudySessionById(sessionId) {
    if (!currentRoutine || !sessionId) return null;
    normalizeEstudosRoutine(currentRoutine);
    return (currentRoutine.studySessions || []).find(function (s) {
        return String(s.id) === String(sessionId);
    }) || null;
}

async function deleteStudySessionById(sessionId) {
    var session = findStudySessionById(sessionId);
    if (!session || session.status === 'deleted') return false;
    if (!confirm('Excluir esta sessão do histórico? Você poderá restaurá-la em "Ver excluídas".')) return false;
    session.status = 'deleted';
    session.deletedAt = new Date().toISOString();
    var saved = await saveRoutine();
    if (!saved) {
        session.status = 'completed';
        delete session.deletedAt;
        return false;
    }
    closeStudySessionRowMenu();
    renderStudySessionTable();
    renderRoutineStats();
    updateStudySessionDeletedToggleUi();
    return true;
}

async function restoreStudySessionById(sessionId) {
    var session = findStudySessionById(sessionId);
    if (!session || session.status !== 'deleted') return false;
    session.status = 'completed';
    delete session.deletedAt;
    var saved = await saveRoutine();
    if (!saved) {
        session.status = 'deleted';
        return false;
    }
    closeStudySessionRowMenu();
    renderStudySessionTable();
    renderRoutineStats();
    updateStudySessionDeletedToggleUi();
    return true;
}

function toggleShowDeletedStudySessions(forceValue) {
    if (typeof forceValue === 'boolean') {
        studySessionTableState.showDeleted = forceValue;
    } else {
        studySessionTableState.showDeleted = !studySessionTableState.showDeleted;
    }
    studySessionTableState.page = 1;
    closeStudySessionRowMenu();
    renderStudySessionTable();
    updateStudySessionDeletedToggleUi();
}

function updateStudySessionDeletedToggleUi() {
    var btn = document.getElementById('studySessionToggleDeletedBtn');
    var labelEl = document.getElementById('studySessionToggleDeletedLabel');
    var countEl = document.getElementById('studySessionDeletedCount');
    var titleEl = document.querySelector('.study-sessions-card__title');
    var menuToggle = document.querySelector('#studySessionRowMenu [data-action="toggle-deleted"]');
    if (!currentRoutine || !isEstudosRoutine(currentRoutine)) return;

    var deletedCount = countDeletedStudySessions(currentRoutine);
    if (btn) {
        btn.hidden = deletedCount === 0 && !studySessionTableState.showDeleted;
        btn.setAttribute('aria-pressed', studySessionTableState.showDeleted ? 'true' : 'false');
        btn.classList.toggle('is-active', studySessionTableState.showDeleted);
    }
    if (labelEl) {
        labelEl.textContent = studySessionTableState.showDeleted ? 'Ver ativas' : 'Ver excluídas';
    }
    if (countEl) {
        countEl.textContent = deletedCount > 0 ? String(deletedCount) : '';
        countEl.hidden = deletedCount <= 0;
    }
    if (titleEl) {
        titleEl.textContent = studySessionTableState.showDeleted
            ? 'Sessões excluídas'
            : 'Histórico de sessões';
    }
    if (menuToggle) {
        menuToggle.textContent = studySessionTableState.showDeleted ? 'Ver sessões ativas' : 'Ver excluídas';
    }
}

function closeStudySessionRowMenu() {
    var menu = document.getElementById('studySessionRowMenu');
    if (!menu) return;
    menu.hidden = true;
    menu.setAttribute('hidden', '');
    if (studySessionRowMenuState.anchor) {
        studySessionRowMenuState.anchor.setAttribute('aria-expanded', 'false');
    }
    studySessionRowMenuState.sessionId = null;
    studySessionRowMenuState.anchor = null;
}

function openStudySessionRowMenu(anchorBtn, sessionId) {
    var menu = document.getElementById('studySessionRowMenu');
    if (!menu || !anchorBtn || !sessionId) return;

    closeStudySessionRowMenu();

    var deleteBtn = menu.querySelector('[data-action="delete"]');
    var restoreBtn = menu.querySelector('[data-action="restore"]');
    var session = findStudySessionById(sessionId);
    var isDeletedView = studySessionTableState.showDeleted || (session && session.status === 'deleted');

    if (deleteBtn) deleteBtn.hidden = isDeletedView;
    if (restoreBtn) restoreBtn.hidden = !isDeletedView;
    var toggleDeletedItem = menu.querySelector('[data-action="toggle-deleted"]');
    if (toggleDeletedItem) {
        var dc = countDeletedStudySessions(currentRoutine);
        toggleDeletedItem.hidden = dc === 0 && !studySessionTableState.showDeleted;
    }

    studySessionRowMenuState.sessionId = sessionId;
    studySessionRowMenuState.anchor = anchorBtn;

    var wrap = anchorBtn.closest('.study-sessions-table-wrap') || document.getElementById('routineStudySessionsSection');
    if (!wrap) return;
    menu.hidden = false;
    menu.removeAttribute('hidden');
    anchorBtn.setAttribute('aria-expanded', 'true');

    var anchorRect = anchorBtn.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.visibility = 'hidden';
    var menuWidth = menu.offsetWidth || 168;
    menu.style.visibility = '';
    var left = anchorRect.right - menuWidth;
    if (left < 8) left = 8;
    if (left + menuWidth > window.innerWidth - 8) left = window.innerWidth - menuWidth - 8;
    menu.style.top = Math.min(window.innerHeight - 8, anchorRect.bottom + 6) + 'px';
    menu.style.left = left + 'px';

    var lucideLib = typeof lucide !== 'undefined' ? lucide : (typeof Lucide !== 'undefined' ? Lucide : null);
    if (lucideLib && lucideLib.createIcons) lucideLib.createIcons({ root: menu });
}

function setupStudySessionRowMenuEvents() {
    if (_studySessionRowMenuBound) return;
    _studySessionRowMenuBound = true;

    var menu = document.getElementById('studySessionRowMenu');
    var toggleBtn = document.getElementById('studySessionToggleDeletedBtn');

    if (toggleBtn) {
        toggleBtn.addEventListener('click', function (e) {
            e.preventDefault();
            toggleShowDeletedStudySessions();
        });
    }

    if (menu) {
        menu.addEventListener('click', function (e) {
            var item = e.target.closest('[data-action]');
            if (!item || !menu.contains(item)) return;
            e.preventDefault();
            e.stopPropagation();
            var action = item.getAttribute('data-action');
            var sessionId = studySessionRowMenuState.sessionId;
            if (action === 'delete' && sessionId) {
                deleteStudySessionById(sessionId).catch(function (err) { console.error(err); });
            } else if (action === 'restore' && sessionId) {
                restoreStudySessionById(sessionId).catch(function (err) { console.error(err); });
            } else if (action === 'toggle-deleted') {
                toggleShowDeletedStudySessions();
            }
        });
    }

    document.addEventListener('click', function (e) {
        var menuBtn = e.target.closest('.study-session-row-menu');
        if (menuBtn) {
            e.preventDefault();
            e.stopPropagation();
            var row = menuBtn.closest('tr[data-session-id]');
            var sessionId = row ? row.getAttribute('data-session-id') : '';
            if (!sessionId) return;
            if (studySessionRowMenuState.anchor === menuBtn && menu && !menu.hasAttribute('hidden')) {
                closeStudySessionRowMenu();
            } else {
                openStudySessionRowMenu(menuBtn, sessionId);
            }
            return;
        }
        if (!e.target.closest('#studySessionRowMenu')) {
            closeStudySessionRowMenu();
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeStudySessionRowMenu();
    });
}

var _ecFilterSelectGlobalsBound = false;

function getEcFilterSelectValue(id) {
    var root = document.getElementById(id);
    return root ? (root.getAttribute('data-value') || '') : '';
}

function syncEcFilterSelectDisplay(root) {
    if (!root) return;
    var val = root.getAttribute('data-value') || '';
    var valueEl = root.querySelector('.ec-filter-select__value');
    var options = root.querySelectorAll('.ec-filter-select__option');
    var label = '';
    options.forEach(function (opt) {
        var selected = (opt.getAttribute('data-value') || '') === val;
        opt.classList.toggle('is-selected', selected);
        opt.setAttribute('aria-selected', selected ? 'true' : 'false');
        if (selected) label = opt.textContent.trim();
    });
    if (valueEl && label) valueEl.textContent = label;
}

function closeEcFilterSelect(root) {
    if (!root || !root.classList.contains('is-open')) return;
    root.classList.remove('is-open');
    var trigger = root.querySelector('.ec-filter-select__trigger');
    var panel = root.querySelector('.ec-filter-select__panel');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    if (panel) panel.hidden = true;
}

function openEcFilterSelect(root) {
    document.querySelectorAll('.ec-filter-select.is-open').forEach(function (other) {
        if (other !== root) closeEcFilterSelect(other);
    });
    root.classList.add('is-open');
    var trigger = root.querySelector('.ec-filter-select__trigger');
    var panel = root.querySelector('.ec-filter-select__panel');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    if (panel) {
        panel.hidden = false;
        var selected = panel.querySelector('.ec-filter-select__option.is-selected');
        if (selected) selected.focus();
    }
}

function bindEcFilterSelectRoot(root) {
    if (!root || root.dataset.ecFilterBound === '1') return;
    root.dataset.ecFilterBound = '1';
    var trigger = root.querySelector('.ec-filter-select__trigger');
    var panel = root.querySelector('.ec-filter-select__panel');
    if (!trigger || !panel) return;

    trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        if (root.classList.contains('is-open')) closeEcFilterSelect(root);
        else openEcFilterSelect(root);
    });

    panel.addEventListener('click', function (e) {
        var opt = e.target.closest('.ec-filter-select__option');
        if (!opt || !panel.contains(opt)) return;
        var prev = root.getAttribute('data-value') || '';
        var next = opt.getAttribute('data-value') || '';
        root.setAttribute('data-value', next);
        syncEcFilterSelectDisplay(root);
        closeEcFilterSelect(root);
        if (prev !== next) {
            root.dispatchEvent(new CustomEvent('ec-filter-change', {
                bubbles: true,
                detail: { value: next }
            }));
        }
        trigger.focus();
    });

    trigger.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!root.classList.contains('is-open')) openEcFilterSelect(root);
        }
    });

    panel.addEventListener('keydown', function (e) {
        var opts = Array.prototype.slice.call(panel.querySelectorAll('.ec-filter-select__option'));
        var idx = opts.indexOf(document.activeElement);
        if (e.key === 'Escape') {
            closeEcFilterSelect(root);
            trigger.focus();
        } else if (e.key === 'ArrowDown' && idx < opts.length - 1) {
            e.preventDefault();
            opts[idx + 1].focus();
        } else if (e.key === 'ArrowUp' && idx > 0) {
            e.preventDefault();
            opts[idx - 1].focus();
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (document.activeElement && document.activeElement.classList.contains('ec-filter-select__option')) {
                document.activeElement.click();
            }
        }
    });
}

function initEcFilterSelects() {
    document.querySelectorAll('.ec-filter-select').forEach(function (root) {
        syncEcFilterSelectDisplay(root);
        bindEcFilterSelectRoot(root);
    });
    if (!_ecFilterSelectGlobalsBound) {
        _ecFilterSelectGlobalsBound = true;
        document.addEventListener('click', function (e) {
            document.querySelectorAll('.ec-filter-select.is-open').forEach(function (root) {
                if (!root.contains(e.target)) closeEcFilterSelect(root);
            });
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                document.querySelectorAll('.ec-filter-select.is-open').forEach(closeEcFilterSelect);
            }
        });
    }
}

function setEcFilterSelectOptions(id, optionsList, selectedValue) {
    var root = document.getElementById(id);
    if (!root) return;
    var panel = root.querySelector('.ec-filter-select__panel');
    if (!panel) return;
    panel.innerHTML = optionsList.map(function (opt) {
        return '<button type="button" class="ec-filter-select__option" role="option" data-value="' +
            escapeHtml(String(opt.value)) + '" aria-selected="false" tabindex="-1">' +
            escapeHtml(opt.label) + '</button>';
    }).join('');
    var selectedStr = selectedValue == null ? '' : String(selectedValue);
    var hasSelected = optionsList.some(function (o) { return String(o.value) === selectedStr; });
    root.setAttribute('data-value', hasSelected ? selectedStr : String(optionsList[0] ? optionsList[0].value : ''));
    syncEcFilterSelectDisplay(root);
    bindEcFilterSelectRoot(root);
}

function filterStudySessions(sessions) {
    var subject = getEcFilterSelectValue('studySessionFilterSubject');
    var period = getEcFilterSelectValue('studySessionFilterPeriod') || '30';
    var now = new Date();
    return sessions.filter(function (s) {
        if (subject && (s.subject || '').trim() !== subject) return false;
        if (period === 'all') return true;
        var days = parseInt(period, 10);
        if (isNaN(days)) return true;
        var cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() - days);
        var ended = new Date(s.endedAt);
        return !isNaN(ended.getTime()) && ended >= cutoff;
    });
}

function renderStudySessionTable() {
    var tbody = document.getElementById('studySessionsTableBody');
    var emptyEl = document.getElementById('studySessionsEmpty');
    var deletedEmptyEl = document.getElementById('studySessionsDeletedEmpty');
    var paginationEl = document.getElementById('studySessionPagination');
    if (!tbody || !currentRoutine || !isEstudosRoutine(currentRoutine)) return;

    var filtered = filterStudySessions(collectStudySessionsForTable(currentRoutine));
    var pageSize = studySessionTableState.pageSize;
    var totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (studySessionTableState.page > totalPages) studySessionTableState.page = totalPages;
    if (studySessionTableState.page < 1) studySessionTableState.page = 1;
    var start = (studySessionTableState.page - 1) * pageSize;
    var pageRows = filtered.slice(start, start + pageSize);
    var showDeleted = studySessionTableState.showDeleted;

    if (emptyEl) emptyEl.classList.toggle('hidden', showDeleted || filtered.length > 0);
    if (deletedEmptyEl) deletedEmptyEl.classList.toggle('hidden', !showDeleted || filtered.length > 0);
    tbody.innerHTML = pageRows.map(function (s) {
        var statusClass = 'study-session-status--pending';
        var statusLabel = 'Pendente';
        if (s.status === 'deleted') {
            statusClass = 'study-session-status--deleted';
            statusLabel = 'Excluída';
        } else if (s.status === 'completed') {
            statusClass = 'study-session-status--done';
            statusLabel = 'Concluído';
        }
        var subjectName = (s.subject || '').trim() || 'Estudo';
        var subjectAria = 'Ver produtividade de ' + subjectName;
        var rowClass = s.status === 'deleted' ? ' study-sessions-table__row--deleted' : '';
        return '<tr class="study-sessions-table__row study-sessions-table__row--clickable' + rowClass + '" data-session-id="' + escapeHtml(s.id || '') + '" data-subject="' + escapeHtml(subjectName) + '" role="button" tabindex="0" aria-label="' + escapeHtml(subjectAria) + '">' +
            '<td class="study-sessions-table__subject">' +
                buildStudySessionSubjectCellHtml(currentRoutine, s.subject) + '</td>' +
            '<td class="study-sessions-table__desc">' +
                escapeHtml(s.description || '—') + '</td>' +
            '<td class="study-sessions-table__time">' + escapeHtml(formatSessionTime(s.startedAt)) + '</td>' +
            '<td class="study-sessions-table__time">' + escapeHtml(formatSessionTime(s.endedAt)) + '</td>' +
            '<td class="study-sessions-table__duration">' + escapeHtml(formatSessionDurationLabel(s.durationSeconds)) + '</td>' +
            '<td class="study-sessions-table__status"><span class="study-session-status ' + statusClass + '">' + escapeHtml(statusLabel) + '</span></td>' +
            '<td class="study-sessions-table__actions">' +
            '<button type="button" class="study-session-row-menu" aria-label="Opções da sessão" aria-haspopup="menu" aria-expanded="false" title="Opções">' +
            '<i data-lucide="ellipsis-vertical" aria-hidden="true"></i></button></td>' +
            '</tr>';
    }).join('');

    var lucideLib = typeof lucide !== 'undefined' ? lucide : (typeof Lucide !== 'undefined' ? Lucide : null);
    if (lucideLib && lucideLib.createIcons && tbody) lucideLib.createIcons({ root: tbody });

    if (paginationEl) {
        if (filtered.length <= pageSize) {
            paginationEl.innerHTML = filtered.length
                ? '<span>Página 1 de 1</span>'
                : '';
        } else {
            paginationEl.innerHTML =
                '<button type="button" id="studySessionPrevPage"' + (studySessionTableState.page <= 1 ? ' disabled' : '') + ' aria-label="Página anterior">←</button>' +
                '<span>Página ' + studySessionTableState.page + ' de ' + totalPages + '</span>' +
                '<button type="button" id="studySessionNextPage"' + (studySessionTableState.page >= totalPages ? ' disabled' : '') + ' aria-label="Próxima página">→</button>';
            var prev = document.getElementById('studySessionPrevPage');
            var next = document.getElementById('studySessionNextPage');
            if (prev) prev.addEventListener('click', function () {
                studySessionTableState.page--;
                renderStudySessionTable();
            });
            if (next) next.addEventListener('click', function () {
                studySessionTableState.page++;
                renderStudySessionTable();
            });
        }
    }

    updateStudySessionDeletedToggleUi();
}

function exportStudySessionsCsv() {
    if (!currentRoutine) return;
    var rows = filterStudySessions(collectStudySessionsForTable(currentRoutine));
    if (!rows.length) {
        alert('Não há sessões para exportar no filtro atual.');
        return;
    }
    var header = ['Data', 'Matéria', 'Descrição', 'Início', 'Fim', 'Duração', 'Status', 'Criado em'];
    var lines = [header.join(';')];
    rows.forEach(function (s) {
        lines.push([
            formatSessionDateOnly(s.startedAt || s.endedAt),
            s.subject || '',
            s.description || '',
            formatSessionDateTime(s.startedAt),
            formatSessionDateTime(s.endedAt),
            formatSessionDurationLabel(s.durationSeconds),
            s.status === 'completed' ? 'Concluído' : (s.status === 'deleted' ? 'Excluída' : 'Pendente'),
            formatSessionDateTime(s.createdAt || s.endedAt)
        ].map(function (cell) {
            return '"' + String(cell).replace(/"/g, '""') + '"';
        }).join(';'));
    });
    var blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'historico-sessoes-' + (currentRoutine.title || 'rotina') + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function niceStudyChartYMax(val) {
    if (!val || val <= 0) return 1;
    if (val <= 5) return 5;
    if (val <= 10) return 10;
    if (val <= 30) return 30;
    if (val <= 60) return 60;
    if (val <= 120) return 120;
    return Math.ceil(val / 60) * 60;
}

function getSubjectStudyAnalytics(subjectName, daysCount) {
    daysCount = daysCount || 30;
    if (!currentRoutine) {
        return {
            subjectName: subjectName || '—',
            dailySeries: [],
            sessions: [],
            totals: { totalSeconds: 0, sessionCount: 0, avgSeconds: 0, activeDays: 0, lastSessionAt: null }
        };
    }
    var core = getStudyCore();
    if (core && core.buildSubjectStudyAnalytics) {
        return core.buildSubjectStudyAnalytics(currentRoutine, subjectName, daysCount);
    }
    return {
        subjectName: subjectName || '—',
        dailySeries: [],
        sessions: [],
        totals: { totalSeconds: 0, sessionCount: 0, avgSeconds: 0, activeDays: 0, lastSessionAt: null }
    };
}

function renderStudySubjectInsightsStats(statsEl, totals) {
    if (!statsEl || !totals) return;
    statsEl.innerHTML =
        '<div class="study-subject-insights-stat">' +
            '<span class="study-subject-insights-stat__label">Total estudado</span>' +
            '<span class="study-subject-insights-stat__value">' + escapeHtml(formatStudyTotalLabel(totals.totalSeconds)) + '</span>' +
        '</div>' +
        '<div class="study-subject-insights-stat">' +
            '<span class="study-subject-insights-stat__label">Sessões</span>' +
            '<span class="study-subject-insights-stat__value">' + escapeHtml(String(totals.sessionCount || 0)) + '</span>' +
        '</div>' +
        '<div class="study-subject-insights-stat">' +
            '<span class="study-subject-insights-stat__label">Média</span>' +
            '<span class="study-subject-insights-stat__value">' + escapeHtml(formatStudyTotalLabel(totals.avgSeconds || 0)) + '</span>' +
        '</div>' +
        '<div class="study-subject-insights-stat">' +
            '<span class="study-subject-insights-stat__label">Dias ativos</span>' +
            '<span class="study-subject-insights-stat__value">' + escapeHtml(String(totals.activeDays || 0)) + '</span>' +
        '</div>';
}

function renderStudySubjectInsightsChart(container, dailySeries, subjectColor) {
    if (!container) return;
    if (!dailySeries || !dailySeries.length) {
        container.innerHTML = '<p class="study-subject-insights-chart__empty">Sem dados no período.</p>';
        return;
    }
    var color = subjectColor || '#22c55e';
    var maxMin = Math.max.apply(null, dailySeries.map(function (d) { return d.minutes || 0; }));
    var yMax = niceStudyChartYMax(maxMin);
    var w = 560;
    var h = 180;
    var pad = { left: 36, right: 12, top: 16, bottom: 28 };
    var plotW = w - pad.left - pad.right;
    var plotH = h - pad.top - pad.bottom;
    var n = dailySeries.length;
    var barGap = 2;
    var barW = Math.max(3, (plotW / n) - barGap);

    var y = function (v) {
        return pad.top + plotH - (v / yMax) * plotH;
    };

    var grid = '';
    for (var g = 0; g <= 4; g++) {
        var gy = pad.top + (g / 4) * plotH;
        grid += '<line x1="' + pad.left + '" y1="' + gy + '" x2="' + (w - pad.right) + '" y2="' + gy + '" class="study-subject-insights-chart__grid"/>';
    }

    var yLabels = '';
    for (var t = 0; t <= 4; t++) {
        var val = Math.round((t / 4) * yMax);
        var ly = pad.top + plotH - (t / 4) * plotH;
        yLabels += '<text x="' + (pad.left - 6) + '" y="' + (ly + 4) + '" text-anchor="end" class="study-subject-insights-chart__axis">' + val + '</text>';
    }

    var bars = '';
    var xLabels = '';
    dailySeries.forEach(function (day, i) {
        var minutes = day.minutes || 0;
        var bx = pad.left + i * (plotW / n) + barGap / 2;
        var bh = minutes > 0 ? Math.max(2, plotH - (y(minutes) - pad.top)) : 0;
        var by = pad.top + plotH - bh;
        bars += '<rect x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="2" fill="' + escapeHtml(color) + '" class="study-subject-insights-chart__bar">' +
            '<title>' + escapeHtml(formatHeatmapHoverDay(day.dateStr)) + ': ' + minutes + ' min</title></rect>';
        if (i === 0 || i === n - 1 || i === Math.floor(n / 2)) {
            var lx = bx + barW / 2;
            xLabels += '<text x="' + lx.toFixed(1) + '" y="' + (h - 8) + '" text-anchor="middle" class="study-subject-insights-chart__axis">' +
                escapeHtml(formatHeatmapHoverDay(day.dateStr)) + '</text>';
        }
    });

    container.innerHTML =
        '<svg class="study-subject-insights-chart__svg" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
            '<g class="study-subject-insights-chart__grid-group">' + grid + '</g>' +
            '<g class="study-subject-insights-chart__yaxis">' + yLabels + '</g>' +
            '<g class="study-subject-insights-chart__bars">' + bars + '</g>' +
            '<g class="study-subject-insights-chart__xlabels">' + xLabels + '</g>' +
        '</svg>' +
        '<p class="study-subject-insights-chart__caption">Minutos por dia · últimos ' + n + ' dias</p>';
}

function renderStudySubjectInsightsHistory(listEl, sessions, highlightSessionId) {
    if (!listEl) return;
    if (!sessions || !sessions.length) {
        listEl.innerHTML = '';
        return;
    }
    listEl.innerHTML = sessions.map(function (s) {
        var hl = highlightSessionId && String(s.id) === String(highlightSessionId)
            ? ' study-subject-insights-history__item--highlight' : '';
        var desc = (s.description || '').trim() || '—';
        return '<article class="study-subject-insights-history__item' + hl + '" data-session-id="' + escapeHtml(s.id || '') + '">' +
            '<div class="study-subject-insights-history__meta">' +
                '<time class="study-subject-insights-history__date">' + escapeHtml(formatSessionDateOnly(s.startedAt || s.endedAt)) + '</time>' +
                '<span class="study-subject-insights-history__duration">' + escapeHtml(formatSessionDurationLabel(s.durationSeconds)) + '</span>' +
            '</div>' +
            '<p class="study-subject-insights-history__desc">' + escapeHtml(desc) + '</p>' +
            '<p class="study-subject-insights-history__time">' +
                escapeHtml(formatSessionTime(s.startedAt)) + ' – ' + escapeHtml(formatSessionTime(s.endedAt)) +
            '</p>' +
        '</article>';
    }).join('');

    if (highlightSessionId) {
        var highlighted = listEl.querySelector('.study-subject-insights-history__item--highlight');
        if (highlighted && typeof highlighted.scrollIntoView === 'function') {
            highlighted.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }
}

function clearStudyInsightsActiveRow() {
    document.querySelectorAll('.study-sessions-table__row--active').forEach(function (row) {
        row.classList.remove('study-sessions-table__row--active');
    });
}

function setStudyInsightsActiveRow(sessionId) {
    clearStudyInsightsActiveRow();
    if (!sessionId) return;
    var tbody = document.getElementById('studySessionsTableBody');
    if (!tbody) return;
    var rows = tbody.querySelectorAll('tr.study-sessions-table__row--clickable');
    for (var i = 0; i < rows.length; i++) {
        if (rows[i].getAttribute('data-session-id') === sessionId) {
            rows[i].classList.add('study-sessions-table__row--active');
            break;
        }
    }
}

function ensureStudySubjectInsightsModalClosed() {
    var modal = document.getElementById('routineStudySubjectInsightsModal');
    if (!modal) return;
    modal.classList.remove('is-open', 'is-closing', 'is-settled');
    modal.hidden = true;
    modal.setAttribute('hidden', '');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('study-subject-insights-open');
    clearStudyInsightsActiveRow();
}

function closeStudySubjectInsightsModal() {
    var modal = document.getElementById('routineStudySubjectInsightsModal');
    if (!modal || modal.hidden || !modal.classList.contains('is-open')) {
        ensureStudySubjectInsightsModalClosed();
        return;
    }
    if (modal.classList.contains('is-closing')) return;

    var panel = modal.querySelector('.study-subject-insights-modal__panel');
    modal.classList.remove('is-settled');
    modal.classList.add('is-closing');
    document.body.classList.remove('study-subject-insights-open');
    clearStudyInsightsActiveRow();

    var finished = false;
    function finishClose() {
        if (finished) return;
        finished = true;
        ensureStudySubjectInsightsModalClosed();
    }

    if (panel) {
        var onAnimEnd = function (e) {
            if (e.target !== panel || e.animationName !== 'study-insights-modal-out') return;
            panel.removeEventListener('animationend', onAnimEnd);
            finishClose();
        };
        panel.addEventListener('animationend', onAnimEnd);
    }
    setTimeout(finishClose, 320);
}

function openStudySubjectInsightsModal(subjectName, highlightSessionId) {
    if (!currentRoutine || !subjectName) return;
    var modal = document.getElementById('routineStudySubjectInsightsModal');
    if (!modal) return;

    var analytics = getSubjectStudyAnalytics(subjectName, 30);
    var meta = resolveStudySubjectMeta(currentRoutine, analytics.subjectName);
    var chipEl = document.getElementById('studySubjectInsightsSubjectChip');
    var titleEl = document.getElementById('studySubjectInsightsTitle');
    var subtitleEl = document.getElementById('studySubjectInsightsSubtitle');
    var statsEl = document.getElementById('studySubjectInsightsStats');
    var chartEl = document.getElementById('studySubjectInsightsChart');
    var historyEl = document.getElementById('studySubjectInsightsHistory');
    var emptyEl = document.getElementById('studySubjectInsightsEmpty');

    if (chipEl) {
        chipEl.innerHTML = buildStudySessionSubjectCellHtml(currentRoutine, meta.name);
    }
    if (titleEl) titleEl.textContent = 'Produtividade · ' + meta.name;
    if (subtitleEl) subtitleEl.textContent = 'Últimos 30 dias';

    renderStudySubjectInsightsStats(statsEl, analytics.totals);
    renderStudySubjectInsightsChart(chartEl, analytics.dailySeries, meta.color);
    renderStudySubjectInsightsHistory(historyEl, analytics.sessions, highlightSessionId);

    var hasSessions = analytics.sessions && analytics.sessions.length > 0;
    if (historyEl) historyEl.classList.toggle('hidden', !hasSessions);
    if (emptyEl) emptyEl.classList.toggle('hidden', hasSessions);

    modal.classList.remove('is-closing', 'is-settled', 'is-open');
    modal.hidden = false;
    modal.removeAttribute('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('study-subject-insights-open');
    setStudyInsightsActiveRow(highlightSessionId);

    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            modal.classList.add('is-open');
            var panel = modal.querySelector('.study-subject-insights-modal__panel');
            if (panel) {
                var onOpenEnd = function (e) {
                    if (e.target !== panel || e.animationName !== 'study-insights-modal-in') return;
                    panel.removeEventListener('animationend', onOpenEnd);
                    modal.classList.add('is-settled');
                };
                panel.addEventListener('animationend', onOpenEnd);
            } else {
                modal.classList.add('is-settled');
            }
        });
    });

    refreshLucideIcons(modal);
    var closeBtn = document.getElementById('studySubjectInsightsCloseBtn');
    if (closeBtn) closeBtn.focus();
}

function handleStudySessionTableActivate(e) {
    if (e.target.closest('.study-session-row-menu') || e.target.closest('.study-sessions-table__actions')) return;
    var row = e.target.closest('tr.study-sessions-table__row--clickable');
    if (!row) return;
    e.preventDefault();
    var sessionId = row.getAttribute('data-session-id') || '';
    var subject = row.getAttribute('data-subject') || '';
    if (!subject) return;
    openStudySubjectInsightsModal(subject, sessionId);
}

function setupStudySubjectInsightsEvents() {
    if (_studySubjectInsightsEventsBound) return;
    _studySubjectInsightsEventsBound = true;

    ensureStudySubjectInsightsModalClosed();

    var modal = document.getElementById('routineStudySubjectInsightsModal');
    var tbody = document.getElementById('studySessionsTableBody');

    if (modal) {
        modal.addEventListener('click', function (e) {
            if (e.target.closest('#studySubjectInsightsCloseBtn') || e.target.closest('#studySubjectInsightsOverlay')) {
                e.preventDefault();
                closeStudySubjectInsightsModal();
            }
        });
    }

    if (tbody) {
        tbody.addEventListener('click', handleStudySessionTableActivate);
        tbody.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            handleStudySessionTableActivate(e);
        });
    }

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        var insightsModal = document.getElementById('routineStudySubjectInsightsModal');
        if (insightsModal && insightsModal.classList.contains('is-open')) {
            e.preventDefault();
            closeStudySubjectInsightsModal();
        }
    });
}

function setupStudySubjectModalEvents() {
    if (_studySubjectModalEventsBound) return;
    _studySubjectModalEventsBound = true;

    var modal = document.getElementById('routineStudySubjectModal');
    if (!modal) return;

    ensureStudySubjectModalClosed();

    modal.addEventListener('click', function (e) {
        if (e.target.closest('#studySubjectModalCloseBtn') || e.target.closest('#studySubjectPickCancelBtn') || e.target.closest('#studySubjectModalOverlay')) {
            e.preventDefault();
            closeStudySubjectModal();
            return;
        }
        if (e.target.closest('#studySubjectCreateBtn')) {
            e.preventDefault();
            resetStudySubjectCreateForm();
            showStudySubjectModalView('create');
            refreshLucideIcons(modal);
            var nameEl = document.getElementById('studySubjectCreateName');
            if (nameEl) nameEl.focus();
            return;
        }
        if (e.target.closest('#studySubjectCreateBackBtn')) {
            e.preventDefault();
            showStudySubjectModalView('pick');
            return;
        }
        var colorBtn = e.target.closest('.study-subject-color-picker__btn');
        if (colorBtn) {
            e.preventDefault();
            studyUiState.subjectCreateColor = colorBtn.getAttribute('data-color') || studyUiState.subjectCreateColor;
            renderStudySubjectColorPicker();
            return;
        }
        var iconBtn = e.target.closest('.study-subject-icon-picker__btn');
        if (iconBtn) {
            e.preventDefault();
            studyUiState.subjectCreateIcon = iconBtn.getAttribute('data-icon') || studyUiState.subjectCreateIcon;
            renderStudySubjectIconPicker();
            refreshLucideIcons(modal);
            return;
        }
        var pickBtn = e.target.closest('.study-subject-picker__item');
        if (pickBtn) {
            e.preventDefault();
            var subjectId = pickBtn.getAttribute('data-subject-id');
            if (subjectId) selectStudySubjectById(subjectId, { startTimer: studyUiState.subjectModalAutoStart });
        }
    });

    var createForm = document.getElementById('studySubjectCreateForm');
    if (createForm) {
        createForm.addEventListener('submit', function (e) {
            createStudySubjectFromForm(e).catch(function (err) { console.error(err); });
        });
    }
}

function setupStudyFinishModalEvents() {
    if (_studyFinishModalEventsBound) return;
    _studyFinishModalEventsBound = true;

    var modal = document.getElementById('routineStudyFinishModal');
    if (!modal) return;

    ensureStudyFinishModalClosed();

    modal.addEventListener('click', function (e) {
        if (e.target.closest('#studyFinishSaveBtn')) {
            e.preventDefault();
            commitStudySession().catch(function (err) { console.error(err); });
            return;
        }
        if (e.target.closest('#studyFinishDiscardBtn') || e.target.closest('#studyFinishModalCloseBtn')) {
            e.preventDefault();
            requestDiscardStudyFinish();
            return;
        }
        if (e.target.closest('#studyFinishModalOverlay')) {
            requestDiscardStudyFinish();
        }
    });
}

function setupStudyUiShellEvents() {
    if (_studyUiShellEventsBound) return;
    _studyUiShellEventsBound = true;

    setupStudyFinishModalEvents();
    setupStudyConfirmModalEvents();
    setupStudySubjectModalEvents();
    setupStudySubjectInsightsEvents();
    ensureStudyFullscreenClosed();

    var fs = document.getElementById('routineStudyFullscreen');
    if (fs) {
        fs.addEventListener('click', function (e) {
            if (e.target.closest('#studyFullscreenExitBtn')) {
                e.preventDefault();
                closeStudyFullscreen();
                return;
            }
            if (e.target.closest('#studyFullscreenResetBtn')) {
                e.preventDefault();
                resetStudyTimer().catch(function (err) { console.error(err); });
                return;
            }
            if (e.target.closest('#studyFullscreenToggleBtn')) {
                e.preventDefault();
                toggleStudyTimer().catch(function (err) { console.error(err); });
                return;
            }
            if (e.target.closest('#studyFullscreenFinishBtn')) {
                e.preventDefault();
                openStudyFinishModal();
            }
        });
    }

    var section = document.getElementById('routineStudySection');
    if (section) {
        section.addEventListener('click', function (e) {
            if (e.target.closest('#studyTimerResetBtn')) {
                e.preventDefault();
                resetStudyTimer().catch(function (err) { console.error(err); });
                return;
            }
            if (e.target.closest('#studyTimerToggleBtn')) {
                e.preventDefault();
                toggleStudyTimer().catch(function (err) { console.error(err); });
                return;
            }
            if (e.target.closest('#studyTimerFinishBtn')) {
                e.preventDefault();
                openStudyFinishModal();
                return;
            }
            if (e.target.closest('#studyTimerFullscreenBtn')) {
                e.preventDefault();
                openStudyFullscreen();
                return;
            }
            if (e.target.closest('#studyTimerNewSessionBtn')) {
                e.preventDefault();
                beginNewStudySession({ clearDescription: true, clearSubject: true })
                    .catch(function (err) { console.error(err); });
                return;
            }
            if (e.target.closest('#studyTimerSubjectChip')) {
                e.preventDefault();
                if (!isStudyTimerRunning()) openStudySubjectModal({ autoStart: false });
            }
        });
    }

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        var confirmModal = document.getElementById('routineStudyConfirmModal');
        if (confirmModal && confirmModal.classList.contains('is-open')) {
            closeStudyConfirmModal(false);
            return;
        }
        var subjectModal = document.getElementById('routineStudySubjectModal');
        if (subjectModal && subjectModal.classList.contains('is-open')) {
            closeStudySubjectModal();
            return;
        }
        var modal = document.getElementById('routineStudyFinishModal');
        if (modal && modal.classList.contains('is-open')) {
            requestDiscardStudyFinish();
            return;
        }
        var fsEl = document.getElementById('routineStudyFullscreen');
        if (fsEl && fsEl.classList.contains('is-open')) {
            closeStudyFullscreen();
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupStudyUiShellEvents);
} else {
    setupStudyUiShellEvents();
}

function setupStudyTimerEvents() {
    if (_studyTimerEventsBound) return;
    _studyTimerEventsBound = true;
    setupStudyUiShellEvents();

    var filterSubject = document.getElementById('studySessionFilterSubject');
    var filterPeriod = document.getElementById('studySessionFilterPeriod');
    initEcFilterSelects();
    if (filterSubject) filterSubject.addEventListener('ec-filter-change', function () {
        studySessionTableState.page = 1;
        renderStudySessionTable();
    });
    if (filterPeriod) filterPeriod.addEventListener('ec-filter-change', function () {
        studySessionTableState.page = 1;
        renderStudySessionTable();
    });

    var exportBtn = document.getElementById('studySessionExportBtn');
    if (exportBtn) exportBtn.addEventListener('click', exportStudySessionsCsv);

    setupStudySessionRowMenuEvents();
}

// Carregar dados ao iniciar
document.addEventListener('DOMContentLoaded', async () => {
    // Carregar nome do usuário
    const usernameElement = document.getElementById('username');
    const userName = localStorage.getItem('userName') || 'DESENVOLVEDOR';
    usernameElement.textContent = userName.toUpperCase();

    // Obter ID da rotina da URL
    const urlParams = new URLSearchParams(window.location.search);
    const routineId = urlParams.get('id');

    if (!routineId) {
        alert('Rotina não encontrada');
        window.location.href = DASHBOARD_CARDS_URL;
        return;
    }

    // Carregar rotina
    await loadRoutine(routineId);

    // Configurar event listeners
    setupEventListeners();

    window.addEventListener('beforeunload', function () {
        flushStudyAutosaveOnUnload();
    });
    window.addEventListener('pagehide', function () {
        flushStudyAutosaveOnUnload();
    });
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') {
            persistStudyDraftsToStorage();
        }
    });
});

// Configurar event listeners
function setupEventListeners() {
    const backBtn = document.getElementById('routineDetailBackBtn');
    if (backBtn) backBtn.addEventListener('click', navigateToDashboardCards);

    // Botão de adicionar tarefa
    const addTaskBtn = document.getElementById('addTaskBtn');
    if (addTaskBtn) addTaskBtn.addEventListener('click', showAddTaskInput);

    // Botão de editar
    const editBtn = document.getElementById('editBtn');
    editBtn.addEventListener('click', () => {
        window.location.href = `create.html?edit=${currentRoutine.id}`;
    });

    // Botão de deletar (ícone lixo Uiverse)
    const delEl = document.getElementById('deleteBtn');
    if (delEl && typeof trashBinButtonHTML === 'function') {
        delEl.outerHTML = trashBinButtonHTML({
            id: 'deleteBtn',
            className: 'action-btn delete-btn uiverse-trash-btn--routine-header',
            labelText: 'Excluir',
            title: 'Excluir rotina',
            ariaLabel: 'Excluir rotina'
        });
    }
    const deleteBtn = document.getElementById('deleteBtn');
    if (deleteBtn) deleteBtn.addEventListener('click', deleteRoutine);

    // Sem horário fixo: V = tarefa completa, × = tarefa incompleta (hoje)
    const btnComplete = document.getElementById('btnTaskCompleteDetail');
    const btnIncomplete = document.getElementById('btnTaskIncompleteDetail');
    const btnSnooze = document.getElementById('btnTaskSnoozeDetail');
    if (btnComplete) btnComplete.addEventListener('click', markRoutineCompleteToday);
    if (btnIncomplete) btnIncomplete.addEventListener('click', markRoutineIncompleteToday);
    if (btnSnooze) btnSnooze.addEventListener('click', snoozeRoutineCompleteToday);
}

// Marcar rotina como completa hoje (botão V na página de detalhe)
async function markRoutineCompleteToday() {
    if (!currentRoutine) return;
    const today = getLocalDateStr(new Date());
    const wasDoneBefore = isRoutineDayClosedOut(currentRoutine, today);
    if (currentRoutine.tasks && currentRoutine.tasks.length > 0) {
        currentRoutine.tasks.forEach(task => {
            if (!task.completedDates) task.completedDates = [];
            if (!task.completedDates.includes(today)) {
                task.completedDates.push(today);
                task.completedDates.sort();
            }
        });
        currentRoutine.tasks.forEach(t => { t.completed = true; });
    }
    if (!currentRoutine.checkIns) currentRoutine.checkIns = [];
    if (!currentRoutine.checkIns.includes(today)) {
        currentRoutine.checkIns.push(today);
        currentRoutine.checkIns.sort();
    }
    await saveRoutine();

    if (!wasDoneBefore) {
        await onRoutineDayJustCompleted(false);
    } else {
    setRoutineCompleteAnsweredToday(currentRoutine.id);
        renderRoutine();
    hideCompleteQuestionBlock();
    }
    showSaveSuccessMessage();
}

// Marcar rotina como incompleta hoje (botão × na página de detalhe)
async function markRoutineIncompleteToday() {
    if (!currentRoutine) return;
    const today = getLocalDateStr(new Date());
    let needsSave = false;
    if (currentRoutine.tasks) {
        currentRoutine.tasks.forEach(task => {
            if (task.completedDates && task.completedDates.includes(today)) {
                task.completedDates = task.completedDates.filter(d => d !== today);
                task.completed = false;
                needsSave = true;
            }
        });
    }
    if (currentRoutine.checkIns && currentRoutine.checkIns.includes(today)) {
        currentRoutine.checkIns = currentRoutine.checkIns.filter(d => d !== today);
        needsSave = true;
    }
    if (needsSave) await saveRoutine();
    clearRoutineMotivationNotifShown(currentRoutine.id);
    hideRoutineMotivationNotification();
    hideRoutineTaskCompleteSuccess();
    renderRoutine();
    showSaveSuccessMessage();
    setRoutineCompleteAnsweredToday(currentRoutine.id);
    hideCompleteQuestionBlock();
}

// Pergunta "TAREFA COMPLETA?" aparece só uma vez por dia (por rotina)
function getRoutineCompleteAnsweredKey(routineId) {
    const today = getLocalDateStr(new Date());
    return `routineCompleteAnswered_${routineId}_${today}`;
}

function hasRoutineCompleteAnsweredToday(routineId) {
    return !!localStorage.getItem(getRoutineCompleteAnsweredKey(routineId));
}

function setRoutineCompleteAnsweredToday(routineId) {
    localStorage.setItem(getRoutineCompleteAnsweredKey(routineId), '1');
}

function getRoutineSnoozeKey(routineId) {
    var today = getLocalDateStr(new Date());
    return 'routineSnooze_' + routineId + '_' + today;
}

function isRoutineSnoozedToday(routineId) {
    return !!localStorage.getItem(getRoutineSnoozeKey(routineId));
}

function setRoutineSnoozedToday(routineId) {
    localStorage.setItem(getRoutineSnoozeKey(routineId), '1');
}

function snoozeRoutineCompleteToday() {
    if (!currentRoutine) return;
    setRoutineSnoozedToday(currentRoutine.id);
    hideCompleteQuestionBlock();
    syncRoutineDetailPanelLayout();
}

function routineDayOwesCheckInResponse(routine, dateStr) {
    var todayStr = getLocalDateStr(new Date());
    if (dateStr !== todayStr || !routine || !isRoutineDate(dateStr, routine)) return false;
    if (isRoutineDayClosedOut(routine, dateStr)) return false;
    var noFixedTime = !routine.schedule || !routine.schedule.time;
    if (!noFixedTime) return false;
    return !hasRoutineCompleteAnsweredToday(routine.id);
}

function formatRoutineCompleteDate(d) {
    var dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    var monthNames = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    return dayNames[d.getDay()] + ', ' + d.getDate() + ' de ' + monthNames[d.getMonth()];
}

function renderTodayMissionCard() {
    if (!currentRoutine) return;
    var now = new Date();
    var today = getLocalDateStr(now);
    var tasks = currentRoutine.tasks || [];
    var isEstudos = isEstudosRoutine(currentRoutine);
    var scheduledToday = isRoutineDate(today, currentRoutine);

    var dateEl = document.getElementById('routineCompleteDate');
    var nameEl = document.getElementById('routineMissionName');
    var headingEl = document.getElementById('routineCompleteHeading');
    var descEl = document.getElementById('routineCompleteDesc');
    var listEl = document.getElementById('routineMissionTaskList');
    var barEl = document.getElementById('routineMissionProgressBar');
    var fillEl = document.getElementById('routineMissionProgressFill');
    var textEl = document.getElementById('routineMissionProgressText');
    var labelEl = document.getElementById('btnTaskCompleteLabel');
    var hintEl = document.getElementById('btnTaskCompleteHint');
    var completeBtn = document.getElementById('btnTaskCompleteDetail');

    if (dateEl) dateEl.textContent = formatRoutineCompleteDate(now);
    if (nameEl) nameEl.textContent = currentRoutine.title || 'Rotina';

    if (headingEl) {
        headingEl.classList.toggle('hidden', isEstudos);
        if (!isEstudos) {
            var title = (currentRoutine.title || 'esta rotina').trim();
            headingEl.textContent = 'Concluiu ' + title + ' hoje?';
        }
    }
    if (descEl) {
        descEl.classList.toggle('hidden', isEstudos);
        if (!isEstudos) {
            descEl.textContent = tasks.length
                ? 'Confirme se terminou todas as ' + tasks.length + ' tarefa' + (tasks.length === 1 ? '' : 's') + ' planeadas para hoje.'
                : 'Confirme se cumpriu o plano de hoje — registo único por dia.';
        }
    }

    if (labelEl) labelEl.textContent = isEstudos ? 'Concluir estudo' : 'Sim, concluí';
    if (hintEl) hintEl.textContent = isEstudos ? 'Marcar estudo de hoje como feito' : 'Marcar tudo como feito';
    if (completeBtn) {
        completeBtn.setAttribute('aria-label', isEstudos ? 'Concluir estudo de hoje' : 'Sim, concluí a rotina de hoje');
    }

    var activeTasks = scheduledToday ? tasks : [];
    var doneCount = activeTasks.filter(function (t) {
        return t.completedDates && t.completedDates.indexOf(today) !== -1;
    }).length;
    var totalCount = activeTasks.length;
    var pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

    if (listEl) {
        if (!totalCount) {
            listEl.innerHTML = '';
            listEl.hidden = true;
        } else {
            listEl.hidden = false;
            listEl.innerHTML = activeTasks.map(function (t) {
                var done = t.completedDates && t.completedDates.indexOf(today) !== -1;
                return '<li class="routine-mission-task-list__item' + (done ? ' is-done' : '') + '">' +
                    '<span class="routine-mission-task-list__icon" aria-hidden="true">' +
                    (done ? '<i data-lucide="check-circle"></i>' : '<i data-lucide="circle"></i>') +
                    '</span>' +
                    '<span class="routine-mission-task-list__text">' + escapeHtml(t.text || 'Tarefa') + '</span>' +
                    '</li>';
            }).join('');
        }
    }

    if (barEl) {
        barEl.setAttribute('aria-valuenow', String(pct));
        barEl.setAttribute('aria-valuemax', '100');
        barEl.hidden = !totalCount;
    }
    if (fillEl) fillEl.style.width = pct + '%';
    if (textEl) {
        if (!totalCount) {
            textEl.textContent = 'Nenhuma tarefa definida para hoje.';
        } else {
            textEl.textContent = doneCount + ' de ' + totalCount + ' tarefa' + (totalCount === 1 ? '' : 's') +
                ' concluída' + (doneCount === 1 ? '' : 's');
        }
    }

    var lucideLib = typeof lucide !== 'undefined' ? lucide : (typeof Lucide !== 'undefined' ? Lucide : null);
    if (lucideLib && lucideLib.createIcons) lucideLib.createIcons();
}

// Esconder a pergunta "TAREFA COMPLETA?" após o usuário responder (✓ ou ✗), com transição
function hideCompleteQuestionBlock() {
    const block = document.getElementById('routineCompleteBlock');
    if (!block) return;
    block.classList.add('routine-complete-block--hiding');
    setTimeout(() => {
        block.style.display = 'none';
        block.classList.remove('routine-complete-block--hiding');
    }, 350);
}

// Mensagem de sucesso ao salvar (toast estilizado); some ao clicar
function showSaveSuccessMessage() {
    const toast = document.getElementById('saveToast');
    if (!toast) return;
    toast.classList.remove('save-toast--visible', 'save-toast--hiding');
    clearTimeout(toast._hideTimeout);
    requestAnimationFrame(() => {
        toast.classList.add('save-toast--visible');
    });
    toast._hideTimeout = setTimeout(hideSaveSuccessMessage, 2500);
    toast.onclick = hideSaveSuccessMessage;
}

function hideSaveSuccessMessage() {
    const toast = document.getElementById('saveToast');
    if (!toast) return;
    clearTimeout(toast._hideTimeout);
    toast.onclick = null;
    toast.classList.add('save-toast--hiding');
    setTimeout(() => {
        toast.classList.remove('save-toast--visible', 'save-toast--hiding');
    }, 300);
}

// Carregar rotina
async function loadRoutine(routineId) {
    const token = localStorage.getItem('token');
    let routine = null;

    if (token) {
        try {
            const routines = await apiRequest('/routines');
            routine = routines.find(r => r.id === routineId);
            if (routine) routine = mergeRoutineStudyFieldsFromLocal(routine);
        } catch (error) {
            alert('Não foi possível carregar dados do servidor. Tente novamente.');
            window.location.href = DASHBOARD_CARDS_URL;
            return;
        }
    }

    // Modo offline: carregar do localStorage
    if (!routine) {
        const routines = JSON.parse(localStorage.getItem('localRoutines') || '[]');
        routine = routines.find(r => r.id === routineId);
    }

    if (!routine) {
        alert('Rotina não encontrada');
        window.location.href = DASHBOARD_CARDS_URL;
        return;
    }

    currentRoutine = routine;
    normalizeRoutineCategory(currentRoutine);
    normalizeEstudosRoutine(currentRoutine);
    if (reconcileStudyGoalForToday(currentRoutine)) {
        saveRoutine().catch(function () { /* ignore */ });
    }
    renderRoutine();
}

// Compatibilidade: emoji antigo -> fallback Lucide
function getLucideIconName(icon) {
    if (!icon || typeof icon !== 'string') return 'clipboard-list';
    const trimmed = icon.trim();
    if (!trimmed) return 'clipboard-list';
    if (trimmed.length <= 2 || /[^\w-]/.test(trimmed)) return 'clipboard-list';
    return trimmed;
}

var ROUTINE_WEEKDAY_ABBREV = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function getRoutineActiveWeekDayIndices(routine) {
    const s = (routine && routine.schedule) || {};
    const planType = (routine && routine.planType) || 'daily';
    if (planType === 'monthly') {
        if (s.monthlyType === 'weekOfMonth' && s.dayOfWeek != null) {
            const dayIndex = Number(s.dayOfWeek);
            return Number.isFinite(dayIndex) ? [dayIndex] : [];
        }
        return null;
    }
    if (s.weekDays && s.weekDays.length) {
        return s.weekDays.slice().sort(function (a, b) { return a - b; });
    }
    return [0, 1, 2, 3, 4, 5, 6];
}

function formatRoutineWeekDaysText(weekDays) {
    if (!weekDays || weekDays.length === 0 || weekDays.length === 7) return 'Todos os dias';
    var sorted = weekDays.slice().sort(function (a, b) { return a - b; });
    var hasDom = sorted.indexOf(0) !== -1;
    var hasSab = sorted.indexOf(6) !== -1;
    if (sorted.length === 2 && hasDom && hasSab) return 'Final de semana';
    var isConsecutive = sorted.every(function (v, i) {
        return i === 0 || v === sorted[i - 1] + 1;
    });
    if (isConsecutive && sorted.length >= 2) {
        var first = ROUTINE_WEEKDAY_ABBREV[sorted[0]];
        var last = ROUTINE_WEEKDAY_ABBREV[sorted[sorted.length - 1]];
        return first && last ? first + ' a ' + last : sorted.map(function (d) { return ROUTINE_WEEKDAY_ABBREV[d]; }).join(', ');
    }
    if (sorted.length === 1) return ROUTINE_WEEKDAY_ABBREV[sorted[0]] || '—';
    var parts = sorted.map(function (d) { return ROUTINE_WEEKDAY_ABBREV[d]; }).filter(Boolean);
    return parts.length > 1
        ? parts.slice(0, -1).join(', ') + ' e ' + parts[parts.length - 1]
        : parts[0] || '—';
}

function renderRoutineWeekDays(routine) {
    const container = document.getElementById('routineWeekDays');
    const wrap = document.getElementById('routineWeekDaysWrap');
    if (!container) return;

    const active = getRoutineActiveWeekDayIndices(routine);
    if (active === null) {
        if (wrap) wrap.style.display = 'none';
        return;
    }
    if (wrap) wrap.style.display = '';

    const text = formatRoutineWeekDaysText(active);
    container.textContent = text;
}

// Renderizar rotina
function renderRoutine() {
    if (!currentRoutine) return;

    const todayForTasks = getLocalDateStr(new Date());
    if (currentRoutine.tasks) {
        currentRoutine.tasks.forEach(function (t) {
            const d = t.completedDates || [];
            t.completed = d.indexOf(todayForTasks) !== -1;
        });
    }

    // Título e ícone da categoria (Lucide)
    document.getElementById('routineTitle').textContent = currentRoutine.title;
    const iconEl = document.getElementById('routineIcon');
    if (iconEl) {
        const iconName = getLucideIconName(currentRoutine.category?.icon);
        iconEl.innerHTML = '<i data-lucide="' + escapeHtml(iconName) + '"></i>';
        const lucideLib = typeof lucide !== 'undefined' ? lucide : (typeof Lucide !== 'undefined' ? Lucide : null);
        if (lucideLib && lucideLib.createIcons) {
            lucideLib.createIcons();
        }
    }

    // Descrição
    const descriptionEl = document.getElementById('routineDescription');
    if (currentRoutine.description) {
        descriptionEl.textContent = currentRoutine.description;
        descriptionEl.style.display = 'block';
    } else {
        descriptionEl.style.display = 'none';
    }

    // Data e hora
    const dateEl = document.getElementById('routineDate');
    const timeEl = document.getElementById('routineTime');
    
    if (currentRoutine.schedule?.date) {
        const date = new Date(currentRoutine.schedule.date);
        dateEl.textContent = date.toLocaleDateString('pt-BR');
    } else {
        dateEl.textContent = 'Não definida';
    }

    if (currentRoutine.schedule?.time) {
        timeEl.textContent = currentRoutine.schedule.time;
    } else {
        timeEl.textContent = 'Não definido';
    }

    // Tipo de planejamento e repetição (semanal/mensal)
    const planType = currentRoutine.planType || 'daily';
    const planLabels = { daily: 'Dia', weekly: 'Semana', monthly: 'Mensal' };
    let planText = planLabels[planType] || 'Dia';
    const s = currentRoutine.schedule || {};
    if (planType === 'monthly' && s.monthlyType) {
        if (s.monthlyType === 'dayOfMonth' && s.dayOfMonth) {
            planText += ' · Todo dia ' + s.dayOfMonth;
        }
        if (s.monthlyType === 'weekOfMonth' && (s.weekOfMonth != null || s.dayOfWeek != null)) {
            const ord = s.weekOfMonth === 'last' ? 'última' : (s.weekOfMonth + 'ª');
            const dayNames = { 0: 'domingo', 1: 'segunda', 2: 'terça', 3: 'quarta', 4: 'quinta', 5: 'sexta', 6: 'sábado' };
            planText += ' · Toda ' + ord + ' ' + (dayNames[s.dayOfWeek] || '');
        }
    }
    const planTypeEl = document.getElementById('routinePlanType');
    if (planTypeEl) planTypeEl.textContent = planText;

    var categoryEl = document.getElementById('routineCategoryLabel');
    if (categoryEl) {
        normalizeRoutineCategory(currentRoutine);
        var cat = currentRoutine.category;
        categoryEl.textContent = cat && cat.name ? cat.name : 'Não definida';
        if (isEstudosRoutine(currentRoutine)) {
            categoryEl.classList.add('routine-category-label--estudos');
        } else {
            categoryEl.classList.remove('routine-category-label--estudos');
        }
    }

    renderRoutineWeekDays(currentRoutine);

    // Sem horário fixo: mostrar pergunta TAREFA COMPLETA? só em dias selecionados e só uma vez no dia (por rotina)
    const noFixedTime = !currentRoutine.schedule || !currentRoutine.schedule.time;
    const weekDays = currentRoutine.schedule && currentRoutine.schedule.weekDays;
    const todayIsSelected = !weekDays || !weekDays.length || weekDays.indexOf(new Date().getDay()) !== -1;
    const alreadyAnsweredToday = hasRoutineCompleteAnsweredToday(currentRoutine.id);
    const snoozedToday = isRoutineSnoozedToday(currentRoutine.id);
    const completeBlock = document.getElementById('routineCompleteBlock');
    var showComplete = noFixedTime && todayIsSelected && !alreadyAnsweredToday && !snoozedToday;
    if (isEstudosRoutine(currentRoutine)) showComplete = false;
    if (completeBlock) {
        completeBlock.style.display = showComplete ? 'block' : 'none';
        if (showComplete) renderTodayMissionCard();
    }

    // Objetivos e motivos (mostrar só se preenchidos)
    const objectives = (currentRoutine.objectives || '').trim();
    const reasons = (currentRoutine.reasons || '').trim();
    const objectivesSection = document.getElementById('routineObjectivesSection');
    const reasonsSection = document.getElementById('routineReasonsSection');
    const objectivesEl = document.getElementById('routineObjectives');
    const reasonsEl = document.getElementById('routineReasons');
    if (objectivesSection && objectivesEl) {
        objectivesEl.textContent = objectives || '';
        objectivesSection.style.display = objectives ? 'block' : 'none';
    }
    if (reasonsSection && reasonsEl) {
        reasonsEl.textContent = reasons || '';
        reasonsSection.style.display = reasons ? 'block' : 'none';
    }

    // Estudos: cronômetro + histórico antes das stats (não depender da ordem de render)
    renderStudySection();

    // Estatísticas (summary, gráfico e heatmap)
    renderRoutineStats();

    // Tarefas (legado — lista pode não existir no HTML)
    renderTasks();

    syncRoutineDetailPanelLayout();
    syncRoutineDetailPageLayoutClass();
}

// Renderizar tarefas
function renderTasks() {
    const taskList = document.getElementById('taskList');

    disposeStudyIntervals();

    if (!taskList) return;
    if (!currentRoutine.tasks || currentRoutine.tasks.length === 0) {
        taskList.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">Nenhuma tarefa adicionada ainda</p>';
        return;
    }

    taskList.innerHTML = currentRoutine.tasks.map(task => {
        if (isEstudosRoutine(currentRoutine)) {
            ensureStudyTime(task);
        }
        const dates = task.completedDates || [];
        const datesFormatted = dates.map(d => {
            const date = new Date(d + 'T12:00:00');
            return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
        }).slice(-5).reverse();
        const datesHtml = datesFormatted.length > 0
            ? `<div class="task-completed-dates" title="Datas de conclusão: ${datesFormatted.join(', ')}">📅 ${datesFormatted.join(', ')}</div>`
            : '';
        const today = getLocalDateStr(new Date());
        const awaitingHintHtml = shouldShowTaskAwaitingConfirmHint(currentRoutine, task, today)
            ? '<div class="task-awaiting-confirm-hint" role="status">Pendente: confirme se cumpriu a rotina hoje (responda ao lembrete ou marque esta tarefa).</div>'
            : '';

        return `
        <div class="task-item ${task.completed ? 'completed' : ''}" data-task-id="${escapeHtml(String(task.id))}">
            <div class="task-item-row">
                <div class="task-checkbox ${task.completed ? 'checked' : ''}" data-task-id="${escapeHtml(String(task.id))}" role="checkbox" aria-checked="${task.completed ? 'true' : 'false'}"></div>
                <div class="task-content">
                    <span class="task-text">${escapeHtml(task.text)}</span>
                    ${awaitingHintHtml}
                    ${datesHtml}
                </div>
                ${typeof trashBinButtonHTML === 'function' ? trashBinButtonHTML({ className: 'task-delete delete', modifier: 'uiverse-trash-btn--task', dataAttrs: { 'data-task-id': String(task.id) }, ariaLabel: 'Excluir tarefa', title: 'Excluir tarefa' }) : `<button type="button" class="task-delete" data-task-id="${escapeHtml(String(task.id))}" aria-label="Excluir tarefa">×</button>`}
            </div>
        </div>
        `;
    }).join('');

    const lucideLib = typeof lucide !== 'undefined' ? lucide : (typeof Lucide !== 'undefined' ? Lucide : null);
    if (lucideLib && lucideLib.createIcons) {
        lucideLib.createIcons();
    }

    document.querySelectorAll('.task-checkbox').forEach(checkbox => {
        checkbox.addEventListener('click', (e) => {
            const taskId = e.target.dataset.taskId;
            toggleTask(taskId);
        });
    });

    document.querySelectorAll('.task-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const el = e.currentTarget;
            const taskId = el && el.dataset ? el.dataset.taskId : null;
            if (taskId) deleteTask(taskId);
        });
    });
}

// Calcular progresso (% tarefas com completed; sem tarefas = 100% se hoje está em checkIns — ex.: "Tarefa completa?")
function calculateProgress(routine) {
    const today = getLocalDateStr(new Date());
    if (!routine.tasks || routine.tasks.length === 0) {
        if (routine.checkIns && routine.checkIns.includes(today)) {
            return 100;
        }
        return 0;
    }
    const completedTasks = routine.tasks.filter(t => t.completed).length;
    return Math.round((completedTasks / routine.tasks.length) * 100);
}

// Mostrar input para adicionar tarefa
function showAddTaskInput() {
    const taskList = document.getElementById('taskList');
    if (!taskList) return;
    const inputHTML = `
        <div class="task-input-container" id="taskInputContainer">
            <input type="text" class="task-input" id="newTaskInput" placeholder="Digite a tarefa...">
            <button class="task-input-btn" id="saveTaskBtn">Salvar</button>
            <button class="task-input-btn cancel" id="cancelTaskBtn">Cancelar</button>
        </div>
    `;
    taskList.insertAdjacentHTML('beforeend', inputHTML);

    const input = document.getElementById('newTaskInput');
    input.focus();

    document.getElementById('saveTaskBtn').addEventListener('click', saveNewTask);
    document.getElementById('cancelTaskBtn').addEventListener('click', () => {
        document.getElementById('taskInputContainer').remove();
    });

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveNewTask();
        }
    });
}

// Salvar nova tarefa
async function saveNewTask() {
    const input = document.getElementById('newTaskInput');
    const text = input.value.trim();

    if (!text) {
        alert('Por favor, digite uma tarefa');
        return;
    }

    const newTask = {
        id: Date.now().toString(),
        text: text,
        completed: false,
        completedDates: [],
        createdAt: new Date().toISOString()
    };
    if (isEstudosRoutine(currentRoutine)) {
        newTask.studyTime = { totalSeconds: 0, sessions: [] };
    }

    if (!currentRoutine.tasks) {
        currentRoutine.tasks = [];
    }
    currentRoutine.tasks.push(newTask);

    await saveRoutine();
    renderRoutine();
}

// Alternar tarefa (marcar/desmarcar)
async function toggleTask(taskId) {
    const task = currentRoutine.tasks.find(t => t.id === taskId);
    if (task) {
        const today = getLocalDateStr(new Date());
        const wasDoneBefore = isRoutineDayClosedOut(currentRoutine, today);
        
        if (!task.completedDates) {
            task.completedDates = [];
        }
        
        task.completed = !task.completed;
        
        if (task.completed) {
            if (!task.completedDates.includes(today)) {
                task.completedDates.push(today);
                task.completedDates.sort();
            }
        } else {
            task.completedDates = task.completedDates.filter(d => d !== today);
        }
        
        await saveRoutine();
        
        await checkAndMarkCheckIn();

        const justCompleted = !wasDoneBefore && isRoutineDayClosedOut(currentRoutine, today);
        if (justCompleted) {
            await onRoutineDayJustCompleted(false);
        } else {
            if (!isRoutineDayClosedOut(currentRoutine, today)) {
                clearRoutineMotivationNotifShown(currentRoutine.id);
                hideRoutineMotivationNotification();
            }
        renderRoutine();
        }
    }
}

// Verificar e marcar check-in se todas as tarefas estiverem completas
async function checkAndMarkCheckIn() {
    if (!currentRoutine.tasks || currentRoutine.tasks.length === 0) {
        return;
    }
    
    const allCompleted = currentRoutine.tasks.every(t => t.completed);
    if (allCompleted) {
        const today = getLocalDateStr(new Date());
        let needsSave = false;
        
        // Garantir que todas as tarefas tenham hoje em completedDates
        currentRoutine.tasks.forEach(task => {
            if (!task.completedDates) task.completedDates = [];
            if (!task.completedDates.includes(today)) {
                task.completedDates.push(today);
                task.completedDates.sort();
                needsSave = true;
            }
        });
        
        // Manter checkIns da rotina para compatibilidade (heatmap usa task.completedDates)
        if (!currentRoutine.checkIns) {
            currentRoutine.checkIns = [];
        }
        if (!currentRoutine.checkIns.includes(today)) {
            currentRoutine.checkIns.push(today);
            currentRoutine.checkIns.sort();
            needsSave = true;
        }
        
        if (needsSave) {
            const token = localStorage.getItem('token');
            if (token) {
                try {
                    await apiRequest(`/routines/${currentRoutine.id}/checkin`, {
                        method: 'POST',
                        body: JSON.stringify({ date: today })
                    });
                } catch (error) {
                    console.log('Erro ao salvar check-in no servidor, salvando localmente');
                }
            }
            await saveRoutine();
        }
    }
}

// Deletar tarefa
async function deleteTask(taskId) {
    if (!confirm('Tem certeza que deseja excluir esta tarefa?')) {
        return;
    }

    currentRoutine.tasks = currentRoutine.tasks.filter(t => String(t.id) !== String(taskId));
    await saveRoutine();
    renderRoutine();
}

/** Espelha a rotina atual no localStorage para outras abas/dashboard atualizarem. */
function syncCurrentRoutineToLocalRoutines() {
    if (localStorage.getItem('token')) return;
    try {
        let routines = JSON.parse(localStorage.getItem('localRoutines') || '[]');
        const index = routines.findIndex(r => r.id === currentRoutine.id);
        if (index !== -1) {
            routines[index] = currentRoutine;
        } else {
            routines.push(currentRoutine);
        }
        localStorage.setItem('localRoutines', JSON.stringify(routines));
    } catch (e) {
        console.warn('syncCurrentRoutineToLocalRoutines', e);
    }
}

/** Avisa dashboard/outras abas para recarregarem rotinas (storage + BroadcastChannel). */
function notifyRoutinesUpdatedGlobally() {
    try {
        var ch = new BroadcastChannel('ec-routine-sync');
        ch.postMessage({ type: 'routines-updated' });
        ch.close();
    } catch (e) { /* ignore */ }
}

function mirrorRoutineToLocalStorage(routine) {
    if (!routine || !routine.id) return;
    try {
        var routines = JSON.parse(localStorage.getItem('localRoutines') || '[]');
        var index = routines.findIndex(function (r) { return String(r.id) === String(routine.id); });
        if (index !== -1) {
            routines[index] = routine;
        } else {
            routines.push(routine);
        }
        localStorage.setItem('localRoutines', JSON.stringify(routines));
    } catch (e) { /* ignore */ }
}

// Salvar rotina
async function saveRoutine(options) {
    options = options || {};
    if (currentRoutine && isEstudosRoutine(currentRoutine)) {
        normalizeEstudosRoutine(currentRoutine);
        if (!Array.isArray(currentRoutine.studySubjects)) currentRoutine.studySubjects = [];
    }
    // Recalcular progresso
    currentRoutine.progress = calculateProgress(currentRoutine);
    
    // Garantir que checkIns existe
    if (!currentRoutine.checkIns) {
        currentRoutine.checkIns = [];
    }

    const token = localStorage.getItem('token');

    if (token) {
        try {
            await apiRequest(`/routines/${currentRoutine.id}`, {
                method: 'PUT',
                body: JSON.stringify(currentRoutine)
            });
            mirrorRoutineToLocalStorage(currentRoutine);
            notifyRoutinesUpdatedGlobally();
            return true;
        } catch (error) {
            if (!options.silent) {
                alert('Não foi possível salvar no servidor. Verifique sua conexão e tente novamente.');
                return false;
            }
            // Autosave: espelha no local e trata como sucesso para não perder a sessão
            mirrorRoutineToLocalStorage(currentRoutine);
            notifyRoutinesUpdatedGlobally();
            return true;
        }
    }

    // Salvar no localStorage
    let routines = JSON.parse(localStorage.getItem('localRoutines') || '[]');
    const index = routines.findIndex(r => r.id === currentRoutine.id);
    if (index !== -1) {
        routines[index] = currentRoutine;
    } else {
        routines.push(currentRoutine);
    }
    localStorage.setItem('localRoutines', JSON.stringify(routines));
    notifyRoutinesUpdatedGlobally();
    return true;
}

// Deletar rotina
async function deleteRoutine() {
    if (!confirm('Tem certeza que deseja excluir esta rotina? Todas as tarefas serão perdidas.')) {
        return;
    }

    const token = localStorage.getItem('token');

    if (token) {
        try {
            await apiRequest(`/routines/${currentRoutine.id}`, {
                method: 'DELETE'
            });
            notifyRoutinesUpdatedGlobally();
            window.location.href = DASHBOARD_CARDS_URL;
            return;
        } catch (error) {
            alert('Não foi possível excluir no servidor. Tente novamente.');
            return;
        }
    }

    // Remover do localStorage
    let routines = JSON.parse(localStorage.getItem('localRoutines') || '[]');
    routines = routines.filter(r => r.id !== currentRoutine.id);
    localStorage.setItem('localRoutines', JSON.stringify(routines));

    window.location.href = DASHBOARD_CARDS_URL;
}

// Função para fazer requisições à API
async function apiRequest(endpoint, options = {}) {
    try {
        const token = localStorage.getItem('token');
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...options.headers
        };

        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers
        });

        let data;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            const text = await response.text();
            throw new Error(text || 'Erro na requisição');
        }

        if (!response.ok) {
            throw new Error(data.error || 'Erro na requisição');
        }

        return data;
    } catch (error) {
        console.error('Erro na requisição:', error);
        throw error;
    }
}

// Função auxiliar para escapar HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
