// Comprehensive IANA Timezone list for dropdown
const TIMEZONES = [
    "Auto (No Change)",  // 不修改时区，用于需要访问登录页面的环境
    // --- North America ---
    "America/New_York",        // US Eastern
    "America/Chicago",         // US Central
    "America/Denver",          // US Mountain
    "America/Phoenix",         // Arizona (no DST)
    "America/Los_Angeles",     // US Pacific
    "America/Anchorage",       // Alaska
    "America/Honolulu",        // Hawaii
    "America/Toronto",         // Canada Eastern
    "America/Vancouver",       // Canada Pacific
    "America/Edmonton",        // Canada Mountain
    "America/Winnipeg",        // Canada Central
    "America/Halifax",         // Canada Atlantic
    "America/Mexico_City",     // Mexico
    "America/Tijuana",         // Mexico Pacific
    "America/Monterrey",       // Mexico Central

    // --- Central & South America ---
    "America/Guatemala",
    "America/Costa_Rica",
    "America/Panama",
    "America/Bogota",          // Colombia
    "America/Lima",            // Peru
    "America/Santiago",        // Chile
    "America/Buenos_Aires",    // Argentina
    "America/Sao_Paulo",       // Brazil
    "America/Caracas",         // Venezuela

    // --- Europe ---
    "Europe/London",           // UK
    "Europe/Dublin",           // Ireland
    "Europe/Paris",            // France
    "Europe/Berlin",           // Germany
    "Europe/Rome",             // Italy
    "Europe/Madrid",           // Spain
    "Europe/Lisbon",           // Portugal
    "Europe/Amsterdam",        // Netherlands
    "Europe/Brussels",         // Belgium
    "Europe/Vienna",           // Austria
    "Europe/Zurich",           // Switzerland
    "Europe/Stockholm",        // Sweden
    "Europe/Oslo",             // Norway
    "Europe/Copenhagen",       // Denmark
    "Europe/Helsinki",         // Finland
    "Europe/Warsaw",           // Poland
    "Europe/Prague",           // Czech Republic
    "Europe/Budapest",         // Hungary
    "Europe/Athens",           // Greece
    "Europe/Istanbul",         // Turkey
    "Europe/Moscow",           // Russia
    "Europe/Kyiv",             // Ukraine
    "Europe/Bucharest",        // Romania
    "Europe/Sofia",            // Bulgaria

    // --- Asia ---
    "Asia/Dubai",              // UAE
    "Asia/Riyadh",             // Saudi Arabia
    "Asia/Tehran",             // Iran
    "Asia/Karachi",            // Pakistan
    "Asia/Kolkata",            // India
    "Asia/Dhaka",              // Bangladesh
    "Asia/Kathmandu",          // Nepal
    "Asia/Bangkok",            // Thailand
    "Asia/Ho_Chi_Minh",        // Vietnam
    "Asia/Jakarta",            // Indonesia Western
    "Asia/Singapore",          // Singapore
    "Asia/Kuala_Lumpur",       // Malaysia
    "Asia/Manila",             // Philippines
    "Asia/Hong_Kong",          // Hong Kong
    "Asia/Shanghai",           // China
    "Asia/Taipei",             // Taiwan
    "Asia/Tokyo",              // Japan
    "Asia/Seoul",              // South Korea
    "Asia/Vladivostok",        // Russia East

    // --- Australia & Pacific ---
    "Australia/Perth",         // Western Australia
    "Australia/Darwin",        // Northern Territory
    "Australia/Adelaide",      // South Australia
    "Australia/Brisbane",      // Queensland
    "Australia/Sydney",        // New South Wales
    "Australia/Melbourne",     // Victoria
    "Australia/Hobart",        // Tasmania
    "Pacific/Auckland",        // New Zealand
    "Pacific/Fiji",
    "Pacific/Guam",
    "Pacific/Honolulu",        // Hawaii (duplicate for clarity)

    // --- Africa ---
    "Africa/Cairo",            // Egypt
    "Africa/Johannesburg",     // South Africa
    "Africa/Lagos",            // Nigeria
    "Africa/Nairobi",          // Kenya
    "Africa/Casablanca",       // Morocco
    "Africa/Algiers",          // Algeria

    // --- Middle East ---
    "Asia/Jerusalem",          // Israel
    "Asia/Beirut",             // Lebanon
    "Asia/Damascus",           // Syria
    "Asia/Baghdad",            // Iraq
    "Asia/Kuwait",             // Kuwait
    "Asia/Qatar",              // Qatar
    "Asia/Muscat",             // Oman

    // --- Additional US Cities ---
    "America/Detroit",         // Michigan
    "America/Indianapolis",    // Indiana
    "America/Louisville",      // Kentucky
    "America/Atlanta",         // Georgia (same as New_York)
    "America/Miami",           // Florida (same as New_York)
    "America/Dallas",          // Texas (same as Chicago)
    "America/Houston",         // Texas (same as Chicago)
    "America/Seattle",         // Washington (same as Los_Angeles)
    "America/San_Francisco",   // California (same as Los_Angeles)
    "America/Las_Vegas",       // Nevada (same as Los_Angeles)
    "America/Denver",          // Colorado
    "America/Boise",           // Idaho
    "America/Salt_Lake_City",  // Utah
];

if (typeof module !== "undefined") module.exports = TIMEZONES;
else window.TIMEZONES = TIMEZONES;