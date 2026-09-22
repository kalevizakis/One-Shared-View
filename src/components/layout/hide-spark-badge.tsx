"use client";

import { useEffect } from "react";

const LOCKUP = /built by\s+spark/i;

/**
 * Spark Build injects a floating "Built by Spark" lockup into hosted previews.
 * It is not part of this application and must not appear on the leadership
 * readout (on screen or in Print / PDF). The host markup is not in this repo,
 * so we hide any short lockup after it lands in the document.
 */
function hideLockups(root: ParentNode) {
  const nodes = root.querySelectorAll("a, button, div, span, p");
  for (const node of nodes) {
    const text = node.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (!LOCKUP.test(text) || text.length > 48) continue;

    const host =
      (node as HTMLElement).closest(
        '[class*="fixed"], [style*="fixed"], [style*="position: fixed"]',
      ) ?? node;
    const element = host as HTMLElement;
    element.style.setProperty("display", "none", "important");
    element.setAttribute("data-print", "hide");
    element.setAttribute("aria-hidden", "true");
  }

  if (root instanceof Element && root.shadowRoot) {
    hideLockups(root.shadowRoot);
  }
  root.querySelectorAll("*").forEach((child) => {
    if (child.shadowRoot) hideLockups(child.shadowRoot);
  });
}

export function HideSparkBadge() {
  useEffect(() => {
    hideLockups(document);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const added of mutation.addedNodes) {
          if (added instanceof HTMLElement) hideLockups(added);
        }
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, []);

  return null;
}
