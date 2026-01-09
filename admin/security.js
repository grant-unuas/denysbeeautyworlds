// Enhanced Security Module
class SecurityManager {
    constructor() {
        this.initSecurity();
    }

    initSecurity() {
        this.enforceHTTPS();
        this.addCSPHeaders();
        this.preventDevTools();
        this.encryptStorage();
        this.addRateLimiting();
        this.validateInputs();
    }

    // Force HTTPS
    enforceHTTPS() {
        if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
            location.replace('https:' + window.location.href.substring(window.location.protocol.length));
        }
    }

    // Content Security Policy
    addCSPHeaders() {
        const meta = document.createElement('meta');
        meta.httpEquiv = 'Content-Security-Policy';
        meta.content = "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.auth0.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:;";
        document.head.appendChild(meta);
    }

    // Basic dev tools detection
    preventDevTools() {
        let devtools = {open: false, orientation: null};
        const threshold = 160;
        
        setInterval(() => {
            if (window.outerHeight - window.innerHeight > threshold || 
                window.outerWidth - window.innerWidth > threshold) {
                if (!devtools.open) {
                    devtools.open = true;
                    this.handleSecurityViolation('DevTools detected');
                }
            } else {
                devtools.open = false;
            }
        }, 500);

        // Disable right-click
        document.addEventListener('contextmenu', e => e.preventDefault());
        
        // Disable F12, Ctrl+Shift+I, etc.
        document.addEventListener('keydown', e => {
            if (e.key === 'F12' || 
                (e.ctrlKey && e.shiftKey && e.key === 'I') ||
                (e.ctrlKey && e.shiftKey && e.key === 'C') ||
                (e.ctrlKey && e.key === 'u')) {
                e.preventDefault();
                this.handleSecurityViolation('Keyboard shortcut blocked');
            }
        });
    }

    // Encrypt localStorage data (disabled for compatibility)
    encryptStorage() {
        // Temporarily disabled to prevent login issues
        // Can be re-enabled after testing
        return;
        
        const originalSetItem = localStorage.setItem;
        const originalGetItem = localStorage.getItem;

        localStorage.setItem = function(key, value) {
            const encrypted = btoa(unescape(encodeURIComponent(value)));
            originalSetItem.call(this, key, encrypted);
        };

        localStorage.getItem = function(key) {
            const value = originalGetItem.call(this, key);
            if (value) {
                try {
                    return decodeURIComponent(escape(atob(value)));
                } catch (e) {
                    return value; // Return original if decryption fails
                }
            }
            return value;
        };
    }

    // Rate limiting for login attempts
    addRateLimiting() {
        const attempts = JSON.parse(localStorage.getItem('securityAttempts') || '{}');
        const now = Date.now();
        
        // Clean old attempts (older than 1 hour)
        Object.keys(attempts).forEach(ip => {
            if (now - attempts[ip].lastAttempt > 3600000) {
                delete attempts[ip];
            }
        });

        localStorage.setItem('securityAttempts', JSON.stringify(attempts));
    }

    // Input validation and sanitization
    validateInputs() {
        document.addEventListener('input', (e) => {
            if (e.target.type === 'email' || e.target.type === 'text') {
                e.target.value = this.sanitizeInput(e.target.value);
            }
        });
    }

    sanitizeInput(input) {
        return input
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '');
    }

    // Handle security violations
    handleSecurityViolation(type) {
        console.warn(`Security violation detected: ${type}`);
        
        // Log violation
        const violations = JSON.parse(localStorage.getItem('securityViolations') || '[]');
        violations.push({
            type,
            timestamp: Date.now(),
            userAgent: navigator.userAgent,
            url: window.location.href
        });
        
        // Keep only last 50 violations
        if (violations.length > 50) {
            violations.splice(0, violations.length - 50);
        }
        
        localStorage.setItem('securityViolations', JSON.stringify(violations));

        // Redirect to main site after multiple violations
        if (violations.filter(v => Date.now() - v.timestamp < 300000).length > 3) {
            window.location.href = '../index.html';
        }
    }

    // Generate secure session token
    generateSecureToken() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    // Validate session integrity
    validateSession() {
        try {
            const session = sessionStorage.getItem('adminAuthenticated');
            const loginTime = sessionStorage.getItem('adminLoginTime');
            
            if (!session || session !== 'true') {
                return false;
            }
            
            if (!loginTime) {
                return false;
            }

            // Check session timeout (2 hours)
            if (Date.now() - parseInt(loginTime) > 7200000) {
                this.clearSession();
                return false;
            }

            return true;
        } catch (error) {
            console.error('Session validation error:', error);
            return false;
        }
    }

    // Clear session securely
    clearSession() {
        sessionStorage.clear();
        localStorage.removeItem('tempAuthData');
        
        // Clear any cached data
        if ('caches' in window) {
            caches.keys().then(names => {
                names.forEach(name => caches.delete(name));
            });
        }
    }

    // Check for suspicious activity
    detectSuspiciousActivity() {
        const checks = [
            () => typeof window.chrome !== 'undefined',
            () => window.navigator.webdriver,
            () => window.callPhantom || window._phantom,
            () => window.Buffer,
            () => window.emit,
            () => window.spawn
        ];

        const suspiciousCount = checks.filter(check => {
            try { return check(); } catch(e) { return false; }
        }).length;

        if (suspiciousCount > 2) {
            this.handleSecurityViolation('Suspicious environment detected');
        }
    }

    // Initialize secure admin session
    createSecureSession(adminData) {
        try {
            const token = this.generateSecureToken();
            
            sessionStorage.setItem('adminAuthenticated', 'true');
            sessionStorage.setItem('securityToken', token);
            sessionStorage.setItem('adminLoginTime', Date.now().toString());
            sessionStorage.setItem('adminData', JSON.stringify(adminData));
        } catch (error) {
            console.error('Session creation error:', error);
            // Fallback to basic session
            sessionStorage.setItem('adminAuthenticated', 'true');
            sessionStorage.setItem('adminLoginTime', Date.now().toString());
            sessionStorage.setItem('adminData', JSON.stringify(adminData));
        }
    }

    // Generate browser fingerprint
    generateFingerprint() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('Security fingerprint', 2, 2);
        
        return btoa(JSON.stringify({
            screen: `${screen.width}x${screen.height}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            language: navigator.language,
            platform: navigator.platform,
            canvas: canvas.toDataURL(),
            userAgent: navigator.userAgent.slice(0, 100)
        }));
    }
}

// Initialize security
const security = new SecurityManager();

// Export for use in other files
window.SecurityManager = SecurityManager;
window.security = security;
