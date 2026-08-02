/**
 * Sequência (streak) por rotina — dias agendados consecutivos concluídos.
 * Depende de: getLocalDateStr, isRoutineDate, isRoutineDayClosedOut (routine-detail.js).
 */
(function (global) {
    function prevLocalDateStr(dateStr) {
        var d = new Date(dateStr + 'T12:00:00');
        d.setDate(d.getDate() - 1);
        return global.getLocalDateStr(d);
    }

    function nextLocalDateStr(dateStr) {
        var d = new Date(dateStr + 'T12:00:00');
        d.setDate(d.getDate() + 1);
        return global.getLocalDateStr(d);
    }

    function isScheduledDayDone(routine, dateStr) {
        if (!global.isRoutineDate || !global.isRoutineDayClosedOut) return false;
        if (!global.isRoutineDate(dateStr, routine)) return false;
        return global.isRoutineDayClosedOut(routine, dateStr);
    }

    /** Sequência atual: dias agendados consecutivos concluídos terminando hoje ou ontem. */
    function getRoutineStreak(routine) {
        if (!routine) return 0;
        var today = global.getLocalDateStr(new Date());
        var yesterday = prevLocalDateStr(today);
        var start = null;
        if (isScheduledDayDone(routine, today)) {
            start = today;
        } else if (isScheduledDayDone(routine, yesterday)) {
            start = yesterday;
        } else {
            return 0;
        }
        var streak = 0;
        var check = start;
        while (check) {
            if (!global.isRoutineDate(check, routine)) {
                check = prevLocalDateStr(check);
                continue;
            }
            if (!isScheduledDayDone(routine, check)) break;
            streak++;
            check = prevLocalDateStr(check);
        }
        return streak;
    }

    /** Maior sequência histórica (scan de dias agendados concluídos). */
    function getBestStreak(routine) {
        if (!routine) return 0;
        var stored = typeof routine.bestStreak === 'number' && !isNaN(routine.bestStreak)
            ? Math.max(0, Math.floor(routine.bestStreak))
            : 0;
        var dates = new Set();
        if (routine.checkIns) {
            routine.checkIns.forEach(function (d) {
                if (d) dates.add(String(d).slice(0, 10));
            });
        }
        if (routine.tasks) {
            routine.tasks.forEach(function (t) {
                (t.completedDates || []).forEach(function (d) {
                    if (d) dates.add(String(d).slice(0, 10));
                });
            });
        }
        if (dates.size === 0) return stored;

        var sorted = Array.from(dates).sort();
        var best = 0;
        var run = 0;
        var prevScheduled = null;

        sorted.forEach(function (dateStr) {
            if (!global.isRoutineDate(dateStr, routine)) return;
            if (!isScheduledDayDone(routine, dateStr)) return;
            if (prevScheduled === null) {
                run = 1;
            } else {
                var expected = nextLocalDateStr(prevScheduled);
                var gap = new Date(dateStr + 'T12:00:00') - new Date(prevScheduled + 'T12:00:00');
                var daysBetween = Math.round(gap / 86400000);
                var chained = true;
                if (daysBetween > 1) {
                    var walk = prevScheduled;
                    for (var i = 1; i < daysBetween; i++) {
                        walk = nextLocalDateStr(walk);
                        if (global.isRoutineDate(walk, routine) && !isScheduledDayDone(routine, walk)) {
                            chained = false;
                            break;
                        }
                    }
                }
                run = chained && daysBetween >= 1 ? run + 1 : 1;
            }
            if (run > best) best = run;
            prevScheduled = dateStr;
        });

        return Math.max(stored, best, getRoutineStreak(routine));
    }

    function updateBestStreak(routine) {
        if (!routine) return 0;
        var current = getRoutineStreak(routine);
        var best = getBestStreak(routine);
        routine.bestStreak = Math.max(
            typeof routine.bestStreak === 'number' ? routine.bestStreak : 0,
            current,
            best
        );
        return routine.bestStreak;
    }

    global.getRoutineStreak = getRoutineStreak;
    global.getBestStreak = getBestStreak;
    global.updateBestStreak = updateBestStreak;
})(typeof window !== 'undefined' ? window : globalThis);
