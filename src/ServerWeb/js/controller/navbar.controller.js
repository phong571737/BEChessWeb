export const NavbarController = {
    init() {
        const toggle = document.querySelector('.top-nav');
        const menu = document.querySelector('.nav-left');

        if (!toggle || !menu) return;

        toggle.addEventListener(("click"), () => {
            menu.classList.toggle("active");
            toggle.classList.toggle("active");
        })
    }
}