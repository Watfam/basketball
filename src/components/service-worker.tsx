"use client";

import { useEffect } from "react";
import pkg from "../../package.json";
import { MODEL_VERSION } from "@/lib/vision/lab-calls";

/** The runtime and model versions name the cache (public/sw.js). */
const VERSION = `${pkg.dependencies["onnxruntime-web"]}-${MODEL_VERSION}`;

/**
 * Registers public/sw.js, which keeps the camera model and runtime on the
 * phone. Production only: in development it would hold on to files that
 * are being changed.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(VERSION)}`).catch(() => {
      // Without it the camera still works; it just downloads the model again.
    });
  }, []);
  return null;
}
