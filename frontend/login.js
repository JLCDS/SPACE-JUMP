// Simulated user database (localStorage)
class UserDatabase {
    constructor() {
        this.users = JSON.parse(localStorage.getItem('skybet_users')) || [];
    }

    save() {
        localStorage.setItem('skybet_users', JSON.stringify(this.users));
    }

    userExists(username) {
        return this.users.some(user => user.username.toLowerCase() === username.toLowerCase());
    }

    addUser(username, password) {
        const user = {
            username: username,
            password: password, // En producción, esto debería estar hasheado
            createdAt: new Date().toISOString(),
            balance: 1000.00,
            stats: {
                totalFlights: 0,
                totalProfit: 0,
                bestAltitude: 0
            }
        };
        this.users.push(user);
        this.save();
        return user;
    }

    authenticate(username, password) {
        return this.users.find(user => 
            user.username.toLowerCase() === username.toLowerCase() && 
            user.password === password
        );
    }
}

// Form validation
class FormValidator {
    constructor() {
        this.requirements = {
            username: {
                minLength: 3,
                maxLength: 20,
                pattern: /^[a-zA-Z0-9_]+$/,
                message: 'Solo letras, números y guiones bajos'
            },
            password: {
                minLength: 8,
                requirements: {
                    uppercase: /[A-Z]/,
                    lowercase: /[a-z]/,
                    number: /[0-9]/,
                    special: /[!@#$%^&*(),.?":{}|<>]/
                }
            }
        };
    }

    validateUsername(username) {
        const errors = [];
        const req = this.requirements.username;

        if (username.length < req.minLength) {
            errors.push(`Mínimo ${req.minLength} caracteres`);
        }

        if (username.length > req.maxLength) {
            errors.push(`Máximo ${req.maxLength} caracteres`);
        }

        if (!req.pattern.test(username)) {
            errors.push(req.message);
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    validatePassword(password) {
        const errors = [];
        const requirements = this.requirements.password;

        if (password.length < requirements.minLength) {
            errors.push(`Mínimo ${requirements.minLength} caracteres`);
        }

        if (!requirements.requirements.uppercase.test(password)) {
            errors.push('Debe contener al menos 1 mayúscula');
        }

        if (!requirements.requirements.lowercase.test(password)) {
            errors.push('Debe contener al menos 1 minúscula');
        }

        if (!requirements.requirements.number.test(password)) {
            errors.push('Debe contener al menos 1 número');
        }

        if (!requirements.requirements.special.test(password)) {
            errors.push('Debe contener al menos 1 carácter especial');
        }

        return {
            isValid: errors.length === 0,
            errors: errors,
            requirements: {
                length: password.length >= requirements.minLength,
                uppercase: requirements.requirements.uppercase.test(password),
                lowercase: requirements.requirements.lowercase.test(password),
                number: requirements.requirements.number.test(password),
                special: requirements.requirements.special.test(password)
            }
        };
    }

    validatePasswordMatch(password, confirmPassword) {
        return {
            isValid: password === confirmPassword,
            errors: password === confirmPassword ? [] : ['Las contraseñas no coinciden']
        };
    }
}

// Main Auth Application
class AuthApp {
    constructor() {
        this.db = new UserDatabase();
        this.validator = new FormValidator();
        this.currentForm = 'login';
        
        this.initializeElements();
        this.createParticles();
        this.attachEventListeners();
    }

    initializeElements() {
        // Forms
        this.loginForm = document.getElementById('loginForm');
        this.registerForm = document.getElementById('registerForm');
        this.successMessage = document.getElementById('successMessage');

        // Login elements
        this.loginUsername = document.getElementById('loginUsername');
        this.loginPassword = document.getElementById('loginPassword');
        this.loginUsernameError = document.getElementById('loginUsernameError');
        this.loginPasswordError = document.getElementById('loginPasswordError');

        // Register elements
        this.registerUsername = document.getElementById('registerUsername');
        this.registerPassword = document.getElementById('registerPassword');
        this.confirmPassword = document.getElementById('confirmPassword');
        this.registerUsernameError = document.getElementById('registerUsernameError');
        this.registerPasswordError = document.getElementById('registerPasswordError');
        this.confirmPasswordError = document.getElementById('confirmPasswordError');

        // Password requirements
        this.passwordRequirements = document.getElementById('passwordRequirements');

        // Toggle buttons
        this.showRegisterBtn = document.getElementById('showRegister');
        this.showLoginBtn = document.getElementById('showLogin');
        this.goToGameBtn = document.getElementById('goToGame');

        // Password toggle buttons
        this.toggleLoginPassword = document.getElementById('toggleLoginPassword');
        this.toggleRegisterPassword = document.getElementById('toggleRegisterPassword');
        this.toggleConfirmPassword = document.getElementById('toggleConfirmPassword');
    }

    createParticles() {
        const particlesContainer = document.getElementById('particles');
        for (let i = 0; i < 50; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.left = Math.random() * 100 + '%';
            particle.style.animationDelay = Math.random() * 15 + 's';
            particle.style.animationDuration = (Math.random() * 10 + 10) + 's';
            particlesContainer.appendChild(particle);
        }
    }

    attachEventListeners() {
        // Form switching
        this.showRegisterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.switchToRegister();
        });

        this.showLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.switchToLogin();
        });

        // Form submissions
        document.getElementById('loginFormData').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        document.getElementById('registerFormData').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleRegister();
        });

        // Password visibility toggles
        this.toggleLoginPassword.addEventListener('click', () => {
            this.togglePasswordVisibility(this.loginPassword, this.toggleLoginPassword);
        });

        this.toggleRegisterPassword.addEventListener('click', () => {
            this.togglePasswordVisibility(this.registerPassword, this.toggleRegisterPassword);
        });

        this.toggleConfirmPassword.addEventListener('click', () => {
            this.togglePasswordVisibility(this.confirmPassword, this.toggleConfirmPassword);
        });

        // Real-time validation
        this.registerUsername.addEventListener('input', () => {
            this.validateUsernameRealTime();
        });

        this.registerPassword.addEventListener('input', () => {
            this.validatePasswordRealTime();
        });

        this.confirmPassword.addEventListener('input', () => {
            this.validateConfirmPasswordRealTime();
        });

        // Go to game button
        this.goToGameBtn.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }

    switchToRegister() {
        this.loginForm.classList.remove('active');
        this.registerForm.classList.add('active');
        this.currentForm = 'register';
        this.clearErrors();
    }

    switchToLogin() {
        this.registerForm.classList.remove('active');
        this.loginForm.classList.add('active');
        this.currentForm = 'login';
        this.clearErrors();
    }

    togglePasswordVisibility(input, button) {
        if (input.type === 'password') {
            input.type = 'text';
            button.textContent = '🙈';
        } else {
            input.type = 'password';
            button.textContent = '👁️';
        }
    }

    validateUsernameRealTime() {
        const username = this.registerUsername.value;
        const validation = this.validator.validateUsername(username);
        
        if (username && !validation.isValid) {
            this.showError(this.registerUsernameError, validation.errors[0]);
            this.registerUsername.classList.add('error');
        } else if (username && this.db.userExists(username)) {
            this.showError(this.registerUsernameError, 'Este nombre de usuario ya está en uso');
            this.registerUsername.classList.add('error');
        } else {
            this.clearError(this.registerUsernameError);
            this.registerUsername.classList.remove('error');
        }
    }

    validatePasswordRealTime() {
        const password = this.registerPassword.value;
        const validation = this.validator.validatePassword(password);
        
        // Update requirement indicators
        this.updatePasswordRequirements(validation.requirements);
        
        if (password && !validation.isValid) {
            this.registerPassword.classList.add('error');
        } else {
            this.registerPassword.classList.remove('error');
        }

        // Also validate confirm password if it has content
        if (this.confirmPassword.value) {
            this.validateConfirmPasswordRealTime();
        }
    }

    validateConfirmPasswordRealTime() {
        const password = this.registerPassword.value;
        const confirmPassword = this.confirmPassword.value;
        const validation = this.validator.validatePasswordMatch(password, confirmPassword);
        
        if (confirmPassword && !validation.isValid) {
            this.showError(this.confirmPasswordError, validation.errors[0]);
            this.confirmPassword.classList.add('error');
        } else {
            this.clearError(this.confirmPasswordError);
            this.confirmPassword.classList.remove('error');
        }
    }

    updatePasswordRequirements(requirements) {
        const reqElements = {
            'req-length': requirements.length,
            'req-uppercase': requirements.uppercase,
            'req-lowercase': requirements.lowercase,
            'req-number': requirements.number,
            'req-special': requirements.special
        };

        Object.keys(reqElements).forEach(id => {
            const element = document.getElementById(id);
            element.classList.remove('valid', 'invalid');
            element.classList.add(reqElements[id] ? 'valid' : 'invalid');
        });
    }

    async handleLogin() {
        const username = this.loginUsername.value.trim();
        const password = this.loginPassword.value;

        this.clearErrors();

        // Basic validation
        if (!username) {
            this.showError(this.loginUsernameError, 'El nombre de usuario es requerido');
            return;
        }

        if (!password) {
            this.showError(this.loginPasswordError, 'La contraseña es requerida');
            return;
        }

        // Simulate loading
        const submitBtn = document.querySelector('#loginFormData .auth-btn');
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;
        submitBtn.textContent = '🚀 Verificando...';

        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Authenticate user
        const user = this.db.authenticate(username, password);

        if (user) {
            // Store current user session
            localStorage.setItem('skybet_current_user', JSON.stringify(user));
            
            // Show success and redirect
            this.showSuccess();
        } else {
            this.showError(this.loginUsernameError, 'Nombre de usuario o contraseña incorrectos');
            this.showError(this.loginPasswordError, '');
        }

        // Reset button
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        submitBtn.textContent = '🚀 Despegar';
    }

    async handleRegister() {
        const username = this.registerUsername.value.trim();
        const password = this.registerPassword.value;
        const confirmPassword = this.confirmPassword.value;

        this.clearErrors();

        // Validate all fields
        const usernameValidation = this.validator.validateUsername(username);
        const passwordValidation = this.validator.validatePassword(password);
        const passwordMatchValidation = this.validator.validatePasswordMatch(password, confirmPassword);

        let hasErrors = false;

        // Username validation
        if (!usernameValidation.isValid) {
            this.showError(this.registerUsernameError, usernameValidation.errors[0]);
            hasErrors = true;
        } else if (this.db.userExists(username)) {
            this.showError(this.registerUsernameError, 'Este nombre de usuario ya está en uso');
            hasErrors = true;
        }

        // Password validation
        if (!passwordValidation.isValid) {
            this.showError(this.registerPasswordError, 'La contraseña no cumple con los requisitos');
            hasErrors = true;
        }

        // Confirm password validation
        if (!passwordMatchValidation.isValid) {
            this.showError(this.confirmPasswordError, passwordMatchValidation.errors[0]);
            hasErrors = true;
        }

        if (hasErrors) return;

        // Simulate loading
        const submitBtn = document.querySelector('#registerFormData .auth-btn');
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;
        submitBtn.textContent = '🌟 Creando cuenta...';

        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Create user
        const newUser = this.db.addUser(username, password);
        
        // Store current user session
        localStorage.setItem('skybet_current_user', JSON.stringify(newUser));

        // Show success
        this.showSuccess();

        // Reset button
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        submitBtn.textContent = '🌟 Crear Cuenta';
    }

    showSuccess() {
        this.successMessage.style.display = 'flex';
    }

    showError(element, message) {
        element.textContent = message;
        element.style.display = 'block';
    }

    clearError(element) {
        element.textContent = '';
        element.style.display = 'none';
    }

    clearErrors() {
        const errorElements = document.querySelectorAll('.input-error');
        errorElements.forEach(element => this.clearError(element));
        
        const inputElements = document.querySelectorAll('input');
        inputElements.forEach(input => input.classList.remove('error'));
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AuthApp();
});

// Utility function to check if user is logged in (for use in other pages)
window.SkyBetAuth = {
    getCurrentUser: () => {
        return JSON.parse(localStorage.getItem('skybet_current_user'));
    },
    
    isLoggedIn: () => {
        return !!localStorage.getItem('skybet_current_user');
    },
    
    logout: () => {
        localStorage.removeItem('skybet_current_user');
        window.location.href = 'login.html';
    },
    
    requireAuth: () => {
        if (!window.SkyBetAuth.isLoggedIn()) {
            window.location.href = 'login.html';
        }
    }
};