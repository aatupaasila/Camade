// --------- THEME SWITCHER ----------
const themeBtn = document.getElementById("themeToggle");

themeBtn.addEventListener("click", () => {
    document.body.classList.toggle("dark");

    // Optional: store theme preference later
});
