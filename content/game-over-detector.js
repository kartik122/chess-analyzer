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
				if (span) sanMoves.push(span.textContent.trim());
			}
		}

		return sanMoves;
	}

	function getResultInfo() {
		const header = document.querySelector(GAME_OVER_HEADER_SELECTOR);
		if (!header) return null;

		// e.g. "game-over-modal-header-component game-over-modal-header-whiteWon"
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

		// Next steps (not yet implemented):
		// 1. Inject an "Analyze Game" button into the page.
		// 2. On click, spin up Stockfish in a Web Worker and run MultiPV analysis.
		// 3. Render a chessground board + arrow-key navigation over the FEN list.
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
