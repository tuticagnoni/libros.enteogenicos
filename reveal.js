/* Materializacion sci-fi de elementos con [data-reveal].
   Se activan al entrar en viewport, con stagger via --rd. */
(function () {
    var SELECTOR = '[data-reveal]';

    function revealNow(el) {
        el.classList.add('is-revealed');
    }

    function revealRemaining() {
        document.querySelectorAll(SELECTOR + ':not(.is-revealed)').forEach(revealNow);
    }

    // Expuesta global: se llama despues de inyectar contenido dinamico
    window.revealInit = function revealInit(root) {
        var scope = root || document;
        var els = scope.querySelectorAll(SELECTOR + ':not(.is-revealed)');
        if (!els.length) return;

        var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced || !('IntersectionObserver' in window)) {
            els.forEach(revealNow);
            return;
        }

        var io = new IntersectionObserver(function (entries, obs) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                revealNow(entry.target);
                obs.unobserve(entry.target);
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

        els.forEach(function (el) { io.observe(el); });
    };

    document.addEventListener('DOMContentLoaded', function () {
        window.revealInit();
    });

    // Red de seguridad SOLO para navegadores sin IntersectionObserver.
    // Si revelaramos "por las dudas" tras un timeout, las animaciones
    // on-scroll se dispararian fuera de pantalla y el usuario las perderia.
    if (!('IntersectionObserver' in window)) {
        document.addEventListener('DOMContentLoaded', revealRemaining);
        window.addEventListener('load', revealRemaining);
        setTimeout(revealRemaining, 4000);
    }
})();
