// upload.js

const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const continueBtn = document.getElementById("continueBtn");

fileInput.addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = evt => {
        preview.src = evt.target.result;
        preview.style.display = "block";
    };
    reader.readAsDataURL(file);
});

continueBtn.addEventListener("click", () => {
    const name = document.getElementById("itemName").value;
    const category = document.getElementById("category").value;

    if (!name || !preview.src) {
        alert("Anna nimi ja kuva!");
        return;
    }

    // luodaan pending-edit item
    const pending = {
        name,
        category,
        image: preview.src
    };

    localStorage.setItem("pendingEditItem", JSON.stringify(pending));

    // jatketaan editoriin
    window.location.href = "edit.html";
});
