export const NavbarController = {
    init() {
        const toggle = document.querySelector('.top-nav');
        const menu = document.querySelector('.nav-left');

        if (!toggle || !menu) return;

        toggle.addEventListener("click", () => {
            menu.classList.toggle("active");
            toggle.classList.toggle("active");
        });

        // close menu
        menu.addEventListener("click", (e) => {
            if (e.target.closest("a")) {
                menu.classList.remove("active");
                toggle.classList.remove("active");
            }
        });
    }
}