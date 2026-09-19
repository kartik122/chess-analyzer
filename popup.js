document.getElementById("close-btn").addEventListener("click", () => window.close());

function escapeHtml(str) {
	const div = document.createElement("div");
	div.textContent = str;
	return div.innerHTML;
}

function openAnalysisTab() {
	chrome.tabs.create({ url: chrome.runtime.getURL("analysis.html") });
	window.close();
}

chrome.storage.local.get(["readyToAnalyze", "lastGame"], ({ readyToAnalyze, lastGame }) => {
	const content = document.getElementById("content");

	if (readyToAnalyze && lastGame) {
		const resultLine = lastGame.result
			? [lastGame.result.title, lastGame.result.subtitle].filter(Boolean).join(" — ")
			: "Game finished";

		content.innerHTML = `
			<div class="badge">Ready to analyze</div>
			<h1>${escapeHtml(resultLine)}</h1>
			<p>Your game just ended. Review it move-by-move with engine analysis.</p>
			<button id="analyze-btn" class="primary">Analyze Game</button>
		`;
		document.getElementById("analyze-btn").addEventListener("click", openAnalysisTab);
		return;
	}

	content.innerHTML = `
		<div class="knight-icon">&#9822;</div>
		<h1>No game to analyze yet</h1>
		<p>Play a game on chess.com. When it ends, this icon turns gold and you can review it here.</p>
		${lastGame ? `<button id="view-last-btn" class="secondary">View last analyzed game</button>` : ""}
	`;

	const viewBtn = document.getElementById("view-last-btn");
	if (viewBtn) viewBtn.addEventListener("click", openAnalysisTab);
});
