import { Chess } from "./vendor/chess.js";
import { Chessground } from "./vendor/chessground/chessground.js";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

let root = null;
let currentNode = null;
let ground = null;
let nextNodeId = 1;

function makeNode(fen, move, parent) {
	return { id: nextNodeId++, fen, move, parent, children: [], engineLines: null };
}

function buildTreeFromPlies(plies) {
	const rootNode = makeNode(START_FEN, null, null);
	let node = rootNode;
	for (const ply of plies) {
		const child = makeNode(ply.fen, ply.san, node);
		node.children.push(child);
		node = child;
	}
	return rootNode;
}

// --- Navigation -----------------------------------------------------------

function goTo(node) {
	currentNode = node;
	if (currentNode.parent) currentNode.parent.lastVisitedChildIndex = currentNode.parent.children.indexOf(currentNode);
	render();
}

function goBack() {
	if (currentNode.parent) goTo(currentNode.parent);
}

function goForward() {
	if (!currentNode.children.length) return;
	const idx = currentNode.lastVisitedChildIndex || 0;
	goTo(currentNode.children[idx] || currentNode.children[0]);
}

function goToStart() {
	goTo(root);
}

function mainLineEnd() {
	let node = root;
	while (node.children.length) node = node.children[0];
	return node;
}

function goToMainLineEnd() {
	goTo(mainLineEnd());
}

// --- Board ------------------------------------------------------------

function colorToMove(fen) {
	return fen.split(" ")[1] === "w" ? "white" : "black";
}

function legalDests(fen) {
	const chess = new Chess(fen);
	const dests = new Map();
	for (const m of chess.moves({ verbose: true })) {
		const list = dests.get(m.from) || [];
		list.push(m.to);
		dests.set(m.from, list);
	}
	return dests;
}

function onUserMove(orig, dest) {
	const chess = new Chess(currentNode.fen);
	let moveResult;
	try {
		moveResult = chess.move({ from: orig, to: dest, promotion: "q" });
	} catch (e) {
		render(); // illegal move somehow got through; snap the board back
		return;
	}

	const san = moveResult.san;
	let child = currentNode.children.find((c) => c.move === san);
	if (!child) {
		child = makeNode(chess.fen(), san, currentNode);
		currentNode.children.push(child);
	}
	goTo(child);
}

function renderBoard() {
	const config = {
		fen: currentNode.fen,
		turnColor: colorToMove(currentNode.fen),
		movable: {
			free: false,
			color: colorToMove(currentNode.fen),
			dests: legalDests(currentNode.fen),
			events: { after: onUserMove },
		},
		drawable: { enabled: true, autoShapes: [] },
	};

	if (!ground) {
		ground = Chessground(document.getElementById("board"), config);
	} else {
		ground.set(config);
	}
}

// --- Move tree sidebar ---------------------------------------------------

function renderTree() {
	const container = document.getElementById("move-tree");
	container.innerHTML = "";
	container.appendChild(renderLine(root));
}

function renderLine(startNode) {
	const wrap = document.createElement("div");
	let node = startNode;

	while (true) {
		if (node.move) {
			const span = document.createElement("span");
			span.className = "tree-node" + (node === currentNode ? " current" : "");
			span.textContent = node.move + " ";
			span.addEventListener("click", () => goTo(node));
			wrap.appendChild(span);
		}

		if (node.children.length > 1) {
			for (let i = 1; i < node.children.length; i++) {
				const branch = document.createElement("div");
				branch.className = "tree-children";
				branch.appendChild(renderLine(node.children[i]));
				wrap.appendChild(branch);
			}
		}

		if (node.children.length === 0) break;
		node = node.children[0];
	}

	return wrap;
}

// --- Engine ---------------------------------------------------------------


let stockfishWorker = null;
let activeSearch = null; // { resolve, linesByMultiPv } for the running search, or null if idle
let queuedRequest = null; // { fen, depth, resolve } waiting for the engine to go idle

function startSearch(fen, depth, resolve) {
	activeSearch = { resolve, linesByMultiPv: new Map() };
	stockfishWorker.postMessage(`position fen ${fen}`);
	stockfishWorker.postMessage(`go depth ${depth}`);
}

function getStockfishWorker() {
	if (stockfishWorker) return stockfishWorker;

	stockfishWorker = new Worker("vendor/stockfish.js");
	stockfishWorker.postMessage("uci");
	stockfishWorker.postMessage("setoption name MultiPV value 3");

	stockfishWorker.addEventListener("message", (event) => {
		const line = event.data;
		if (typeof line !== "string") return;

		if (activeSearch && line.startsWith("info") && line.includes(" pv ")) {
			const match = line.match(/multipv (\d+)/);
			const pvIndex = match ? parseInt(match[1], 10) : 1;
			activeSearch.linesByMultiPv.set(pvIndex, line);
		}

		if (line.startsWith("bestmove")) {
			if (activeSearch) {
				const sorted = Array.from(activeSearch.linesByMultiPv.entries())
					.sort((a, b) => a[0] - b[0])
					.map(([, text]) => text);
				activeSearch.resolve(sorted);
				activeSearch = null;
			}
			if (queuedRequest) {
				const { fen, depth, resolve } = queuedRequest;
				queuedRequest = null;
				startSearch(fen, depth, resolve);
			}
		}
	});

	return stockfishWorker;
}

function analyzePosition(fen, { depth = 16 } = {}) {
	getStockfishWorker();
	return new Promise((resolve) => {
		if (activeSearch) {
			queuedRequest = { fen, depth, resolve };
			stockfishWorker.postMessage("stop");
		} else {
			startSearch(fen, depth, resolve);
		}
	});
}

function parsePvFirstMove(infoLine) {
	const match = infoLine.match(/ pv (\S+)/);
	return match ? match[1] : null; // e.g. "e2e4"
}

function uciMoveToSan(fen, uciMove) {
	if (!uciMove || uciMove.length < 4) return uciMove || "?";
	try {
		const chess = new Chess(fen);
		const move = chess.move({
			from: uciMove.slice(0, 2),
			to: uciMove.slice(2, 4),
			promotion: uciMove.length > 4 ? uciMove[4] : undefined,
		});
		return move.san;
	} catch (e) {
		return uciMove; // shouldn't happen for a move the engine itself found legal
	}
}

function normalizeScore(infoLine, fen) {
	const sign = colorToMove(fen) === "white" ? 1 : -1;

	const mateMatch = infoLine.match(/score mate (-?\d+)/);
	if (mateMatch) {
		const mateIn = sign * parseInt(mateMatch[1], 10);
		return {
			display: `${mateIn >= 0 ? "+" : "-"}M${Math.abs(mateIn)}`,
			favorsWhite: mateIn > 0,
			whiteRelativeCp: null,
			mateFor: mateIn > 0 ? "white" : "black",
		};
	}

	const cpMatch = infoLine.match(/score cp (-?\d+)/);
	if (cpMatch) {
		const whiteRelativeCp = sign * parseInt(cpMatch[1], 10);
		const pawns = whiteRelativeCp / 100;
		return {
			display: `${pawns >= 0 ? "+" : ""}${pawns.toFixed(2)}`,
			favorsWhite: pawns >= 0,
			whiteRelativeCp,
			mateFor: null,
		};
	}

	return { display: "?", favorsWhite: null, whiteRelativeCp: null, mateFor: null };
}

function winPercentFromScore(score) {
	if (score.mateFor === "white") return 99;
	if (score.mateFor === "black") return 1;
	if (score.whiteRelativeCp == null) return 50;
	return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * score.whiteRelativeCp)) - 1);
}

function setEvalBar(winPercent) {
	const fill = document.getElementById("eval-bar-fill");
	if (!fill) return;
	fill.style.height = `${Math.max(1, Math.min(99, winPercent))}%`;
}

const RANK_LABELS = ["Best", "2nd best", "3rd best"];
const RANK_COLORS = ["#15781B", "#e68f00", "#003088"]; // chessground's green/yellow/blue brush hex
const ARROW_BRUSHES = ["green", "yellow", "blue"];

function renderEngineLines(lines, fen) {
	const engineDiv = document.getElementById("engine-lines");

	if (!lines.length) {
		engineDiv.textContent = "No lines returned";
		setEvalBar(50);
		return;
	}

	setEvalBar(winPercentFromScore(normalizeScore(lines[0], fen)));

	engineDiv.innerHTML = "";
	lines.forEach((line, i) => {
		const uciMove = parsePvFirstMove(line);
		const score = normalizeScore(line, fen);

		const row = document.createElement("div");
		row.className = "engine-line";

		const swatch = document.createElement("span");
		swatch.className = "engine-swatch";
		swatch.style.background = RANK_COLORS[i] || "#888";

		const rank = document.createElement("span");
		rank.className = "engine-rank";
		rank.textContent = RANK_LABELS[i] || `${i + 1}th`;

		const move = document.createElement("span");
		move.className = "engine-move";
		move.textContent = uciMoveToSan(fen, uciMove);

		const scoreEl = document.createElement("span");
		scoreEl.className =
			"engine-score " + (score.favorsWhite === null ? "neutral" : score.favorsWhite ? "positive" : "negative");
		scoreEl.textContent = score.display;

		row.append(swatch, rank, move, scoreEl);
		engineDiv.appendChild(row);
	});

	const shapes = lines
		.map((line, i) => {
			const uciMove = parsePvFirstMove(line);
			if (!uciMove || uciMove.length < 4) return null;
			return { orig: uciMove.slice(0, 2), dest: uciMove.slice(2, 4), brush: ARROW_BRUSHES[i] || "blue" };
		})
		.filter(Boolean);

	ground.setAutoShapes(shapes);
}

async function analyzeCurrentNode() {
	const node = currentNode;
	const engineDiv = document.getElementById("engine-lines");

	if (node.engineLines) {
		renderEngineLines(node.engineLines, node.fen);
		return;
	}

	engineDiv.textContent = "Analyzing…";
	setEvalBar(50);
	try {
		const lines = await analyzePosition(node.fen);
		if (node !== currentNode) return; 
		node.engineLines = lines;
		renderEngineLines(lines, node.fen);
	} catch (err) {
		engineDiv.textContent = "Engine error: " + err.message;
	}
}

// --- Top-level render -----------------------------------------------------

function render() {
	renderBoard();
	renderTree();
	analyzeCurrentNode();
}

// --- Controls ---------------------------------------------------------

document.getElementById("btn-first").addEventListener("click", goToStart);
document.getElementById("btn-prev").addEventListener("click", goBack);
document.getElementById("btn-next").addEventListener("click", goForward);
document.getElementById("btn-last").addEventListener("click", goToMainLineEnd);

document.addEventListener("keydown", (e) => {
	if (e.key === "ArrowLeft") goBack();
	else if (e.key === "ArrowRight") goForward();
});

// --- Boot -------------------------------------------------------------

chrome.storage.local.get("lastGame", ({ lastGame }) => {
	if (!lastGame) {
		document.getElementById("engine-lines").textContent = "No game data found.";
		return;
	}

	root = buildTreeFromPlies(lastGame.plies);
	currentNode = mainLineEnd(); // open on the final position, like a post-game review

	const resultText = lastGame.result
		? [lastGame.result.title, lastGame.result.subtitle].filter(Boolean).join(" — ")
		: "";
	document.getElementById("result-text").textContent = resultText;

	render();
});
