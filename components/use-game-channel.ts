"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createInitialGame, GAME_CHANNEL, GAME_STORAGE_KEY } from "@/lib/game";
import type { GameSnapshot } from "@/lib/types";

function readStoredGame() {
  if (typeof window === "undefined") return createInitialGame();
  try {
    const stored = window.localStorage.getItem(GAME_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as GameSnapshot) : createInitialGame();
  } catch {
    return createInitialGame();
  }
}

export function useGameChannel(isOperator = false) {
  const [game, setGame] = useState<GameSnapshot>(createInitialGame);
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const loadFrame = window.requestAnimationFrame(() => setGame(readStoredGame()));
    if (!("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel(GAME_CHANNEL);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<GameSnapshot>) => {
      if (!isOperator) setGame(event.data);
    };
    return () => {
      window.cancelAnimationFrame(loadFrame);
      channel.close();
    };
  }, [isOperator]);

  useEffect(() => {
    if (isOperator) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === GAME_STORAGE_KEY && event.newValue) {
        setGame(JSON.parse(event.newValue) as GameSnapshot);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [isOperator]);

  const publish = useCallback((next: GameSnapshot) => {
    setGame(next);
    window.localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(next));
    channelRef.current?.postMessage(next);
  }, []);

  return { game, setGame: isOperator ? publish : setGame };
}
