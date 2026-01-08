// Secure Admin Configuration
const ADMIN_CONFIG = {
    // Only these Google accounts can access admin panel
    AUTHORIZED_EMAILS: [
        'grantunuas@gmail.com',  // Admin email
        'grantunua@gmail.com',   // Salon owner email  
        'grant.unua@gmail.com',  // Alternative format
        'grantunua.s@gmail.com', // Another variation
        // Add more authorized emails here
    ],
    
    // Auth0 Configuration
    AUTH0_DOMAIN: 'dev-i5b08jbmyiyg4g8s.us.auth0.com',
    AUTH0_CLIENT_ID: 'gtsyHwdN37OnhgHl7wypSrCLVpblQ9s6',
    
    // Security settings
    SESSION_TIMEOUT: 2 * 60 * 60 * 1000, // 2 hours
    MAX_LOGIN_ATTEMPTS: 3,
    LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes
};

// Security functions
function isAuthorizedEmail(email) {
    const normalizedEmail = email.toLowerCase().trim();
    console.log('Checking email:', normalizedEmail);
    console.log('Against authorized emails:', ADMIN_CONFIG.AUTHORIZED_EMAILS);
    return ADMIN_CONFIG.AUTHORIZED_EMAILS.includes(normalizedEmail);
}

function checkLoginAttempts(email) {
    const attempts = JSON.parse(localStorage.getItem('loginAttempts') || '{}');
    const userAttempts = attempts[email] || { count: 0, lastAttempt: 0 };
    
    if (userAttempts.count >= ADMIN_CONFIG.MAX_LOGIN_ATTEMPTS) {
        const timeSinceLastAttempt = Date.now() - userAttempts.lastAttempt;
        if (timeSinceLastAttempt < ADMIN_CONFIG.LOCKOUT_DURATION) {
            return false; // Still locked out
        } else {
            // Reset attempts after lockout period
            delete attempts[email];
            localStorage.setItem('loginAttempts', JSON.stringify(attempts));
        }
    }
    return true;
}

function recordFailedLogin(email) {
    const attempts = JSON.parse(localStorage.getItem('loginAttempts') || '{}');
    if (!attempts[email]) {
        attempts[email] = { count: 0, lastAttempt: 0 };
    }
    attempts[email].count++;
    attempts[email].lastAttempt = Date.now();
    localStorage.setItem('loginAttempts', JSON.stringify(attempts));
}

function clearLoginAttempts(email) {
    const attempts = JSON.parse(localStorage.getItem('loginAttempts') || '{}');
    delete attempts[email];
    localStorage.setItem('loginAttempts', JSON.stringify(attempts));
}
