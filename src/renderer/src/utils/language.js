export function resolveSystemLanguage(locale) {
    return /^zh(?:[-_]|$)/i.test(String(locale || '').trim()) ? 'cn' : 'en';
}

export function resolveConfiguredLanguage(language, systemLocale) {
    if (language === 'cn' || language === 'en') return language;
    if (systemLocale === 'cn' || systemLocale === 'en') return systemLocale;
    return resolveSystemLanguage(systemLocale);
}
