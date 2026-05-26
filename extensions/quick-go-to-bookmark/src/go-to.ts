const init = async () => {
  const results = document.getElementById("results")!;
  results.textContent = "Quick Go To Bookmark — coming soon";
};

init().catch((err) => {
  console.error("Quick Go To Bookmark init failed:", err);
});
