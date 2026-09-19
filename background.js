// Content scripts can't call chrome.action (icon-changing) at all -- that
// API only exists for a background service worker or an extension page.
// So the content script just sends a plain message describing what
// happened, and this worker is the one place that actually flips the icon
// and records whether there's a just-finished game ready to look at.

const GRAY_ICON = {
	16: "icons/icon-gray-16.png",
	32: "icons/icon-gray-32.png",
	48: "icons/icon-gray-48.png",
	128: "icons/icon-gray-128.png",
};

const GOLD_ICON = {
	16: "icons/icon-gold-16.png",
	32: "icons/icon-gold-32.png",
	48: "icons/icon-gold-48.png",
	128: "icons/icon-gold-128.png",
};

const GAME_OVER_NOTIFICATION_ID = "chess-analyzer-game-over";

chrome.runtime.onMessage.addListener((message) => {
	if (message.type === "chess-analyzer:game-over") {
		chrome.action.setIcon({ path: GOLD_ICON });
		chrome.storage.local.set({ readyToAnalyze: true });

		const result = message.result;
		chrome.notifications.create(GAME_OVER_NOTIFICATION_ID, {
			type: "basic",
			iconUrl: "icons/icon-gold-128.png",
			title: (result && result.title) || "Game finished",
			message: (result && result.subtitle) || "Click to review it with engine analysis.",
			priority: 1,
		});
	} else if (message.type === "chess-analyzer:game-active") {
		chrome.action.setIcon({ path: GRAY_ICON });
		chrome.storage.local.set({ readyToAnalyze: false });
	}
});

chrome.notifications.onClicked.addListener((notificationId) => {
	if (notificationId !== GAME_OVER_NOTIFICATION_ID) return;
	chrome.notifications.clear(notificationId);
	chrome.tabs.create({ url: chrome.runtime.getURL("analysis.html") });
});
