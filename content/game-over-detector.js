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

		chrome.storage.local.set({ lastGame: { plies, pgn, result, savedAt: Date.now() } });
		chrome.runtime.sendMessage({ type: "chess-analyzer:game-over", result });
	}

	const { Chess } = await import(chrome.runtime.getURL("vendor/chess.js"));

	const observer = new MutationObserver(() => {
		const header = document.querySelector(GAME_OVER_HEADER_SELECTOR);
		if (header) {
			if (!gameOverHandled) {
				gameOverHandled = true;
				onGameOver();
			}
		} else if (gameOverHandled) {
			gameOverHandled = false;
			chrome.runtime.sendMessage({ type: "chess-analyzer:game-active" });
		}
	});

	observer.observe(document.body, { childList: true, subtree: true });

	console.log("[chess-analyzer] content script loaded, watching for game end");
})();
