function resolveSystemLanguage(locale) {
    return /^zh(?:[-_]|$)/i.test(String(locale || '').trim()) ? 'cn' : 'en';
}

function resolveConfiguredLanguage(settings = {}, systemLocale = '') {
    if (settings.lang === 'cn' || settings.lang === 'en') return settings.lang;
    return resolveSystemLanguage(systemLocale);
}

module.exports = {
    resolveConfiguredLanguage,
    resolveSystemLanguage
};
