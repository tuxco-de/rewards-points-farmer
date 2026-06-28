// @ts-nocheck
import { store } from './state';
import { updateCountdown } from './ui/panel';

export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function waitForElement(selector, timeout = 5000, context = document) {
    let el = context.querySelector(selector);
    if (el) return el;
    return new Promise(resolve => {
        const observer = new MutationObserver((mutations, obs) => {
            const el = context.querySelector(selector);
            if (el) {
                obs.disconnect();
                resolve(el);
            }
        });
        observer.observe(context.body || context, { childList: true, subtree: true });
        if (timeout > 0) {
            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        }
    });
}

export function isDarkMode() {
    return document.documentElement.classList.contains('dark') || 
           document.documentElement.getAttribute('data-darkmode') === '1' ||
           document.body.classList.contains('b_dark') ||
           window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function getRandomInterval() {
    const min = 5000;
    const max = 10000;
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function countdownAsync(seconds, action) {
    store.searchState.currentAction = action;
    store.searchState.countdown = seconds;
    
    while (store.searchState.countdown > 0 && store.isSearching) {
        updateCountdown(store.searchState.countdown, action);
        await sleep(1000);
        store.searchState.countdown--;
    }
    updateCountdown(0, '');
}

export function startCountdown(seconds, action, callback) {
    if (store.countdownTimer) {
        clearInterval(store.countdownTimer);
        store.countdownTimer = null;
    }

    store.searchState.currentAction = action;
    store.searchState.countdown = seconds;

    updateCountdown(seconds, action);

    store.countdownTimer = setInterval(() => {
        store.searchState.countdown--;
        updateCountdown(store.searchState.countdown, action);

        if (store.searchState.countdown <= 0) {
            clearInterval(store.countdownTimer);
            store.countdownTimer = null;
            if (callback) callback();
        }
    }, 1000);
}
