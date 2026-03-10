import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { createPluginHostServiceCleanup } from "../services/plugin-host-service-cleanup.js";

function createLifecycleStub() {
  const emitter = new EventEmitter();
  return {
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    emit<K extends "plugin.worker_stopped" | "plugin.unloaded">(
      event: K,
      payload: { pluginId: string },
    ) {
      emitter.emit(event, payload);
    },
  };
}

describe("createPluginHostServiceCleanup", () => {
  it("disposes active host services when a worker crashes", () => {
    const lifecycle = createLifecycleStub();
    const dispose = vi.fn();
    const controller = createPluginHostServiceCleanup(
      lifecycle as any,
      new Map([["plugin-1", dispose]]),
    );

    controller.handleWorkerEvent({
      type: "plugin.worker.crashed",
      pluginId: "plugin-1",
    });

    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes active host services when the lifecycle reports worker stop", () => {
    const lifecycle = createLifecycleStub();
    const dispose = vi.fn();
    const controller = createPluginHostServiceCleanup(
      lifecycle as any,
      new Map([["plugin-1", dispose]]),
    );

    lifecycle.emit("plugin.worker_stopped", { pluginId: "plugin-1" });

    expect(dispose).toHaveBeenCalledTimes(1);
    controller.teardown();
  });

  it("disposes and removes entries when a plugin is unloaded", () => {
    const lifecycle = createLifecycleStub();
    const dispose = vi.fn();
    const disposers = new Map([["plugin-1", dispose]]);
    createPluginHostServiceCleanup(lifecycle as any, disposers);

    lifecycle.emit("plugin.unloaded", { pluginId: "plugin-1" });

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(disposers.has("plugin-1")).toBe(false);
  });

  it("tears down lifecycle listeners cleanly", () => {
    const lifecycle = createLifecycleStub();
    const dispose = vi.fn();
    const controller = createPluginHostServiceCleanup(
      lifecycle as any,
      new Map([["plugin-1", dispose]]),
    );

    controller.teardown();
    lifecycle.emit("plugin.worker_stopped", { pluginId: "plugin-1" });
    lifecycle.emit("plugin.unloaded", { pluginId: "plugin-1" });

    expect(dispose).not.toHaveBeenCalled();
  });

  it("disposeAll flushes every disposer and clears the registry", () => {
    const lifecycle = createLifecycleStub();
    const disposeA = vi.fn();
    const disposeB = vi.fn();
    const disposers = new Map([
      ["plugin-1", disposeA],
      ["plugin-2", disposeB],
    ]);
    const controller = createPluginHostServiceCleanup(lifecycle as any, disposers);

    controller.disposeAll();

    expect(disposeA).toHaveBeenCalledTimes(1);
    expect(disposeB).toHaveBeenCalledTimes(1);
    expect(disposers.size).toBe(0);
    controller.teardown();
  });
});
