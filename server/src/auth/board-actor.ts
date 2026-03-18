import type { Request } from "express";

export const LOCAL_BOARD_USER_ID = "local-board";

export function normalizeBoardUserId(
  userId: string | null | undefined
): string {
  return userId ?? LOCAL_BOARD_USER_ID;
}

export function getBoardActorUserId(req: Request): string {
  return normalizeBoardUserId(
    req.actor.type === "board" ? req.actor.userId : null
  );
}
