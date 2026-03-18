import { EventEmitter } from "node:events";
import type { LiveEvent, LiveEventType } from "@paperclipai/shared";
import type { LiveEventAudience } from "@paperclipai/shared";

type LiveEventPayload = Record<string, unknown>;
type LiveEventListener = (event: LiveEvent) => void;

export interface LiveEventSubscriber {
  companyId: string;
  actorType: "board" | "agent" | "system";
  actorId: string;
}

export interface PublishLiveEventInput {
  companyId: string;
  type: LiveEventType;
  payload?: LiveEventPayload;
  audience?: Partial<LiveEventAudience> | null;
}

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

let nextEventId = 0;
let conversationLiveEventPublishingEnabled = false;

function defaultAudience(
  audience?: Partial<LiveEventAudience> | null
): LiveEventAudience {
  return {
    scope: audience?.scope ?? "company",
    conversationId: audience?.conversationId ?? null,
    participantAgentIds: audience?.participantAgentIds ?? null,
  };
}

function isConversationLiveEventType(type: LiveEventType) {
  return type.startsWith("conversation.");
}

function canPublishLiveEvent(type: LiveEventType) {
  return (
    !isConversationLiveEventType(type) || conversationLiveEventPublishingEnabled
  );
}

function canDeliverEventToSubscriber(
  subscriber: LiveEventSubscriber,
  event: LiveEvent
) {
  if (event.audience.scope === "company") return true;
  if (subscriber.actorType === "board") return true;
  if (subscriber.actorType !== "agent") return false;
  return (event.audience.participantAgentIds ?? []).includes(
    subscriber.actorId
  );
}

function toLiveEvent(input: {
  companyId: string;
  type: LiveEventType;
  payload?: LiveEventPayload;
  audience?: Partial<LiveEventAudience> | null;
}): LiveEvent {
  nextEventId += 1;
  return {
    id: nextEventId,
    companyId: input.companyId,
    type: input.type,
    createdAt: new Date().toISOString(),
    audience: defaultAudience(input.audience),
    payload: input.payload ?? {},
  };
}

export function setConversationLiveEventPublishingEnabled(enabled: boolean) {
  conversationLiveEventPublishingEnabled = enabled;
}

export function areConversationLiveEventPublishingEnabled() {
  return conversationLiveEventPublishingEnabled;
}

export function publishLiveEvent(input: PublishLiveEventInput) {
  if (!canPublishLiveEvent(input.type)) return null;
  const event = toLiveEvent(input);
  emitter.emit(input.companyId, event);
  return event;
}

export function publishGlobalLiveEvent(input: {
  type: LiveEventType;
  payload?: LiveEventPayload;
}) {
  if (!canPublishLiveEvent(input.type)) return null;
  const event = toLiveEvent({
    companyId: "*",
    type: input.type,
    payload: input.payload,
  });
  emitter.emit("*", event);
  return event;
}

export function subscribeRawCompanyLiveEvents(
  companyId: string,
  listener: LiveEventListener
) {
  emitter.on(companyId, listener);
  return () => emitter.off(companyId, listener);
}

export function subscribeCompanyLiveEvents(
  subscriber: LiveEventSubscriber,
  listener: LiveEventListener
) {
  const wrappedListener = (event: LiveEvent) => {
    if (!canDeliverEventToSubscriber(subscriber, event)) return;
    listener(event);
  };
  emitter.on(subscriber.companyId, wrappedListener);
  return () => emitter.off(subscriber.companyId, wrappedListener);
}

export function subscribeGlobalLiveEvents(listener: LiveEventListener) {
  emitter.on("*", listener);
  return () => emitter.off("*", listener);
}
