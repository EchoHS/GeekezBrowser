const CLOSE_BEHAVIOR = Object.freeze({
    QUIT: 'quit',
    TRAY: 'tray'
});

function normalizeCloseBehavior(value) {
    return String(value || '').toLowerCase() === CLOSE_BEHAVIOR.QUIT
        ? CLOSE_BEHAVIOR.QUIT
        : CLOSE_BEHAVIOR.TRAY;
}

function shouldKeepAppResident(value) {
    return normalizeCloseBehavior(value) === CLOSE_BEHAVIOR.TRAY;
}

function decideCloseAction(value, options = {}) {
    const hasTrayEntry = options.hasTrayEntry !== false;
    return shouldKeepAppResident(value) && hasTrayEntry
        ? CLOSE_BEHAVIOR.TRAY
        : CLOSE_BEHAVIOR.QUIT;
}

module.exports = {
    CLOSE_BEHAVIOR,
    decideCloseAction,
    normalizeCloseBehavior,
    shouldKeepAppResident
};
