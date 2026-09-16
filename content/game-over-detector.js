(async function() {
	const GAME_OVER_HEADER_SELECTOR = ".game-over-modal-header-component";
	const MOVE_LIST_SELECTOR = "wc-simple-move-list";

	let gameOverHandled = false;

	let currentPlies = [];
	let currentPlyIndex = 0;

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

	// --- Step 3: on-page panel -------------------------------------------

	function ensurePanel() {
		let panel = document.getElementById("chess-analyzer-panel");
		if (panel) return panel;

		panel = document.createElement("div");
		panel.id = "chess-analyzer-panel";
		panel.style.cssText = [
			"position: fixed",
			"top: 16px",
			"right: 16px",
			"z-index: 999999",
			"width: 260px",
			"background: #1e1e1e",
			"color: #eee",
			"font-family: system-ui, sans-serif",
			"font-size: 13px",
			"border-radius: 8px",
			"box-shadow: 0 4px 16px rgba(0,0,0,0.5)",
			"padding: 12px",
		].join(";");

		document.body.appendChild(panel);
		return panel;
	}

	function renderCurrentPly(panel) {
		const ply = currentPlies[currentPlyIndex];
		if (!ply) return;

		panel.querySelector("#chess-analyzer-position").textContent =
			`Move ${currentPlyIndex + 1} / ${currentPlies.length}`;
		panel.querySelector("#chess-analyzer-san").textContent = `SAN: ${ply.san}`;
		panel.querySelector("#chess-analyzer-fen").textContent = ply.fen;

		const engineDiv = panel.querySelector("#chess-analyzer-engine");
		engineDiv.textContent = "Engine: not analyzed yet";
	}

	async function onAnalyzeClicked(panel) {
		const viewer = panel.querySelector("#chess-analyzer-viewer");
		viewer.style.display = "block";
		currentPlyIndex = currentPlies.length - 1; // start at the final position
		renderCurrentPly(panel);

		// --- Step 4 (pending a vendored engine): Stockfish analysis -------
		// Once you've vendored a Stockfish WASM build at vendor/stockfish.js,
		// analyzePosition() below will actually run. Until then this just
		// reports that the engine isn't available yet, instead of throwing.
		const engineDiv = panel.querySelector("#chess-analyzer-engine");
		try {
			engineDiv.textContent = "Engine: thinking...";
			const lines = await analyzePosition(currentPlies[currentPlyIndex].fen);
			engineDiv.textContent = lines.length
				? lines.join("\n")
				: "Engine: no lines returned";
		} catch (err) {
			console.warn("[chess-analyzer] Stockfish not available yet:", err);
			engineDiv.textContent = "Engine: not vendored yet (see docs/DOM-NOTES.md)";
		}
	}

	function showAnalysisPanel(result, plies) {
		currentPlies = plies;

		const panel = ensurePanel();
		panel.innerHTML = `
			<div style="font-weight:bold; margin-bottom:6px;">Chess Analyzer</div>
			<div style="margin-bottom:8px; opacity:0.8;">
				${result && result.title ? result.title : "Game over"}
				${result && result.subtitle ? " — " + result.subtitle : ""}
			</div>
			<button id="chess-analyzer-analyze-btn" style="width:100%; padding:6px; cursor:pointer;">
				Analyze Game
			</button>
			<div id="chess-analyzer-viewer" style="display:none; margin-top:10px;">
				<div id="chess-analyzer-position" style="margin-bottom:4px;"></div>
				<div id="chess-analyzer-san" style="margin-bottom:4px;"></div>
				<div id="chess-analyzer-fen" style="font-family:monospace; font-size:11px; word-break:break-all; opacity:0.7; margin-bottom:8px;"></div>
				<div id="chess-analyzer-engine" style="white-space:pre-wrap; font-family:monospace; font-size:11px; opacity:0.85; margin-bottom:8px;"></div>
				<div style="font-size:11px; opacity:0.6;">Use ← → to step through moves</div>
			</div>
		`;

		panel
			.querySelector("#chess-analyzer-analyze-btn")
			.addEventListener("click", () => onAnalyzeClicked(panel));
	}

	// Single keydown listener for the whole page lifetime -- reads whatever
	// game's plies are currently loaded via the shared currentPlies/currentPlyIndex
	// state above, so it keeps working correctly across multiple games without
	// needing to be re-registered each time.
	document.addEventListener("keydown", (e) => {
		const panel = document.getElementById("chess-analyzer-panel");
		const viewer = panel && panel.querySelector("#chess-analyzer-viewer");
		if (!viewer || viewer.style.display === "none") return;
		if (currentPlies.length === 0) return;

		if (e.key === "ArrowLeft" && currentPlyIndex > 0) {
			currentPlyIndex--;
			renderCurrentPly(panel);
		} else if (e.key === "ArrowRight" && currentPlyIndex < currentPlies.length - 1) {
			currentPlyIndex++;
			renderCurrentPly(panel);
		}
	});

	// --- Step 4: Stockfish (requires vendor/stockfish.js to exist) --------

	let stockfishWorker = null;

	function getStockfishWorker() {
		if (stockfishWorker) return stockfishWorker;
		stockfishWorker = new Worker(chrome.runtime.getURL("vendor/stockfish.js"));
		return stockfishWorker;
	}

	function analyzePosition(fen, { multiPv = 3, depth = 15 } = {}) {
		return new Promise((resolve, reject) => {
			let worker;
			try {
				worker = getStockfishWorker();
			} catch (err) {
				reject(err);
				return;
			}

			const linesByMultiPv = new Map();

			function handleMessage(event) {
				const line = event.data;
				if (typeof line !== "string") return;

				if (line.startsWith("info") && line.includes(" pv ")) {
					const match = line.match(/multipv (\d+)/);
					const pvIndex = match ? parseInt(match[1], 10) : 1;
					linesByMultiPv.set(pvIndex, line);
				}

				if (line.startsWith("bestmove")) {
					worker.removeEventListener("message", handleMessage);
					const sorted = Array.from(linesByMultiPv.entries())
						.sort((a, b) => a[0] - b[0])
						.map(([, text]) => text);
					resolve(sorted);
				}
			}

			worker.addEventListener("message", handleMessage);
			worker.addEventListener("error", reject, { once: true });

			worker.postMessage("uci");
			worker.postMessage(`setoption name MultiPV value ${multiPv}`);
			worker.postMessage("isready");
			worker.postMessage(`position fen ${fen}`);
			worker.postMessage(`go depth ${depth}`);
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

		showAnalysisPanel(result, plies);
	}

	const { Chess } = await import(chrome.runtime.getURL("vendor/chess.js"));

	// The play/computer page is a single-page app: starting a new game after
	// one ends does NOT reload the page, so we can't just fire once and
	// disconnect. Instead we treat the modal's presence as an edge: react
	// when it appears (game just ended), and reset the flag when it
	// disappears (New Game clicked / modal closed -> ready to detect the
	// next game's end too).
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
