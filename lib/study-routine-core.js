/**
 * Lógica pura do módulo Estudos (metas, sessões, stats, heatmap).
 * Depende de getLocalDateStr / normalizeDateStr / isRoutineDate do host quando disponível.
 */
(function (global) {
    'use strict';

    function normalizeDateStr(isoOrStr) {
        if (!isoOrStr) return '';
        var s = String(isoOrStr);
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        try {
            var d = new Date(s);
            if (isNaN(d.getTime())) return '';
            var y = d.getFullYear();
            var m = String(d.getMonth() + 1).padStart(2, '0');
            var day = String(d.getDate()).padStart(2, '0');
            return y + '-' + m + '-' + day;
        } catch (e) {
            return '';
        }
    }

    function normalizeStudyGoal(goal) {
        if (!goal || typeof goal !== 'object') return null;
        var type = goal.type === 'sessions' ? 'sessions' : (goal.type === 'time' ? 'time' : null);
        var target = parseInt(goal.target, 10);
        if (!type || isNaN(target) || target <= 0) return null;
        return { type: type, target: target };
    }

    function migrateStudySessionRecord(session, task) {
        if (!session || typeof session !== 'object') return null;
        var endedAt = session.endedAt || new Date().toISOString();
        var durationSeconds = Math.max(0, Math.floor(session.durationSeconds || 0));
        var endedDate = new Date(endedAt);
        var startedAt = session.startedAt;
        if (!startedAt && durationSeconds > 0 && !isNaN(endedDate.getTime())) {
            startedAt = new Date(endedDate.getTime() - durationSeconds * 1000).toISOString();
        }
        if (!startedAt) startedAt = endedAt;
        var dateStr = session.date || normalizeDateStr(endedAt);
        var status = 'completed';
        if (session.status === 'pending') status = 'pending';
        else if (session.status === 'deleted') status = 'deleted';
        var rec = {
            id: session.id || ('sess-' + String(endedAt) + '-' + Math.random().toString(36).slice(2, 8)),
            date: dateStr,
            taskId: session.taskId || (task && task.id) || '',
            subject: session.subject || (task && task.text) || 'Estudo',
            description: session.description || '',
            startedAt: startedAt,
            endedAt: endedAt,
            durationSeconds: durationSeconds,
            createdAt: session.createdAt || endedAt,
            status: status
        };
        if (session.deletedAt) rec.deletedAt = session.deletedAt;
        return rec;
    }

    function flattenLegacyTaskSessions(routine) {
        if (!routine || !Array.isArray(routine.tasks)) return;
        if (!Array.isArray(routine.studySessions)) routine.studySessions = [];
        var ids = new Set(routine.studySessions.map(function (s) { return s.id; }));
        routine.tasks.forEach(function (task) {
            var st = task.studyTime;
            if (!st || !Array.isArray(st.sessions)) return;
            st.sessions.forEach(function (s) {
                var rec = migrateStudySessionRecord(s, task);
                if (!rec || ids.has(rec.id)) return;
                ids.add(rec.id);
                routine.studySessions.push(rec);
            });
        });
    }

    function normalizeEstudosRoutineData(routine) {
        if (!routine) return;
        if (!Array.isArray(routine.studySessions)) routine.studySessions = [];
        flattenLegacyTaskSessions(routine);
        routine.studySessions = routine.studySessions.map(function (s) {
            return migrateStudySessionRecord(s, null);
        }).filter(Boolean);
        routine.studyGoal = normalizeStudyGoal(routine.studyGoal);
        normalizeStudySubjectsData(routine);
    }

    var STUDY_SUBJECT_PALETTE = [
        '#22c55e', '#3b82f6', '#a855f7', '#f59e0b',
        '#ef4444', '#06b6d4', '#ec4899', '#84cc16'
    ];

    var STUDY_SUBJECT_ICONS = [
        'book-open', 'calculator', 'flask-conical', 'code',
        'languages', 'music', 'palette', 'brain'
    ];

    function normalizeStudySubjectRecord(subject, index) {
        if (!subject || typeof subject !== 'object') return null;
        var name = String(subject.name || '').trim();
        if (!name) return null;
        var color = String(subject.color || '').trim();
        if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
            color = STUDY_SUBJECT_PALETTE[(index || 0) % STUDY_SUBJECT_PALETTE.length];
        }
        var icon = String(subject.icon || 'book-open').trim() || 'book-open';
        if (STUDY_SUBJECT_ICONS.indexOf(icon) === -1) icon = 'book-open';
        return {
            id: subject.id || ('subj-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)),
            name: name.slice(0, 120),
            color: color,
            icon: icon,
            notes: String(subject.notes || '').trim().slice(0, 300),
            createdAt: subject.createdAt || new Date().toISOString()
        };
    }

    function migrateStudySubjectsFromSessions(routine) {
        if (!routine) return;
        var names = [];
        (routine.studySessions || []).forEach(function (s) {
            if (!s || s.status !== 'completed') return;
            var n = (s.subject || '').trim();
            if (n && names.indexOf(n) === -1) names.push(n);
        });
        (routine.tasks || []).forEach(function (t) {
            var n = (t.text || '').trim();
            if (n && names.indexOf(n) === -1) names.push(n);
        });
        routine.studySubjects = names.map(function (name, index) {
            return normalizeStudySubjectRecord({
                id: 'subj-mig-' + index + '-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24),
                name: name,
                color: STUDY_SUBJECT_PALETTE[index % STUDY_SUBJECT_PALETTE.length],
                icon: STUDY_SUBJECT_ICONS[index % STUDY_SUBJECT_ICONS.length]
            }, index);
        }).filter(Boolean);
    }

    function normalizeStudySubjectsData(routine) {
        if (!routine) return;
        if (!Array.isArray(routine.studySubjects)) routine.studySubjects = [];
        routine.studySubjects = routine.studySubjects.map(function (s, index) {
            return normalizeStudySubjectRecord(s, index);
        }).filter(Boolean);
        if (routine.studySubjects.length === 0) {
            migrateStudySubjectsFromSessions(routine);
        }
    }

    function getStudySubjects(routine) {
        normalizeStudySubjectsData(routine);
        return routine.studySubjects || [];
    }

    function upsertStudySubject(routine, input) {
        if (!routine || !input) return null;
        normalizeStudySubjectsData(routine);
        var name = String(input.name || '').trim();
        if (!name) return null;
        var subjectId = input.id ? String(input.id).trim() : '';
        var existing = null;
        if (subjectId) {
            existing = routine.studySubjects.find(function (s) {
                return String(s.id) === subjectId;
            }) || null;
        }
        if (!existing) {
            var lower = name.toLowerCase();
            existing = routine.studySubjects.find(function (s) {
                return String(s.name || '').trim().toLowerCase() === lower;
            }) || null;
        }
        if (existing) {
            if (input.color && /^#[0-9a-fA-F]{6}$/.test(String(input.color))) {
                existing.color = String(input.color);
            }
            if (input.icon && STUDY_SUBJECT_ICONS.indexOf(String(input.icon)) !== -1) {
                existing.icon = String(input.icon);
            }
            if (input.notes !== undefined) {
                existing.notes = String(input.notes || '').trim().slice(0, 300);
            }
            return existing;
        }
        var record = normalizeStudySubjectRecord({
            id: subjectId || undefined,
            name: name,
            color: input.color,
            icon: input.icon,
            notes: input.notes || ''
        }, routine.studySubjects.length);
        if (!record) return null;
        routine.studySubjects.push(record);
        return record;
    }

    function mergeStudySubjectsList(serverList, localList) {
        var merged = [];
        var seenIds = {};
        var seenNames = {};
        function pushSubject(subject) {
            if (!subject || typeof subject !== 'object') return;
            var normalized = normalizeStudySubjectRecord(subject, merged.length);
            if (!normalized) return;
            var idKey = String(normalized.id || '');
            var nameKey = normalized.name.toLowerCase();
            if (idKey && seenIds[idKey]) return;
            if (seenNames[nameKey]) return;
            if (idKey) seenIds[idKey] = true;
            seenNames[nameKey] = true;
            merged.push(normalized);
        }
        (serverList || []).forEach(pushSubject);
        (localList || []).forEach(pushSubject);
        return merged;
    }

    function getCompletedStudySessions(routine) {
        normalizeEstudosRoutineData(routine);
        return (routine.studySessions || []).filter(function (s) {
            return s.status === 'completed';
        });
    }

    function getDeletedStudySessions(routine) {
        normalizeEstudosRoutineData(routine);
        return (routine.studySessions || []).filter(function (s) {
            return s.status === 'deleted';
        });
    }

    function getVisibleStudySessions(routine, includeDeleted) {
        normalizeEstudosRoutineData(routine);
        return (routine.studySessions || []).filter(function (s) {
            if (includeDeleted) return s.status === 'deleted';
            return s.status !== 'deleted';
        });
    }

    function getSessionsOnDate(routine, dateStr) {
        return getCompletedStudySessions(routine).filter(function (s) {
            return normalizeDateStr(s.endedAt) === dateStr || s.date === dateStr;
        });
    }

    function getStudyDayProgress(routine, dateStr) {
        var sessions = getSessionsOnDate(routine, dateStr);
        var totalSeconds = sessions.reduce(function (acc, s) {
            return acc + Math.max(0, Math.floor(s.durationSeconds || 0));
        }, 0);
        return {
            sessionCount: sessions.length,
            totalSeconds: totalSeconds,
            totalMinutes: totalSeconds > 0 ? Math.max(1, Math.ceil(totalSeconds / 60)) : 0
        };
    }

    function isStudyGoalMet(routine, dateStr, isRoutineDateFn) {
        var goal = routine && normalizeStudyGoal(routine.studyGoal);
        if (!goal) return false;
        if (typeof isRoutineDateFn === 'function' && !isRoutineDateFn(dateStr, routine)) {
            return false;
        }
        var progress = getStudyDayProgress(routine, dateStr);
        if (goal.type === 'time') {
            return progress.totalMinutes >= goal.target;
        }
        return progress.sessionCount >= goal.target;
    }

    function getStudyMinutesOnDate(routine, dateStr) {
        return getStudyDayProgress(routine, dateStr).totalMinutes;
    }

    function getStudyHeatmapTier(minutes) {
        if (!minutes || minutes <= 0) return 0;
        if (minutes <= 30) return 1;
        if (minutes <= 60) return 2;
        if (minutes <= 120) return 3;
        return 4;
    }

    function getStudyHeatmapData(routine, daysCount, isRoutineDateFn, isRecordedFn) {
        daysCount = daysCount || 30;
        var data = [];
        var now = new Date();
        var todayStr = typeof global.getLocalDateStr === 'function'
            ? global.getLocalDateStr(now)
            : normalizeDateStr(now.toISOString());
        for (var i = daysCount - 1; i >= 0; i--) {
            var d = new Date(now);
            d.setDate(d.getDate() - i);
            var dateStr = typeof global.getLocalDateStr === 'function'
                ? global.getLocalDateStr(d)
                : normalizeDateStr(d.toISOString());
            var scheduled = typeof isRoutineDateFn === 'function'
                ? isRoutineDateFn(dateStr, routine)
                : true;
            var minutes = getStudyMinutesOnDate(routine, dateStr);
            var recorded = typeof isRecordedFn === 'function'
                ? isRecordedFn(dateStr, routine)
                : false;
            var tier = scheduled ? getStudyHeatmapTier(minutes) : -1;
            if (scheduled && tier === 0 && recorded) tier = 1;
            data.push({
                dateStr: dateStr,
                scheduled: scheduled,
                minutes: minutes,
                tier: tier,
                recorded: recorded,
                goalMet: isStudyGoalMet(routine, dateStr, isRoutineDateFn),
                isToday: dateStr === todayStr
            });
        }
        return data;
    }

    function computeStudyDayStreaks(routine, isRoutineDateFn) {
        var studiedDates = {};
        getCompletedStudySessions(routine).forEach(function (s) {
            var d = normalizeDateStr(s.endedAt) || s.date;
            if (d) studiedDates[d] = true;
        });
        var dates = Object.keys(studiedDates).sort();
        var best = 0;
        var current = 0;
        var run = 0;
        var prev = null;
        dates.forEach(function (d) {
            if (prev) {
                var p = new Date(prev + 'T12:00:00');
                var c = new Date(d + 'T12:00:00');
                var diff = Math.round((c - p) / 86400000);
                run = diff === 1 ? run + 1 : 1;
            } else {
                run = 1;
            }
            if (run > best) best = run;
            prev = d;
        });
        var todayStr = typeof global.getLocalDateStr === 'function'
            ? global.getLocalDateStr(new Date())
            : normalizeDateStr(new Date().toISOString());
        if (studiedDates[todayStr]) {
            current = 1;
            var check = new Date(todayStr + 'T12:00:00');
            while (true) {
                check.setDate(check.getDate() - 1);
                var cs = typeof global.getLocalDateStr === 'function'
                    ? global.getLocalDateStr(check)
                    : normalizeDateStr(check.toISOString());
                if (studiedDates[cs]) current++;
                else break;
            }
        } else {
            var y = new Date(todayStr + 'T12:00:00');
            y.setDate(y.getDate() - 1);
            var ys = typeof global.getLocalDateStr === 'function'
                ? global.getLocalDateStr(y)
                : normalizeDateStr(y.toISOString());
            if (studiedDates[ys]) {
                current = 1;
                var check2 = new Date(ys + 'T12:00:00');
                while (true) {
                    check2.setDate(check2.getDate() - 1);
                    var cs2 = typeof global.getLocalDateStr === 'function'
                        ? global.getLocalDateStr(check2)
                        : normalizeDateStr(check2.toISOString());
                    if (studiedDates[cs2]) current++;
                    else break;
                }
            }
        }
        return {
            daysStudied: dates.length,
            bestStudyStreak: best,
            currentStudyStreak: current
        };
    }

    function computeGoalStats(routine, isRoutineDateFn, daysBack) {
        daysBack = daysBack || 30;
        var goal = normalizeStudyGoal(routine && routine.studyGoal);
        if (!goal) {
            return { daysGoalMet: 0, scheduledWithGoal: 0, goalCompletionPct: null };
        }
        var now = new Date();
        var met = 0;
        var scheduled = 0;
        for (var i = 0; i < daysBack; i++) {
            var d = new Date(now);
            d.setDate(d.getDate() - i);
            var dateStr = typeof global.getLocalDateStr === 'function'
                ? global.getLocalDateStr(d)
                : normalizeDateStr(d.toISOString());
            if (typeof isRoutineDateFn === 'function' && !isRoutineDateFn(dateStr, routine)) continue;
            scheduled++;
            if (isStudyGoalMet(routine, dateStr, isRoutineDateFn)) met++;
        }
        return {
            daysGoalMet: met,
            scheduledWithGoal: scheduled,
            goalCompletionPct: scheduled > 0 ? Math.round((met / scheduled) * 100) : null
        };
    }

    function buildStudyStats(routine, isRoutineDateFn) {
        var sessions = getCompletedStudySessions(routine);
        var now = new Date();
        var todayStr = typeof global.getLocalDateStr === 'function'
            ? global.getLocalDateStr(now)
            : normalizeDateStr(now.toISOString());
        var weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - 6);
        weekStart.setHours(0, 0, 0, 0);
        var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        var todaySec = 0;
        var weekSec = 0;
        var monthSec = 0;
        var totalSec = 0;
        var maxSession = 0;
        var subjectTotals = {};
        var hourBuckets = new Array(24).fill(0);

        sessions.forEach(function (s) {
            var dur = Math.max(0, Math.floor(s.durationSeconds || 0));
            totalSec += dur;
            if (dur > maxSession) maxSession = dur;
            var ended = new Date(s.endedAt);
            var started = new Date(s.startedAt);
            if (!isNaN(ended.getTime())) {
                if (normalizeDateStr(s.endedAt) === todayStr) todaySec += dur;
                if (ended >= monthStart) monthSec += dur;
                if (ended >= weekStart) weekSec += dur;
            }
            if (!isNaN(started.getTime())) {
                hourBuckets[started.getHours()] += dur;
            }
            var subj = (s.subject || '—').trim() || '—';
            subjectTotals[subj] = (subjectTotals[subj] || 0) + dur;
        });

        var topSubject = '—';
        var topSubjectSec = 0;
        Object.keys(subjectTotals).forEach(function (k) {
            if (subjectTotals[k] > topSubjectSec) {
                topSubjectSec = subjectTotals[k];
                topSubject = k;
            }
        });

        var peakHour = 0;
        var peakHourSec = 0;
        hourBuckets.forEach(function (sec, h) {
            if (sec > peakHourSec) {
                peakHourSec = sec;
                peakHour = h;
            }
        });

        var streaks = computeStudyDayStreaks(routine, isRoutineDateFn);
        var goalStats = computeGoalStats(routine, isRoutineDateFn, 30);
        var todayProgress = getStudyDayProgress(routine, todayStr);
        var goal = normalizeStudyGoal(routine.studyGoal);

        return {
            todaySec: todaySec,
            weekSec: weekSec,
            monthSec: monthSec,
            totalSec: totalSec,
            count: sessions.length,
            avgSec: sessions.length ? Math.round(totalSec / sessions.length) : 0,
            maxSession: maxSession,
            topSubject: topSubject,
            peakHour: peakHour,
            daysStudied: streaks.daysStudied,
            bestStudyStreak: streaks.bestStudyStreak,
            currentStudyStreak: streaks.currentStudyStreak,
            daysGoalMet: goalStats.daysGoalMet,
            goalCompletionPct: goalStats.goalCompletionPct,
            todaySessionCount: todayProgress.sessionCount,
            todayMinutes: todayProgress.totalMinutes,
            studyGoal: goal,
            todayGoalMet: isStudyGoalMet(routine, todayStr, isRoutineDateFn)
        };
    }

    function formatStudyGoalLabel(goal) {
        goal = normalizeStudyGoal(goal);
        if (!goal) return 'Sem meta';
        if (goal.type === 'time') {
            if (goal.target >= 60 && goal.target % 60 === 0) {
                var h = goal.target / 60;
                return h + ' h/dia';
            }
            return goal.target + ' min/dia';
        }
        return goal.target + ' sessão' + (goal.target === 1 ? '' : 'ões') + '/dia';
    }

    function normalizeSubjectName(name) {
        return String(name || '').trim();
    }

    function subjectNamesMatch(a, b) {
        var na = normalizeSubjectName(a).toLowerCase();
        var nb = normalizeSubjectName(b).toLowerCase();
        if (!na || !nb) return false;
        return na === nb;
    }

    function getSessionsForSubject(routine, subjectName) {
        var target = normalizeSubjectName(subjectName);
        if (!target) return [];
        return getCompletedStudySessions(routine).filter(function (s) {
            return subjectNamesMatch(s.subject, target);
        }).sort(function (a, b) {
            return new Date(b.endedAt) - new Date(a.endedAt);
        });
    }

    function buildSubjectStudyAnalytics(routine, subjectName, daysCount) {
        daysCount = daysCount || 30;
        var normalizedName = normalizeSubjectName(subjectName) || '—';
        var sessions = getSessionsForSubject(routine, normalizedName);
        var now = new Date();
        var todayStr = typeof global.getLocalDateStr === 'function'
            ? global.getLocalDateStr(now)
            : normalizeDateStr(now.toISOString());

        var dailyMap = {};
        var i;
        for (i = daysCount - 1; i >= 0; i--) {
            var d = new Date(now);
            d.setDate(d.getDate() - i);
            var dateStr = typeof global.getLocalDateStr === 'function'
                ? global.getLocalDateStr(d)
                : normalizeDateStr(d.toISOString());
            dailyMap[dateStr] = { dateStr: dateStr, minutes: 0, sessionCount: 0, seconds: 0 };
        }

        var totalSeconds = 0;
        var activeDaysSet = {};
        var lastSessionAt = null;

        sessions.forEach(function (s) {
            var dur = Math.max(0, Math.floor(s.durationSeconds || 0));
            totalSeconds += dur;
            var ended = s.endedAt || s.startedAt;
            var dateStr = normalizeDateStr(ended) || s.date || '';
            if (dateStr) {
                activeDaysSet[dateStr] = true;
                if (dailyMap[dateStr]) {
                    dailyMap[dateStr].seconds += dur;
                    dailyMap[dateStr].sessionCount += 1;
                }
            }
            if (ended && (!lastSessionAt || new Date(ended) > new Date(lastSessionAt))) {
                lastSessionAt = ended;
            }
        });

        var dailySeries = Object.keys(dailyMap).sort().map(function (key) {
            var row = dailyMap[key];
            row.minutes = row.seconds > 0 ? Math.max(1, Math.ceil(row.seconds / 60)) : 0;
            return row;
        });

        return {
            subjectName: normalizedName,
            dailySeries: dailySeries,
            sessions: sessions,
            totals: {
                totalSeconds: totalSeconds,
                sessionCount: sessions.length,
                avgSeconds: sessions.length ? Math.round(totalSeconds / sessions.length) : 0,
                activeDays: Object.keys(activeDaysSet).length,
                lastSessionAt: lastSessionAt
            },
            daysCount: daysCount,
            todayStr: todayStr
        };
    }

    global.StudyRoutineCore = {
        normalizeStudyGoal: normalizeStudyGoal,
        normalizeEstudosRoutineData: normalizeEstudosRoutineData,
        migrateStudySessionRecord: migrateStudySessionRecord,
        getCompletedStudySessions: getCompletedStudySessions,
        getDeletedStudySessions: getDeletedStudySessions,
        getVisibleStudySessions: getVisibleStudySessions,
        getSessionsOnDate: getSessionsOnDate,
        getStudyDayProgress: getStudyDayProgress,
        isStudyGoalMet: isStudyGoalMet,
        getStudyHeatmapTier: getStudyHeatmapTier,
        getStudyHeatmapData: getStudyHeatmapData,
        buildStudyStats: buildStudyStats,
        formatStudyGoalLabel: formatStudyGoalLabel,
        normalizeDateStr: normalizeDateStr,
        STUDY_SUBJECT_PALETTE: STUDY_SUBJECT_PALETTE,
        STUDY_SUBJECT_ICONS: STUDY_SUBJECT_ICONS,
        normalizeStudySubjectRecord: normalizeStudySubjectRecord,
        normalizeStudySubjectsData: normalizeStudySubjectsData,
        getStudySubjects: getStudySubjects,
        upsertStudySubject: upsertStudySubject,
        mergeStudySubjectsList: mergeStudySubjectsList,
        getSessionsForSubject: getSessionsForSubject,
        buildSubjectStudyAnalytics: buildSubjectStudyAnalytics
    };
})(typeof window !== 'undefined' ? window : globalThis);
