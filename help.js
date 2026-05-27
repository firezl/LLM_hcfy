document.addEventListener("DOMContentLoaded", () => {
    const toastContainer = document.getElementById("toast_container");

    function showToast(message) {
        if (!toastContainer) {
            return;
        }

        const toast = document.createElement("div");
        toast.className = "jyt-toast";
        toast.textContent = message;
        toastContainer.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add("jyt-toast-show");
        });

        setTimeout(() => {
            toast.classList.remove("jyt-toast-show");
            setTimeout(() => toast.remove(), 250);
        }, 1600);
    }

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            showToast("已复制");
        } catch (err) {
            showToast("复制失败，请手动选择文本");
        }
    }

    document.querySelectorAll("[data-copy]").forEach((button) => {
        button.addEventListener("click", () => {
            copyText(button.dataset.copy || "");
        });
    });
});
