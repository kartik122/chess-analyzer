(async function() {
	const GAME_OVER_HEADER_SELECTOR = ".game-over-modal-header-component";
	const MOVE_LIST_SELECTOR = "wc-simple-move-list";

	let gameOverHandled = false;

	function scrapeSanMoves() {
		const rows = document.querySelectorAll(
			`${MOVE_LIST_SELECTOR} .main-line-row`
		);
		const sanMoves = [];

		for (const row of rows) {
			for (const moveClass of ["white-move", "black-move"]) {
				const node = row.querySelector(`.node.${moveClass}`);
				if (!node) continue;
				const span = node.querySelector(".node-highlight-content");
				if (!span) continue;

				const figurineIcon = span.querySelector("[data-figurine]");
				const pieceLetter = figurineIcon ? figurineIcon.dataset.figurine : "";
				const destinationText = span.textContent.trim();

				sanMoves.push(pieceLetter + destinationText);
			}
		}

		return sanMoves;
	}

	function getResultInfo() {
		const header = document.querySelector(GAME_OVER_HEADER_SELECTOR);
		if (!header) return null;

		const resultClass = Array.from(header.classList).find(
			(c) => c.startsWith("game-over-modal-header-") && c !== "game-over-modal-header-component"
		);

		const title = header.querySelector(".game-over-modal-title-component");
		const subtitle = header.querySelector(".game-over-modal-subtitle-component");

		return {
			resultCode: resultClass ? resultClass.replace("game-over-modal-header-", "") : null,
			title: title ? title.textContent.trim() : null,
			subtitle: subtitle ? subtitle.textContent.trim() : null,
		};
	}

	function showOpenAnalysisPrompt(result, pgn, plies) {
		let panel = document.getElementById("chess-analyzer-panel");
		if (!panel) {
			panel = document.createElement("div");
			panel.id = "chess-analyzer-panel";
			panel.style.cssText = [
				"position: fixed",
				"top: 16px",
				"right: 16px",
				"z-index: 999999",
				"width: 240px",
				"background: #1e1e1e",
				"color: #eee",
				"font-family: system-ui, sans-serif",
				"font-size: 13px",
				"border-radius: 8px",
				"box-shadow: 0 4px 16px rgba(0,0,0,0.5)",
				"padding: 12px",
			].join(";");
			document.body.appendChild(panel);
		}

		panel.innerHTML = `
			<div style="font-weight:bold; margin-bottom:6px;">Chess Analyzer</div>
			<div style="margin-bottom:8px; opacity:0.8;">
				${result && result.title ? result.title : "Game over"}
				${result && result.subtitle ? " — " + result.subtitle : ""}
			</div>
			<button id="chess-analyzer-open-btn" style="width:100%; padding:6px; cursor:pointer;">
				Open Full Analysis
			</button>
		`;

		panel.querySelector("#chess-analyzer-open-btn").addEventListener("click", () => {
			chrome.storage.local.set(
				{ lastGame: { plies, pgn, result, savedAt: Date.now() } },
				() => window.open(chrome.runtime.getURL("analysis.html"), "_blank")
			);
		});
	}

	// --- Replay + game-over detection --------------------------------------

	function onGameOver() {
		const chess = new Chess();
		const plies = [];

		const result = getResultInfo();
		const sanMoves = scrapeSanMoves();

		console.log("[chess-analyzer] Game over detected", result);
		console.log("[chess-analyzer] Scraped SAN moves:", sanMoves);

		for (let i = 0; i < sanMoves.length; i++) {
			try {
				chess.move(sanMoves[i]);
				plies.push({ ply: i, san: sanMoves[i], fen: chess.fen() });
			} catch (e) {
				console.error(`[chess-analyzer] Error parsing move ${sanMoves[i]}`, e);
				break;
			}
		}

		const pgn = chess.pgn();

		console.log("[chess-analyzer] Built FEN list:", plies);
		console.log("[chess-analyzer] Built PGN:", pgn);

		showOpenAnalysisPrompt(result, pgn, plies);
	}

	const { Chess } = await import(chrome.runtime.getURL("vendor/chess.js"));

	const observer = new MutationObserver(() => {
		const header = document.querySelector(GAME_OVER_HEADER_SELECTOR);
		if (header) {
			if (!gameOverHandled) {
				gameOverHandled = true;
				onGameOver();
			}
		} else {
			gameOverHandled = false;
		}
	});

	observer.observe(document.body, { childList: true, subtree: true });

	console.log("[chess-analyzer] content script loaded, watching for game end");
})();
