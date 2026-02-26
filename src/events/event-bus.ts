import type { ATSFEvent, ATSFEventType, EventBus, EventListener, Unsubscribe } from './types.js';

/**
 * Create a new EventBus instance.
 * Listener errors are caught and logged, never propagated.
 */
export function createEventBus(): EventBus {
  const listeners = new Map<string, Set<EventListener<ATSFEventType>>>();

  function getOrCreate(type: string): Set<EventListener<ATSFEventType>> {
    let set = listeners.get(type);
    if (!set) {
      set = new Set();
      listeners.set(type, set);
    }
    return set;
  }

  return {
    on<T extends ATSFEventType>(type: T, listener: EventListener<T>): Unsubscribe {
      const set = getOrCreate(type);
      set.add(listener as EventListener<ATSFEventType>);
      return () => {
        set.delete(listener as EventListener<ATSFEventType>);
      };
    },

    once<T extends ATSFEventType>(type: T, listener: EventListener<T>): Unsubscribe {
      const wrapped: EventListener<T> = (event) => {
        unsub();
        return listener(event);
      };
      const set = getOrCreate(type);
      set.add(wrapped as EventListener<ATSFEventType>);
      const unsub = () => {
        set.delete(wrapped as EventListener<ATSFEventType>);
      };
      return unsub;
    },

    emit(event: ATSFEvent): void {
      const set = listeners.get(event.type);
      if (!set) return;
      for (const listener of set) {
        try {
          listener(event);
        } catch {
          // Design principle: listener errors are logged, not propagated
        }
      }
    },

    removeAllListeners(): void {
      listeners.clear();
    },
  };
}
