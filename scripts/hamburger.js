// =================
// SELECTOR DE IDIOMAS Y MENÚ HAMBURGUESA
// =================

document.addEventListener('DOMContentLoaded', function() {
    const languageButton = document.querySelector('.language-button');
    const languageDropdown = document.querySelector('.language-dropdown');
    const languageOptions = document.querySelectorAll('.language-option');
    const mobileLanguageOptions = document.querySelectorAll('.mobile-language-option');
    
    // Elementos del menú hamburguesa
    const hamburger = document.querySelector('.hamburger');
    const mobileMenu = document.querySelector('.mobile-menu');
    const mobileMenuOverlay = document.querySelector('.mobile-menu-overlay');
    
    // Obtener idioma actual del localStorage o por defecto español
    let currentLanguage = localStorage.getItem('language') || 'es';
    
    // Configuración de idiomas
    const languages = {
        'es': { name: 'ES', full: 'Español' },
        'ca': { name: 'CA', full: 'Català' },
        'en': { name: 'EN', full: 'English' }
    };
    
    // =================
    // MENÚ HAMBURGUESA
    // =================
    
    if (hamburger && mobileMenu) {
        mobileMenu.hidden = true;
        hamburger.addEventListener('click', function() {
            toggleMobileMenu();
        });
        
        if (mobileMenuOverlay) {
            mobileMenuOverlay.addEventListener('click', function() {
                closeMobileMenu();
            });
        }
        
        // Cerrar menú al hacer click en un enlace
        const mobileNavLinks = document.querySelectorAll('.mobile-nav-links a');
        mobileNavLinks.forEach(link => {
            link.addEventListener('click', function() {
                closeMobileMenu();
            });
        });
    }
    
    function toggleMobileMenu() {
        hamburger.classList.toggle('active');
        mobileMenu.classList.toggle('show');
        mobileMenuOverlay.classList.toggle('show');
        
        // Prevenir scroll del body cuando el menú está abierto
        if (mobileMenu.classList.contains('show')) {
            document.body.style.overflow = 'hidden';
            mobileMenu.hidden = false;
        } else {
            document.body.style.overflow = '';
            mobileMenu.hidden = true;
        }
    }
    
    function closeMobileMenu() {
        hamburger.classList.remove('active');
        mobileMenu.classList.remove('show');
        mobileMenuOverlay.classList.remove('show');
        document.body.style.overflow = '';
    }
    
    // =================
    // SELECTOR DE IDIOMAS
    // =================
    
    // Inicializar selector
    function initLanguageSelector() {
        updateLanguageButton();
        updateLanguageOptions();
    }
    
    // Actualizar botón principal
    function updateLanguageButton() {
        const lang = languages[currentLanguage];
        if (languageButton && lang) {
            languageButton.innerHTML = `
                <span>${lang.name}</span>
            `;
        }
    }
    
    // Actualizar opciones del dropdown
    function updateLanguageOptions() {
        // Desktop dropdown
        languageOptions.forEach(option => {
            const langCode = option.dataset.lang;
            if (langCode === currentLanguage) {
                option.classList.add('current');
            } else {
                option.classList.remove('current');
            }
        });
        
        // Mobile options
        mobileLanguageOptions.forEach(option => {
            const langCode = option.dataset.lang;
            if (langCode === currentLanguage) {
                option.classList.add('current');
            } else {
                option.classList.remove('current');
            }
        });
    }
    
    // Toggle dropdown desktop
    if (languageButton) {
        languageButton.addEventListener('click', function(e) {
            e.stopPropagation();
            const languageSelector = document.querySelector('.language-selector');
            
            languageButton.classList.toggle('active');
            languageDropdown.classList.toggle('show');
            
            // También aplicar la clase active al contenedor padre para z-index
            if (languageDropdown.classList.contains('show')) {
                languageSelector.classList.add('active');
            } else {
                languageSelector.classList.remove('active');
            }
        });
    }
    
    // Seleccionar idioma - Desktop
    languageOptions.forEach(option => {
        option.addEventListener('click', function(e) {
            e.preventDefault();
            selectLanguage(this.dataset.lang);
            
            // Cerrar dropdown
            const languageSelector = document.querySelector('.language-selector');
            languageButton.classList.remove('active');
            languageDropdown.classList.remove('show');
            languageSelector.classList.remove('active');
        });
    });
    
    // Seleccionar idioma - Mobile
    mobileLanguageOptions.forEach(option => {
        option.addEventListener('click', function(e) {
            e.preventDefault();
            selectLanguage(this.dataset.lang);
            closeMobileMenu();
        });
    });
    
    function selectLanguage(selectedLang) {
        if (selectedLang !== currentLanguage) {
            currentLanguage = selectedLang;
            localStorage.setItem('language', currentLanguage);
            updateLanguageButton();
            updateLanguageOptions();
            
            // Traducir la página si la función está disponible
            if (typeof translatePage === 'function') {
                translatePage(currentLanguage);
            }
            
            console.log(`Idioma cambiado a: ${languages[selectedLang].full}`);
        }
    }
    
    // Cerrar dropdown al hacer click fuera
    document.addEventListener('click', function() {
        if (languageButton && languageDropdown) {
            const languageSelector = document.querySelector('.language-selector');
            languageButton.classList.remove('active');
            languageDropdown.classList.remove('show');
            if (languageSelector) {
                languageSelector.classList.remove('active');
            }
        }
    });
    
    // Inicializar
    initLanguageSelector();
});
