const CLOSE_BEHAVIOR = { QUIT: 'quit', TRAY: 'tray' };
const normalizeCloseBehavior = (value) => {
    const choice = String(value || '').trim().toLowerCase();
    return choice === CLOSE_BEHAVIOR.QUIT ? CLOSE_BEHAVIOR.QUIT : CLOSE_BEHAVIOR.TRAY;
}; // normalizeCloseBehavior
const shouldKeepAppResident = (value) => normalizeCloseBehavior(value) === CLOSE_BEHAVIOR.TRAY;
const decideCloseAction = (value, options = {}) => {
    const trayReady = options.hasTrayEntry !== false;
    return shouldKeepAppResident(value) && trayReady ? CLOSE_BEHAVIOR.TRAY : CLOSE_BEHAVIOR.QUIT;
}; // decideCloseAction
exports.CLOSE_BEHAVIOR = CLOSE_BEHAVIOR;
exports.decideCloseAction = decideCloseAction;
exports.normalizeCloseBehavior = normalizeCloseBehavior;
exports.shouldKeepAppResident = shouldKeepAppResident;
