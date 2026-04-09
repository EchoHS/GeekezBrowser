const CLOSE_BEHAVIOR = {
    TRAY: 'tray',
    QUIT: 'quit'
};

function normalizeCloseBehavior(rawValue) {
    return rawValue === CLOSE_BEHAVIOR.QUIT ? CLOSE_BEHAVIOR.QUIT : CLOSE_BEHAVIOR.TRAY;
}

function resolveCloseBehavior(rawValue, { trayAvailable = true } = {}) {
    const preferredBehavior = normalizeCloseBehavior(rawValue);
    if (preferredBehavior === CLOSE_BEHAVIOR.TRAY && !trayAvailable) {
        return CLOSE_BEHAVIOR.QUIT;
    }
    return preferredBehavior;
}

module.exports = {
    CLOSE_BEHAVIOR,
    normalizeCloseBehavior,
    resolveCloseBehavior
};
