const openOptionsBtn = document.getElementById("open-options");

openOptionsBtn?.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
