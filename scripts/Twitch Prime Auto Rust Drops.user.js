// ==UserScript==
// @name         Twitch Prime Auto Rust Drops
// @homepage     https://twitch.facepunch.com/
// @version      1.2.0
// @downloadURL  https://github.com/ErikS270102/Tampermonkey-Scripts/raw/master/scripts/Twitch%20Prime%20Auto%20Rust%20Drops.user.js
// @description  Automatically switches to Rust Streamers that have Drops enabled if url has the "drops" parameter set. (Just klick on a Streamer on https://twitch.facepunch.com/)
// @author       Erik
// @match        https://www.twitch.tv/**
// @match        https://twitch.facepunch.com/*
// @noframes
// @require      https://openuserjs.org/src/libs/sizzle/GM_config.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.4.1/jquery.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.1/moment-with-locales.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/izitoast/1.4.0/js/iziToast.min.js
// @resource     iziToast https://cdnjs.cloudflare.com/ajax/libs/izitoast/1.4.0/css/iziToast.min.css
// @grant        GM_openInTab
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        GM_getResourceText
// @grant        GM_addStyle
// ==/UserScript==

const SVG_TOGGLE_DOWN = `<svg width="20px" height="20px" version="1.1" viewBox="0 0 20 20" x="0px" y="0px"><g><path d="M14.5 6.5L10 11 5.5 6.5 4 8l6 6 6-6-1.5-1.5z"></path></g></svg>`;
const SVG_TOGGLE_UP = `<svg width="20px" height="20px" version="1.1" viewBox="0 0 20 20" x="0px" y="0px"><g><path d="M5.5 13.5L10 9l4.5 4.5L16 12l-6-6-6 6 1.5 1.5z"></path></g></svg>`;

(async () => {
    "use strict";

    GM_addStyle(GM_getResourceText("iziToast"));

    GM_registerMenuCommand("Open Drops Page", () => {
        GM_openInTab("https://twitch.facepunch.com/", { active: true, insert: true });
    });

    GM_config.init({
        id: "Config",
        fields: {
            notifications: {
                label: "Enable Notifications",
                type: "checkbox",
                default: true
            }
        }
    });
    GM_registerMenuCommand("Settings", () => {
        GM_config.open();
    });

    window.hasPopup = false;
    window.popupShown = false;
    window.currentDrop = null;
    window.queryInterval = null;
    window.reloadTimeout = null;
    window.stopped = false;

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function onMessage(label, callback) {
        GM_addValueChangeListener(label, (name, old_value, new_value, remote) => {
            if (new_value != "MSG_CLEAR") callback(new_value);
        });
        sendMessage(label, "MSG_CLEAR");
    }

    function sendMessage(label, message) {
        GM_setValue(label, message);
        GM_setValue(label, "MSG_CLEAR");
    }

    function openQueryTabs() {
        GM_openInTab("https://twitch.facepunch.com/?checkonly", { active: false, insert: true });
        GM_openInTab("https://www.twitch.tv/drops/inventory?checkonly", { active: false, insert: true });
    }

    function stop() {
        window.stopped = true;
        clearInterval(window.queryInterval);
        clearTimeout(window.reloadTimeout);
    }

    function sendNotification(title, message, iconUrl, desktopNotification = true) {
        if (desktopNotification && GM_config.get("notifications")) GM_notification(title, message, iconUrl ?? "https://twitch.facepunch.com/favicon.png");
        // iziToast.show({
        //     title,
        //     message,
        //     iconUrl: "https://twitch.facepunch.com/favicon.png",
        //     color: "#9147ff",
        //     theme: "dark",
        //     layout: 2,
        //     position: "topCenter",
        //     timeout: 10000,
        //     transitionIn: "bounceInDown",
        //     transitionOut: "fadeOutUp"
        // });
    }

    function updatePopup(toggle = false) {
        if (!window.hasPopup) {
            GM_addStyle(`
                .rustdrops-popup {
                    position: absolute;
                    display: flex;
                    top: 6rem;
                    padding: 0.5rem;
                    width: 100%;
                    background-color: var(--color-background-base);
                    border-radius: var(--border-radius-large);
                    border: var(--border-width-default) solid var(--color-border-base);
                    box-shadow: var(--shadow-elevation-2);
                    color: var(--color-text-base);
                }

                .rustdrops-popup > .inner {
                    padding: 1rem;
                    width: 100%;
                }

                .rustdrops-popup .muted {
                    color: var(--color-text-alt-2) !important;
                }

                .rustdrops-popup p {
                    font-size: var(--font-size-5) !important;
                }

                .rustdrops-popup p.small {
                    font-size: var(--font-size-8) !important;
                }

                .rustdrops-popup-progress-container {
                    width: 100%;
                    display: grid;
                    grid-template-columns: auto 1fr;
                    gap: 0px 1rem;
                }

                .rustdrops-popup-progress-outer {
                    height: 0.5rem;
                    width: 100%;
                    margin: auto;
                    border-radius: var(--border-radius-large)!important;
                    background: var(--color-background-progress);
                    overflow: hidden;
                }

                .rustdrops-popup-progress-inner {
                    height: 100%;
                    background: var(--color-background-progress-status);
                }
            `);

            $(".top-nav__search-container").append(`
                <div class="rustdrops-popup">
                    <div class="inner">
                        <p class="small muted">${window.currentDrop.name}</p>
                        <div class="rustdrops-popup-progress-container">
                            <div class="rustdrops-popup-progress-text">0%</div>
                            <div class="rustdrops-popup-progress-outer"><div class="rustdrops-popup-progress-inner" style="width: 0%;"></div></div>
                        </div>
                    </div>
                </div>
            `);

            window.hasPopup = true;
        }

        if (!window.popupShown) {
            console.log(window.currentDrop);
            $(".rustdrops-popup-progress-text").text(`${window.currentDrop.percentage}%`);
            $(".rustdrops-popup-progress-inner").attr("style", `width: ${window.currentDrop.percentage}%;`);
            if (toggle) window.popupShown = true;
        } else {
            if (toggle) window.popupShown = false;
        }
    }

    $(async () => {
        const params = new URL(location.href).searchParams;
        if (location.host == "twitch.facepunch.com") {
            if (params.has("checkonly")) {
                const drops = $(".drop-name")
                    .toArray()
                    .map((name) => {
                        const parent = $(name).closest(".drop");
                        return { name: $(name).text(), url: parent.attr("href"), isTwitch: !parent.hasClass("generic"), isLive: parent.hasClass("is-live") };
                    });

                console.log(drops);
                sendMessage("drops", { type: "FACEPUNCH", drops });
                window.close();
            } else {
                $("section.streamer-drops a, section.general-drops a").map((i, elem) => {
                    const old = elem.getAttribute("href");
                    if (new URL(old).host != "www.youtube.com") elem.setAttribute("href", old + "?rustdrops");
                    return elem;
                });
            }
        } else if (location.href == "https://www.twitch.tv/drops/inventory?checkonly") {
            let tries = 0;
            do {
                if (tries == 100) location.reload();
                tries++;
                await sleep(100);
            } while ($(`[data-test-selector="drops-list__wrapper"] > .tw-tower > .tw-flex`).length == 0);
            await sleep(100);

            let claimed = false;
            $(`[data-test-selector="DropsCampaignInProgressRewardPresentation-claim-button"]`).each(function () {
                const parent = $(this).closest(".tw-flex-grow-1");
                sendMessage("drops", { type: "CLAIMED", name: parent.find(".tw-pd-1").text(), image: parent.find("img").attr("src") });
                $(this).trigger("click");
                claimed = true;
            });

            if (claimed) await sleep(4000);

            const lang = $(document.documentElement).attr("lang");
            const percentages = $(`[data-test-selector="DropsCampaignInProgressRewards-container"] > * > .tw-flex`)
                .toArray()
                .filter((e) => $(e).has(".tw-hidden").length == 0)
                .map((e) => {
                    return { name: $(e).find(".tw-flex p").text(), percentage: Number($(e).find(`[role="progressbar"]`).attr("aria-valuenow")) };
                });
            const drops = $(`[data-test-selector="drops-list__wrapper"] > .tw-tower > .tw-flex`)
                .toArray()
                .filter((e) => {
                    const agoArr = $(e).find(".tw-c-text-alt-2").first().text().split(" ");
                    let daysAgo = 0;
                    if (lang.startsWith("en-")) {
                        if (agoArr[0] == "yesterday") daysAgo = 1; // yesterday
                        if (agoArr.length == 2) daysAgo = Math.abs(moment().subtract(1, agoArr[1]).diff(moment(), "day")); // last year
                        if (agoArr.length == 3) daysAgo = Math.abs(moment().subtract(agoArr[0], agoArr[1]).diff(moment(), "day")); // 2 days ago
                    }
                    return $(e).find(`[data-test-selector="awarded-drop__game-name"]`).text() == "Rust" && daysAgo <= 8;
                })
                .map((e) => $(e).find(`[data-test-selector="awarded-drop__drop-name"]`).text());

            console.log(drops);
            sendMessage("drops", { type: "TWITCH", drops, percentages });
            window.close();
        } else if (location.host == "www.twitch.tv" && /^\/[a-z0-9]+$/i.test(location.pathname) && params.has("rustdrops")) {
            let alreadyQueried = {};
            let fpDrops = [];
            let twDrops = [];
            let remainingDrops = [];
            let remainingDropsLive = [];

            onMessage("drops", (msg) => {
                if (window.stopped) return;
                console.log("[Auto Rust Drops] MSG:", msg);
                if (msg.type == "CLAIMED") sendNotification("Drop Claimed!", `Claimed ${msg.name}!`, msg.image);
                if (msg.type == "FACEPUNCH") fpDrops = msg.drops;
                if (msg.type == "TWITCH") twDrops = msg.drops;

                if (msg.type == "FACEPUNCH" && fpDrops.length == 0) {
                    sendNotification("No Drops Available", "Didn't find any Drops", null, false);
                    stop();
                }

                if (msg.type == "TWITCH" && fpDrops.length > 0) {
                    if (!alreadyQueried.TWITCH) sendNotification("Watching for Drops", "Auto claiming/switching for Drops", null, false);

                    function rpl(s) {
                        return s.toLowerCase().replace(/[\/-_\s0-9]/g, "");
                    }
                    function rpl1st(s) {
                        return rpl(s.split(" ")[0]);
                    }
                    remainingDrops = fpDrops.filter((fp) => !twDrops.some((tw) => rpl(tw) == rpl(fp.name) || rpl1st(tw) == rpl1st(fp.name) || rpl(tw).startsWith(rpl(new URL(fp.url).pathname))));
                    remainingDropsLive = remainingDrops.filter((drop) => drop.isTwitch && drop.isLive);

                    const key = fpDrops.map((fp) => new URL(fp.url).pathname.substring(1)).join("-");
                    window.currentDrop = remainingDropsLive.find((drop) => new URL(drop.url).pathname == location.pathname);
                    if (window.currentDrop) window.currentDrop = { ...window.currentDrop, percentage: msg.percentages.find((obj) => obj.name == window.currentDrop.name).percentage };

                    updatePopup();

                    if (!window.currentDrop && remainingDrops.length > 0) {
                        if (remainingDropsLive.length > 0) {
                            location.assign(remainingDropsLive[0].url);
                        } else {
                            sendNotification("Nobody Online :(", `It seems like nobody with Drops is online. ${remainingDrops.length} Drops remaining`, null, false);
                        }
                    } else if (!window.currentDrop && remainingDrops.length == 0) {
                        if (GM_getValue("claimed", []).includes(key)) {
                            sendNotification("All Drops Claimed!", "Drops have already been claimed!", null, false);
                        } else {
                            sendNotification("All Drops Claimed!", "All Drops have been claimed!");
                            GM_setValue("claimed", [...GM_getValue("claimed", []), key]);
                        }

                        stop();
                    }
                }

                alreadyQueried[msg.type] = true;
            });

            openQueryTabs();
            window.queryInterval = setInterval(openQueryTabs, 5 * 60000); // Check for Drops every 5min
            window.reloadTimeout = setTimeout(location.reload, 30 * 60000); // Reload every 30min (Just to make sure Stream is Running)
        }
    });
})();
